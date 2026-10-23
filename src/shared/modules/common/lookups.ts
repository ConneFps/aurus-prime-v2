/**
 * Listas de seleção reutilizadas por vários módulos (Combobox/Select).
 */
import { useMemo } from 'react';
import { useTable } from '../../data/react';
import { formatDocument, kg, money } from '../../domain/format';
import { PARTNER_KIND_LABELS } from '../../domain/labels';
import type { PartnerKind, Role, StockStage } from '../../domain/types';
import type { ComboOption } from '../../ui';

export function useCustomerOptions(opts?: { onlyActive?: boolean; sellerId?: string | null }) {
  const { rows, loading } = useTable('customers');
  const options = useMemo<ComboOption[]>(
    () =>
      rows
        .filter((c) => !opts?.onlyActive || c.status === 'ACTIVE')
        .filter((c) => !opts?.sellerId || c.sellerId === opts.sellerId)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map((c) => ({
          value: c.id,
          label: c.tradeName ? `${c.tradeName} — ${c.name}` : c.name,
          description: [formatDocument(c.document), c.city].filter(Boolean).join(' · '),
          keywords: [c.document, c.code, c.contactName].filter(Boolean).join(' '),
          disabled: c.status === 'BLOCKED',
        })),
    [rows, opts?.onlyActive, opts?.sellerId],
  );
  return { options, customers: rows, loading };
}

export function useProductOptions(opts?: { onlyActive?: boolean; meatOnly?: boolean }) {
  const { rows, loading } = useTable('products');
  const options = useMemo<ComboOption[]>(
    () =>
      rows
        .filter((p) => !opts?.onlyActive || p.active)
        .filter((p) => !opts?.meatOnly || p.meatType !== 'OTHER')
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map((p) => ({ value: p.id, label: p.name, description: p.category, keywords: p.code || '' })),
    [rows, opts?.onlyActive, opts?.meatOnly],
  );
  return { options, products: rows, loading };
}

/** Produtos com saldo disponível (soma dos lotes). */
export function useStockBalances(stage: StockStage = 'FINISHED') {
  const { rows: lots, loading } = useTable('stock_lots', { where: [['stage', '==', stage]] });
  const byProduct = useMemo(() => {
    const m = new Map<string, { qty: number; value: number; lots: number }>();
    for (const l of lots) {
      if (l.status !== 'AVAILABLE' || l.balanceQty <= 0) continue;
      const cur = m.get(l.productId) || { qty: 0, value: 0, lots: 0 };
      cur.qty += l.balanceQty;
      cur.value += l.balanceQty * l.unitCost;
      cur.lots += 1;
      m.set(l.productId, cur);
    }
    return m;
  }, [lots]);
  return { lots, byProduct, loading };
}

/** Opções de produto com saldo à direita (para vender/separar). */
export function useProductWithStockOptions() {
  const { options, products } = useProductOptions({ onlyActive: true });
  const { byProduct } = useStockBalances('FINISHED');
  const withStock = useMemo<ComboOption[]>(
    () =>
      options.map((o) => {
        const b = byProduct.get(o.value);
        const p = products.find((x) => x.id === o.value);
        return { ...o, right: b ? (p?.unit === 'UN' ? `${b.qty} un` : kg(b.qty)) : 'sem saldo' };
      }),
    [options, byProduct, products],
  );
  return { options: withStock, products, byProduct };
}

export function useBatchOptions(opts?: { statuses?: string[] }) {
  const { rows, loading } = useTable('batches');
  const options = useMemo<ComboOption[]>(
    () =>
      rows
        .filter((b) => !opts?.statuses || opts.statuses.includes(b.status))
        .sort((a, b) => b.code.localeCompare(a.code))
        .map((b) => ({ value: b.id, label: `${b.code} · ${b.name}`, description: b.supplierName || undefined })),
    [rows, opts?.statuses],
  );
  return { options, batches: rows, loading };
}

export function usePartnerOptions(kinds?: PartnerKind[]) {
  const { rows, loading } = useTable('partners');
  const options = useMemo<ComboOption[]>(
    () =>
      rows
        .filter((p) => p.active && (!kinds || kinds.includes(p.kind)))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map((p) => ({ value: p.id, label: p.name, description: PARTNER_KIND_LABELS[p.kind], keywords: p.document || '' })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, (kinds || []).join()],
  );
  return { options, partners: rows, loading };
}

/** Usuários (vendedores etc.). */
export function useProfileOptions(roles?: Role[]) {
  const { rows, loading } = useTable('profiles');
  const options = useMemo<ComboOption[]>(
    () =>
      rows
        .filter((p) => p.active && (!roles || roles.includes(p.role)))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map((p) => ({ value: p.id, label: p.name, description: p.email })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, (roles || []).join()],
  );
  return { options, profiles: rows, loading };
}

export function usePriceTableOptions() {
  const { rows, loading } = useTable('price_tables');
  const options = useMemo<ComboOption[]>(
    () =>
      rows
        .filter((t) => t.status === 'ACTIVE' && t.approvalStatus === 'APPROVED')
        .map((t) => ({ value: t.id, label: t.name, description: `${t.items.length} itens` })),
    [rows],
  );
  return { options, tables: rows, loading };
}

export const moneyOrDash = (v: number | null | undefined) => (v || v === 0 ? money(v) : '—');
