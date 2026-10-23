/**
 * Autenticação Firebase + resolução do perfil interno (ensureProfile) e da
 * conta do portal. As regras do Firestore conferem tudo o que é gravado aqui.
 */
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import { doc, getDoc, runTransaction, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { SETTINGS_ID, withDefaults } from '@shared/app/settings';
import type { AuthApi, AuthUser, PortalResolution, ProfileResolution, SignUpPortalInput } from '@shared/data/api';
import { nowIso, stripUndefined } from '@shared/data/query';
import { companyFromEmail, isCorporateEmail } from '@shared/domain/permissions';
import type { AppSettings, Invite, PortalAccount, PortalInvite, Profile, Role } from '@shared/domain/types';
import { errorCode, friendlyError, fromSnap, type SessionScope } from './firebase-util';

const CANCELLED_POPUP = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];
const USE_REDIRECT = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'];

const toAuthUser = (u: User | null): AuthUser | null =>
  u ? { id: u.uid, email: (u.email || '').toLowerCase(), name: u.displayName, photoUrl: u.photoURL } : null;

const denied = (reason: 'NOT_INVITED' | 'BLOCKED' | 'UNVERIFIED' | 'ERROR', message: string): ProfileResolution => ({
  status: 'denied',
  reason,
  message,
});

export class FirebaseAuthApi implements AuthApi {
  private listeners = new Set<(u: AuthUser | null) => void>();
  private initialized = false;
  /** Enquanto > 0, a troca de usuário não é avisada às telas (cadastro em andamento). */
  private holdDepth = 0;
  private held = false;
  private verificationSent = new Set<string>();
  private google = new GoogleAuthProvider();

  constructor(
    private auth: Auth,
    private db: Firestore,
    private scope: SessionScope,
  ) {
    this.google.setCustomParameters({ prompt: 'select_account' });
    onAuthStateChanged(auth, (u) => {
      this.initialized = true;
      const s = scope.get();
      if (s.kind !== 'none' && s.uid !== u?.uid) scope.set({ kind: 'none' });
      if (this.holdDepth > 0) {
        this.held = true;
        return;
      }
      this.emit();
    });
    // Conclui um login por redirecionamento (quando o pop-up foi bloqueado).
    getRedirectResult(auth).catch((e) => console.warn('[firebase] login por redirecionamento:', errorCode(e) || e));
  }

  private emit() {
    const u = toAuthUser(this.auth.currentUser);
    this.listeners.forEach((cb) => cb(u));
  }

  /** Segura o aviso de "usuário mudou" até terminar de gravar nome/conta. */
  private async holding<T>(fn: () => Promise<T>): Promise<T> {
    this.holdDepth++;
    try {
      return await fn();
    } finally {
      this.holdDepth--;
      if (this.holdDepth === 0 && this.held) {
        this.held = false;
        this.emit();
      }
    }
  }

  current(): AuthUser | null {
    return toAuthUser(this.auth.currentUser);
  }

  /** O Firebase restaura a sessão de forma assíncrona: o 1º aviso sai quando ela estiver pronta. */
  onChange(cb: (user: AuthUser | null) => void): () => void {
    this.listeners.add(cb);
    if (this.initialized && this.holdDepth === 0) cb(this.current());
    return () => this.listeners.delete(cb);
  }

  async signInWithGoogle(): Promise<void> {
    try {
      await signInWithPopup(this.auth, this.google);
    } catch (e) {
      const code = errorCode(e);
      if (CANCELLED_POPUP.includes(code)) return;
      if (USE_REDIRECT.includes(code)) {
        await signInWithRedirect(this.auth, this.google).catch((err) => {
          throw friendlyError(err);
        });
        return;
      }
      throw friendlyError(e);
    }
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    try {
      await signInWithEmailAndPassword(this.auth, email.trim().toLowerCase(), password);
    } catch (e) {
      throw friendlyError(e);
    }
  }

