/** Formatação e máscaras (pt-BR). */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const num2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num3 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

const safe = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

export const money = (v: unknown) => brl.format(safe(v));
export const moneyCompact = (v: unknown) => 'R$ ' + compact.format(safe(v));
export const kg = (v: unknown) => num3.format(round3(safe(v))) + ' kg';
export const kg2 = (v: unknown) => num2.format(safe(v)) + ' kg';
export const number = (v: unknown, digits = 2) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(safe(v));
export const integer = (v: unknown) => int.format(safe(v));
export const percent = (v: unknown, digits = 1) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(safe(v)) + '%';

/** Quantidade com unidade (kg ou un). */
export function qty(v: unknown, unit: 'KG' | 'UN' | string = 'KG') {
  if (unit === 'KG') return kg(v);
  const n = safe(v);
  return `${num3.format(n)} ${n === 1 ? 'un' : 'un'}`;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Arroba = 15 kg. */
export const arrobas = (kgValue: number) => safe(kgValue) / 15;

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

/** Data de hoje 'YYYY-MM-DD' no fuso local. */
export function today(): string {
  const d = new Date();
  return toISODate(d);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Interpreta 'YYYY-MM-DD' como data local (sem deslocamento de fuso). */
export function parseISODate(s: string | null | undefined): Date | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso) || new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = parseISODate(fromIso);
  const b = parseISODate(toIso);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** 30/09/2026 */
export function date(v: string | null | undefined): string {
  const d = parseISODate(v || '');
  return d ? d.toLocaleDateString('pt-BR') : '—';
}

/** 30/09/2026 13:36 */
export function dateTime(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** "set/2026" */
export function monthLabel(v: string): string {
  const d = parseISODate(v.length === 7 ? v + '-01' : v);
  if (!d) return v;
  return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '').replace(' de ', '/');
}

/** "há 3 dias", "em 2 dias", "hoje" */
export function relativeDays(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = daysBetween(today(), iso.slice(0, 10));
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  if (diff === -1) return 'ontem';
  return diff > 0 ? `em ${diff} dias` : `há ${-diff} dias`;
}

export function startOfMonth(iso = today()): string {
  return iso.slice(0, 7) + '-01';
}

export function endOfMonth(iso = today()): string {
  const d = parseISODate(startOfMonth(iso))!;
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return toISODate(d);
}

// ---------------------------------------------------------------------------
// Documentos e contatos
// ---------------------------------------------------------------------------

export const onlyDigits = (v: string | null | undefined) => (v || '').replace(/\D/g, '');

export function formatCPF(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function formatCNPJ(v: string) {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

/** Formata CPF ou CNPJ conforme o tamanho. */
export function formatDocument(v: string | null | undefined) {
  const d = onlyDigits(v);
  if (!d) return '';
  return d.length <= 11 ? formatCPF(d) : formatCNPJ(d);
}

export function formatPhone(v: string | null | undefined) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

export function formatCep(v: string | null | undefined) {
  const d = onlyDigits(v).slice(0, 8);
  return d.replace(/(\d{5})(\d)/, '$1-$2');
}

export function isValidCPF(v: string): boolean {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += Number(d[i]) * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10) r = 0;
  if (r !== Number(d[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += Number(d[i]) * (11 - i);
  r = (s * 10) % 11;
  if (r === 10) r = 0;
  return r === Number(d[10]);
}

export function isValidCNPJ(v: string): boolean {
  const d = onlyDigits(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((acc, wi, i) => acc + Number(d[i]) * wi, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function isValidDocument(v: string): boolean {
  const d = onlyDigits(v);
  return d.length === 11 ? isValidCPF(d) : d.length === 14 ? isValidCNPJ(d) : false;
}

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim());
}

/** Consulta de CEP (ViaCEP). Retorna null se não encontrar. */
export async function lookupCep(cep: string): Promise<{
  street: string;
  district: string;
  city: string;
  state: string;
} | null> {
  const d = onlyDigits(cep);
  if (d.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!res.ok) return null;
    const j = await res.json();
    if (j.erro) return null;
    return { street: j.logradouro || '', district: j.bairro || '', city: j.localidade || '', state: j.uf || '' };
  } catch {
    return null;
  }
}

/** Remove acentos e normaliza para busca. */
export function normalize(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Busca textual tolerante (todas as palavras precisam aparecer). */
export function matchesSearch(haystack: (string | null | undefined)[], needle: string): boolean {
  const n = normalize(needle);
  if (!n) return true;
  const h = normalize(haystack.filter(Boolean).join(' '));
  const hDigits = onlyDigits(haystack.filter(Boolean).join(' '));
  return n.split(' ').every((w) => h.includes(w) || (onlyDigits(w) && hDigits.includes(onlyDigits(w))));
}

/** Iniciais para avatar. */
export function initials(name: string | null | undefined): string {
  const parts = (name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
