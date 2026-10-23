/**
 * Carrinho do portal: { itemId → quantidade }, guardado no navegador por conta
 * (sobrevive a recarregar a página). Preços sempre vêm do catálogo atual.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { round2 } from '../../../domain/format';
import type { CatalogItem } from '../../../domain/types';

export type CartLines = Record<string, number>;

interface CartCtx {
  lines: CartLines;
  count: number;
  setQty: (itemId: string, qty: number) => void;
  clear: () => void;
}

const Ctx = createContext<CartCtx | null>(null);

const keyOf = (accountId: string) => `aurus.portal.cart.${accountId}`;

function load(accountId: string): CartLines {
  try {
    const raw = localStorage.getItem(keyOf(accountId));
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? (v as CartLines) : {};
  } catch {
    return {};
  }
}

export function CartProvider({ accountId, children }: { accountId: string; children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLines>(() => load(accountId));

  useEffect(() => {
    try {
      localStorage.setItem(keyOf(accountId), JSON.stringify(lines));
    } catch {
      /* armazenamento indisponível */
    }
  }, [accountId, lines]);

  const setQty = useCallback((itemId: string, qty: number) => {
    setLines((cur) => {
      const next = { ...cur };
      if (qty > 0) next[itemId] = qty;
      else delete next[itemId];
      return next;
    });
  }, []);

  const clear = useCallback(() => setLines({}), []);

  const value = useMemo(() => ({ lines, count: Object.keys(lines).length, setQty, clear }), [lines, setQty, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('CartProvider ausente');
  return c;
}

export interface CartRow {
  item: CatalogItem;
  qty: number;
  total: number;
}

/** Junta o carrinho com o catálogo; itens que saíram do catálogo vêm em `missing`. */
export function resolveCart(lines: CartLines, catalog: CatalogItem[]) {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const rows: CartRow[] = [];
  const missing: string[] = [];
  for (const [id, qty] of Object.entries(lines)) {
    const item = byId.get(id);
    if (!item || !item.available) missing.push(id);
    else rows.push({ item, qty, total: round2(qty * item.price) });
  }
  rows.sort((a, b) => (a.item.sortOrder || 0) - (b.item.sortOrder || 0));
  const subtotal = round2(rows.reduce((s, r) => s + r.total, 0));
  return { rows, missing, subtotal };
}
