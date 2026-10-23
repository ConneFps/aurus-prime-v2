/**
 * Camada React de dados: provider do backend, hooks de leitura em tempo real
 * e helpers de ação. TODAS as telas usam estes hooks — nunca o SDK do banco.
 */
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Row, TableName } from '../domain/schema';
import type { Backend, ListQuery, NewRow, Patch } from './api';

const BackendCtx = createContext<Backend | null>(null);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

/** Liga cada tabela ao tempo real uma única vez e invalida o cache quando muda. */
function useRealtimeRegistry(backend: Backend) {
  const qc = useQueryClient();
  const subs = useRef(new Map<TableName, { count: number; unsub: () => void }>());
  return useCallback(
    (table: TableName) => {
      const cur = subs.current.get(table);
      if (cur) {
        cur.count++;
      } else {
        const unsub = backend.data.subscribe(table, () => {
          qc.invalidateQueries({ queryKey: [table] });
          // vendas carregam itens embutidos
          if (table === 'sales') qc.invalidateQueries({ queryKey: ['sale_items'] });
        });
        subs.current.set(table, { count: 1, unsub });
      }
      return () => {
        const s = subs.current.get(table);
        if (!s) return;
        s.count--;
        if (s.count <= 0) {
          // mantém a assinatura por alguns segundos para navegação rápida
          setTimeout(() => {
            const again = subs.current.get(table);
            if (again && again.count <= 0) {
              again.unsub();
              subs.current.delete(table);
            }
          }, 5000);
        }
      };
    },
    [backend, qc],
  );
}

const RealtimeCtx = createContext<((t: TableName) => () => void) | null>(null);

function RealtimeProvider({ backend, children }: { backend: Backend; children: React.ReactNode }) {
  const register = useRealtimeRegistry(backend);
  return <RealtimeCtx.Provider value={register}>{children}</RealtimeCtx.Provider>;
}

export function BackendProvider({ backend, children }: { backend: Backend; children: React.ReactNode }) {
  return (
    <BackendCtx.Provider value={backend}>
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider backend={backend}>{children}</RealtimeProvider>
      </QueryClientProvider>
    </BackendCtx.Provider>
  );
}

export function useBackend(): Backend {
  const b = useContext(BackendCtx);
  if (!b) throw new Error('BackendProvider ausente');
  return b;
}

export function useData() {
  return useBackend().data;
}

export interface TableState<T> {
  rows: T[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Lê uma tabela (com filtro opcional) e mantém atualizada em tempo real.
 *   const { rows: customers, loading } = useTable('customers');
 *   const { rows } = useTable('sales', { where: [['customerId', '==', id]] });
 * Passe `enabled: false` para não carregar.
 */
export function useTable<K extends TableName>(
  table: K,
  q?: ListQuery<Row<K>>,
  opts?: { enabled?: boolean },
): TableState<Row<K>> {
  const backend = useBackend();
  const register = useContext(RealtimeCtx);
  const enabled = opts?.enabled !== false;
  const key = useMemo(() => [table, JSON.stringify(q || {})], [table, q]);
  useEffect(() => {
    if (!enabled || !register) return;
    return register(table);
  }, [table, enabled, register]);
  const res = useQuery({
    queryKey: key,
    queryFn: () => backend.data.list(table, q),
    enabled,
  });
  return {
    rows: (res.data as Row<K>[] | undefined) ?? EMPTY,
    loading: res.isLoading && enabled,
    error: (res.error as Error) ?? null,
    refetch: () => void res.refetch(),
  };
}
const EMPTY: never[] = [];

/** Lê um registro pelo id (tempo real). */
export function useRow<K extends TableName>(table: K, id: string | null | undefined) {
  const backend = useBackend();
  const register = useContext(RealtimeCtx);
  useEffect(() => {
    if (!id || !register) return;
    return register(table);
  }, [table, id, register]);
  const res = useQuery({
    queryKey: [table, 'id', id],
    queryFn: () => backend.data.get(table, id as string),
    enabled: !!id,
  });
  return { row: (res.data as Row<K> | null | undefined) ?? null, loading: res.isLoading && !!id, error: (res.error as Error) ?? null };
}

/** CRUD simples de uma tabela (para cadastros sem regra de negócio). */
export function useCrud<K extends TableName>(table: K) {
  const data = useData();
  const qc = useQueryClient();
  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: [table] }), [qc, table]);
  return useMemo(
    () => ({
      insert: async (row: NewRow<K>) => {
        const r = await data.insert(table, row);
        invalidate();
        return r;
      },
      update: async (id: string, patch: Patch<K>) => {
        await data.update(table, id, patch);
        invalidate();
      },
      remove: async (id: string) => {
        await data.remove(table, id);
        invalidate();
      },
    }),
    [data, table, invalidate],
  );
}

/** Invalida o cache de tabelas (útil após operações). */
export function useInvalidate() {
  const qc = useQueryClient();
  return useCallback((...tables: TableName[]) => {
    if (!tables.length) qc.invalidateQueries();
    else tables.forEach((t) => qc.invalidateQueries({ queryKey: [t] }));
  }, [qc]);
}

/**
 * Executa uma ação assíncrona com estado de carregamento e erro.
 *   const save = useAction(async (v) => ops.createSale(v), { success: 'Venda criada' });
 *   <Button loading={save.running} onClick={() => save.run(values)}>
 * Mostra toast de sucesso/erro automaticamente (via ToastBridge).
 */
export function useAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  opts?: { success?: string | ((r: R) => string); error?: string; onSuccess?: (r: R) => void },
) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const qc = useQueryClient();
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setRunning(true);
      setError(null);
      try {
        const r = await fnRef.current(...args);
        const o = optsRef.current;
        if (o?.success) toastBridge.success(typeof o.success === 'function' ? o.success(r) : o.success);
        o?.onSuccess?.(r);
        qc.invalidateQueries();
        return r;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        toastBridge.error(optsRef.current?.error ? `${optsRef.current.error}: ${err.message}` : err.message);
        console.error(err);
        return undefined;
      } finally {
        setRunning(false);
      }
    },
    [qc],
  );
  return { run, running, error };
}

/** Ponte para o sistema de toasts (registrado pelo <ToastProvider/> da UI). */
export const toastBridge = {
  success: (msg: string) => console.info(msg),
  error: (msg: string) => console.error(msg),
  info: (msg: string) => console.info(msg),
};
