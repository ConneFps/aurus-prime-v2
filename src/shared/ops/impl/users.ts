/**
 * Usuários, convites e auditoria avulsa.
 */
import { isValidEmail } from '../../domain/format';
import { ROLE_LABELS } from '../../domain/labels';
import type { Profile, Role } from '../../domain/types';
import type { Ops, OpsContext } from '../types';
import { actorCan, assert, audit, clean, isNonNeg, mustGet, OpsError, requirePerm, runTx } from './common';
import type { Actor } from '../types';

/** Admin gerencia todos; quem tem 'externalSellers.manage' gerencia só vendedores externos. */
function requireUserAdmin(actor: Actor, targetRole: Role | undefined) {
  if (actorCan(actor, 'users.manage')) return;
  if (targetRole === 'EXTERNAL_SELLER' && actorCan(actor, 'externalSellers.manage')) return;
  throw new OpsError('Seu perfil não tem permissão para gerenciar este usuário.');
}

const ROLES = Object.keys(ROLE_LABELS) as Role[];

export function userOps(ctx: OpsContext): Pick<Ops, 'inviteUser' | 'revokeInvite' | 'updateUser' | 'log'> {
  const { actor } = ctx;
  return {
    async inviteUser(input) {
      requireUserAdmin(actor, input.role);
      const email = (input.email || '').trim().toLowerCase();
      assert(isValidEmail(email), 'Informe um e-mail válido.');
      assert(clean(input.name), 'Informe o nome.');
      assert(ROLES.includes(input.role), 'Papel inválido.');
      if (input.commissionRate != null) assert(isNonNeg(input.commissionRate) && input.commissionRate <= 100, 'Comissão inválida.');
      await runTx(ctx, async (tx) => {
        const profile = (await tx.query('profiles', { where: [['email', '==', email]] }))[0];
        if (profile) {
          tx.update('profiles', profile.id, {
            role: input.role,
            commissionRate: input.commissionRate ?? profile.commissionRate ?? null,
            phone: clean(input.phone) ?? profile.phone ?? null,
          });
          audit(tx, actor, 'UPDATE', 'profiles', profile.id, `Acesso de ${profile.name} atualizado: ${ROLE_LABELS[input.role]}`);
          return;
        }
        const cur = await tx.get('invites', email);
        const fields = {
          email,
          name: input.name.trim(),
          role: input.role,
          commissionRate: input.commissionRate ?? null,
          phone: clean(input.phone),
          status: 'PENDING' as const,
          invitedById: actor.id,
          invitedByName: actor.name,
          acceptedAt: null,
          profileId: null,
        };
        if (cur) tx.update('invites', email, fields);
        else tx.insert('invites', { id: email, ...fields });
        audit(tx, actor, 'CREATE', 'invites', email, `Convite enviado para ${input.name.trim()} <${email}> — ${ROLE_LABELS[input.role]}`);
      });
    },

    async revokeInvite(inviteId) {
      await runTx(ctx, async (tx) => {
        const inv = await mustGet(tx, 'invites', inviteId, 'Convite não encontrado.');
        requireUserAdmin(actor, inv.role);
        assert(inv.status === 'PENDING', 'Somente convites pendentes podem ser revogados.');
        tx.update('invites', inviteId, { status: 'REVOKED' });
        audit(tx, actor, 'CANCEL', 'invites', inviteId, `Convite revogado: ${inv.email}`);
      });
    },

    async updateUser(profileId, patch) {
      if (patch.role !== undefined) assert(ROLES.includes(patch.role), 'Papel inválido.');
      if (patch.name !== undefined) assert(clean(patch.name), 'Informe o nome.');
      if (patch.commissionRate != null) assert(isNonNeg(patch.commissionRate) && patch.commissionRate <= 100, 'Comissão inválida.');
      await runTx(ctx, async (tx) => {
        const p = await mustGet(tx, 'profiles', profileId, 'Usuário não encontrado.');
        requireUserAdmin(actor, p.role);
        if (patch.role !== undefined && patch.role !== p.role) requirePerm(actor, 'users.manage');
        const losesAdmin = p.role === 'ADMIN' && p.active && ((patch.role !== undefined && patch.role !== 'ADMIN') || patch.active === false);
        if (losesAdmin) {
          const admins = (await tx.query('profiles', { where: [['role', '==', 'ADMIN']] })).filter((x) => x.active);
          assert(admins.length > 1, 'Não é possível remover o último administrador ativo.');
        }
        const upd: Partial<Profile> = {};
        if (patch.role !== undefined) upd.role = patch.role;
        if (patch.active !== undefined) upd.active = patch.active;
        if (patch.commissionRate !== undefined) upd.commissionRate = patch.commissionRate;
        if (patch.name !== undefined) upd.name = patch.name.trim();
        if (patch.company !== undefined) upd.company = patch.company;
        tx.update('profiles', profileId, upd);
        const parts: string[] = [];
        if (upd.role) parts.push(`papel ${ROLE_LABELS[upd.role]}`);
        if (upd.active !== undefined) parts.push(upd.active ? 'reativado' : 'bloqueado');
        audit(tx, actor, 'UPDATE', 'profiles', profileId, `Usuário ${p.name} alterado${parts.length ? `: ${parts.join(', ')}` : ''}`, { patch: upd });
      });
    },

    async log(action, entity, entityId, summary, data) {
      await runTx(ctx, async (tx) => {
        audit(tx, actor, action, entity, entityId, summary, data);
      });
    },
  };
}