  async signUpWithPassword(email: string, password: string, name: string): Promise<void> {
    try {
      await this.holding(async () => {
        const cred = await createUserWithEmailAndPassword(this.auth, email.trim().toLowerCase(), password);
        if (name?.trim()) await updateProfile(cred.user, { displayName: name.trim() }).catch((e) => console.warn(e));
        await sendEmailVerification(cred.user)
          .then(() => this.verificationSent.add(cred.user.uid))
          .catch((e) => console.warn('[firebase] e-mail de confirmação:', errorCode(e) || e));
      });
    } catch (e) {
      throw friendlyError(e);
    }
  }

  async sendPasswordReset(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.auth, email.trim().toLowerCase());
    } catch (e) {
      throw friendlyError(e);
    }
  }

  async signOut(): Promise<void> {
    // O escopo volta a "none" no aviso de troca de usuário (onAuthStateChanged).
    await fbSignOut(this.auth);
  }

  // --------------------------------------------------------------------------
  // Perfil interno
  // --------------------------------------------------------------------------

  async ensureProfile(): Promise<ProfileResolution> {
    const u = this.auth.currentUser;
    if (!u) return denied('ERROR', 'Sem sessão.');
    const email = (u.email || '').toLowerCase();
    try {
      const ref = doc(this.db, 'profiles', u.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) return this.loginExisting(fromSnap<Profile>(snap));

      if (!email) return denied('ERROR', 'Sua conta não tem e-mail. Entre com e-mail e senha.');
      // Convite, domínio e primeiro acesso exigem e-mail confirmado (as regras conferem).
      if (!(await this.emailVerified(u))) {
        return denied(
          'UNVERIFIED',
          `Enviamos um link para ${email}. Abra o e-mail, clique no link e depois volte aqui.`,
        );
      }

      // 1) Convite pendente → papel do convite.
      const inviteRef = doc(this.db, 'invites', email);
      const inv = await getDoc(inviteRef);
      if (inv.exists() && (inv.data() as Invite).status === 'PENDING') {
        const invite = fromSnap<Invite>(inv);
        const profile = this.newProfile(u, invite.role, {
          name: invite.name,
          phone: invite.phone ?? null,
          commissionRate: invite.commissionRate ?? null,
        });
        const now = profile.createdAt;
        const batch = writeBatch(this.db);
        batch.set(ref, stripUndefined(profile));
        batch.update(inviteRef, { status: 'ACCEPTED', acceptedAt: now, profileId: u.uid, updatedAt: now });
        await batch.commit();
        return this.ok(profile);
      }

      // Conta de cliente do portal não vira usuário interno.
      const portal = await getDoc(doc(this.db, 'portal_accounts', u.uid));
      if (portal.exists()) {
        return denied('NOT_INVITED', 'Este e-mail está cadastrado como cliente do Portal. Entre pelo Portal do Cliente.');
      }

      // 2) Primeiro acesso do sistema → ADMIN (cria settings/main com bootstrapped = true na mesma transação).
      const settingsRef = doc(this.db, 'settings', SETTINGS_ID);
      let settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists() || settingsSnap.data().bootstrapped !== true) {
        const admin = await runTransaction(this.db, async (t) => {
          const cur = await t.get(settingsRef);
          if (cur.exists() && cur.data().bootstrapped === true) return null; // outra pessoa chegou antes
          const now = nowIso();
          const prev = cur.exists() ? fromSnap<AppSettings>(cur) : null;
          const settings: AppSettings = {
            ...withDefaults(prev),
            id: SETTINGS_ID,
            createdAt: prev?.createdAt || now,
            updatedAt: now,
            bootstrapped: true,
          };
          const profile = this.newProfile(u, 'ADMIN');
          t.set(settingsRef, stripUndefined(settings));
          t.set(ref, stripUndefined(profile));
          return profile;
        });
        if (admin) return this.ok(admin);
        settingsSnap = await getDoc(settingsRef);
      }

      // 3) Domínio corporativo → OPERATOR.
      const settings = withDefaults(settingsSnap.exists() ? fromSnap<AppSettings>(settingsSnap) : null);
      if (isCorporateEmail(email, settings.corporateDomains)) {
        const profile = this.newProfile(u, 'OPERATOR');
        await setDoc(ref, stripUndefined(profile));
        return this.ok(profile);
      }

      return denied('NOT_INVITED', `O e-mail ${email} ainda não tem acesso ao sistema. Peça um convite ao administrador.`);
    } catch (e) {
      console.error('[firebase] ensureProfile:', e);
      return denied('ERROR', friendlyError(e).message);
    }
  }

  private loginExisting(p: Profile): ProfileResolution {
    if (!p.active) return denied('BLOCKED', 'Seu acesso está bloqueado. Fale com o administrador do sistema.');
    const patch = { lastLoginAt: nowIso(), loginCount: (p.loginCount || 0) + 1 };
    // Sem await: offline, a gravação fica na fila e não deve travar a entrada.
    updateDoc(doc(this.db, 'profiles', p.id), patch).catch((e) => console.warn('[firebase] último acesso:', errorCode(e) || e));
    return this.ok({ ...p, ...patch });
  }

  private ok(profile: Profile): ProfileResolution {
    this.scope.set(
      profile.role === 'EXTERNAL_SELLER'
        ? { kind: 'external', uid: profile.id }
        : { kind: 'staff', uid: profile.id, role: profile.role },
    );
    return { status: 'ok', profile };
  }

  private newProfile(
    u: User,
    role: Role,
    extra?: { name?: string | null; phone?: string | null; commissionRate?: number | null },
  ): Profile {
    const now = nowIso();
    const email = (u.email || '').toLowerCase();
    return {
      id: u.uid,
      createdAt: now,
      updatedAt: now,
      email,
      name: extra?.name?.trim() || u.displayName || email.split('@')[0],
      role,
      active: true,
      company: companyFromEmail(email),
      phone: extra?.phone ?? null,
      document: null,
      commissionRate: extra?.commissionRate ?? null,
      lastLoginAt: now,
      loginCount: 1,
      notes: null,
    };
  }

  /** E-mail confirmado? Recarrega o usuário e renova o token se acabou de confirmar. */
  private async emailVerified(u: User): Promise<boolean> {
    if (u.emailVerified) return true;
    await reload(u).catch(() => undefined);
    if (u.emailVerified) {
      await u.getIdToken(true); // o token novo leva email_verified = true para as regras
      return true;
    }
    const usesPassword = u.providerData.some((p) => p.providerId === 'password');
    if (usesPassword && !this.verificationSent.has(u.uid)) {
      this.verificationSent.add(u.uid);
      await sendEmailVerification(u).catch((e) => console.warn('[firebase] e-mail de confirmação:', errorCode(e) || e));
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Portal do cliente
  // --------------------------------------------------------------------------

  async getPortalAccount(): Promise<PortalResolution> {
    const u = this.auth.currentUser;
    if (!u) return { status: 'none' };
    try {
      const ref = doc(this.db, 'portal_accounts', u.uid);
      const snap = await getDoc(ref);
      let account = snap.exists() ? fromSnap<PortalAccount>(snap) : null;
      let notice: string | null = null;
      // Convite da equipe (portal_invites/{e-mail}): libera a conta no primeiro acesso.
      if (!account || account.status === 'PENDING') {
        const invite = await this.pendingPortalInvite(u);
        if (invite) {
          if (await this.emailVerified(u)) account = await this.claimPortalInvite(u, invite, account);
          else
            notice = `Você já tem acesso liberado pela nossa equipe. Para ativar, confirme o seu e-mail: enviamos um link para ${(u.email || '').toLowerCase()}. Depois toque em "Verificar novamente".`;
          if (!account) {
            // Ainda sem e-mail confirmado: cria a conta em análise com os dados do convite.
            const now = nowIso();
            const pending: PortalAccount = {
              id: u.uid,
              createdAt: now,
              updatedAt: now,
              email: (u.email || '').toLowerCase(),
              name: invite.name || u.displayName || invite.customerName,
              phone: invite.phone ?? null,
              companyName: invite.customerName,
              personType: invite.document ? (invite.document.length > 11 ? 'J' : 'F') : null,
              document: invite.document ?? null,
              status: 'PENDING',
              customerId: null,
            };
            await setDoc(ref, stripUndefined(pending));
            account = pending;
          }
        }
      }
      if (!account) return { status: 'none' };
      this.scope.set({ kind: 'portal', uid: u.uid, customerId: account.customerId ?? null });
      updateDoc(ref, { lastLoginAt: nowIso() }).catch((e) => console.warn('[firebase] último acesso (portal):', errorCode(e) || e));
      return { status: 'ok', account, notice };
    } catch (e) {
      return { status: 'error', message: friendlyError(e).message };
    }
  }

  private async pendingPortalInvite(u: User): Promise<PortalInvite | null> {
    const email = (u.email || '').toLowerCase();
    if (!email) return null;
    try {
      const s = await getDoc(doc(this.db, 'portal_invites', email));
      const inv = s.exists() ? fromSnap<PortalInvite>(s) : null;
      return inv && inv.status === 'PENDING' ? inv : null;
    } catch {
      return null;
    }
  }

  /** Cria/aprova a conta pelo convite (as regras conferem e-mail confirmado e o cliente do convite). */
  private async claimPortalInvite(u: User, invite: PortalInvite, current: PortalAccount | null): Promise<PortalAccount> {
    const now = nowIso();
    const email = (u.email || '').toLowerCase();
    const ref = doc(this.db, 'portal_accounts', u.uid);
    const batch = writeBatch(this.db);
    let account: PortalAccount;
    if (current) {
      const patch = { status: 'APPROVED' as const, customerId: invite.customerId, approvedByName: 'Convite do portal', approvedAt: now, updatedAt: now };
      batch.update(ref, patch);
      account = { ...current, ...patch };
    } else {
      account = {
        id: u.uid,
        createdAt: now,
        updatedAt: now,
        email,
        name: invite.name || u.displayName || invite.customerName,
        phone: invite.phone ?? null,
        companyName: invite.customerName,
        personType: invite.document ? (invite.document.length > 11 ? 'J' : 'F') : null,
        document: invite.document ?? null,
        status: 'APPROVED',
        customerId: invite.customerId,
        approvedByName: 'Convite do portal',
        approvedAt: now,
        lastLoginAt: now,
      };
      batch.set(ref, stripUndefined(account));
    }
    batch.update(doc(this.db, 'portal_invites', email), { status: 'ACCEPTED', acceptedAt: now, accountId: u.uid, updatedAt: now });
    await batch.commit();
    return account;
  }

  async signUpPortal(input: SignUpPortalInput): Promise<void> {
    try {
      await this.holding(async () => {
        const email = input.email.trim().toLowerCase();
        const cred = await createUserWithEmailAndPassword(this.auth, email, input.password);
        const uid = cred.user.uid;
        await updateProfile(cred.user, { displayName: input.name.trim() }).catch((e) => console.warn(e));
        const { password: _pw, ...rest } = input;
        const now = nowIso();
        const account: PortalAccount = {
          ...rest,
          id: uid,
          createdAt: now,
          updatedAt: now,
          email,
          name: input.name.trim(),
          status: 'PENDING',
          customerId: null,
        };
        try {
          await setDoc(doc(this.db, 'portal_accounts', uid), stripUndefined(account));
        } catch (e) {
          // Sem a conta, o login ficaria órfão: desfaz para a pessoa poder tentar de novo.
          await cred.user.delete().catch(() => undefined);
          throw e;
        }
      });
    } catch (e) {
      throw friendlyError(e);
    }
  }
}
