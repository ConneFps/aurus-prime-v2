/**
 * Migração de dados no formato da versão 11 do sistema antigo:
 * pré-cadastro com liberação do financeiro, sub-lotes, entrega/retirada,
 * registro de baixas (histórico de estoque), convites do portal e PDFs em pedaços.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/shared/app/settings';
import { createMemoryBackend } from '../src/shared/data/memory';
import type { Backend } from '../src/shared/data/api';
import { round3 } from '../src/shared/domain/format';
import { copyLegacyFiles, importPlan, legacyFileAttachmentId, resolveLegacyStorageLinks } from '../src/shared/migration/importer';
import { chunksToBlob } from '../src/shared/migration/source';
import { transformLegacy, type MigrationPlan } from '../src/shared/migration/transform';
import { createOps, type Actor } from '../src/shared/ops';
import base from './fixtures/legacy-dump.json';

const ADMIN: Actor = { id: 'u-admin', name: 'Ana Admin', email: 'admin@mvgbalimentacao.com', role: 'ADMIN' };
const NOW = '2026-10-23T13:00:00.000Z';

/** Fixture antiga + documentos no formato novo (v11). */
function v11Dump() {
  const d = JSON.parse(JSON.stringify(base)) as Record<string, Record<string, unknown>[]>;
  d.customer_requests.push(
    {
      id: 'cr-blk',
      name: 'Bar Caloteiro',
      personType: 'J',
      document: '55.666.777/0001-88',
      customerCategory: 'EXTERNO_CNPJ',
      status: 'BLOCKED',
      blockReason: 'Protestos no CNPJ',
      rejectionReason: 'Protestos no CNPJ',
      suggestedCreditLimit: 5000,
      suggestedPaymentCondition: '28 DIAS',
      sellerNotes: 'Cliente indicado',
      requestedByUid: 'u-seller',
      requestedByName: 'Sérgio Vendas',
      requestedByEmail: 'sergio@mvgbalimentacao.com',
      reviewedByName: 'Fernanda Financeiro',
      reviewedByRole: 'FINANCIAL',
      reviewedAt: '2026-10-10T12:00:00.000Z',
      createdAt: '2026-10-09T12:00:00.000Z',
    },
    {
      id: 'cr-ok',
      name: 'Churrascaria Fogo Bom LTDA',
      personType: 'J',
      document: '11.222.333/0001-81',
      status: 'APPROVED',
      createdCustomerId: 'cust-1',
      suggestedCreditLimit: 8000,
      suggestedPaymentCondition: '28/35/42',
      requestedByUid: 'u-seller',
      requestedByName: 'Sérgio Vendas',
      financialApproval: {
        creditLimit: 6000,
        paymentCondition: '28/35',
        paymentMethod: 'BOLETO',
        approvedAt: '2026-10-11T12:00:00.000Z',
        approvedByName: 'Fernanda Financeiro',
        financialNotes: 'Revisar em 90 dias',
      },
      createdAt: '2026-10-09T12:00:00.000Z',
    },
  );
  // Venda v11: retirada, frete não cobrado, tabela escolhida, corte em dois lotes e baixa gravada no pedido.
  d.sales.push({
    id: 'sale-v11',
    orderNumber: '20260090',
    customerId: 'cust-2',
    approvalStatus: 'APPROVED',
    paymentMethod: 'PIX',
    deliveryMode: 'PICKUP',
    chargeFreight: false,
    freightValue: 40,
    selectedPriceTableId: 'pt-1',
    stockDeducted: true,
    hasBoletoFile: true,
    boletoFileName: 'boleto-90.pdf',
    date: '2026-10-15',
    createdAt: '2026-10-15T12:00:00.000Z',
    totalValue: 600,
    items: [
      {
        cutType: 'Picanha',
        weightKg: 5,
        pricePerKg: 120,
        total: 600,
        subLots: [
          { batchId: 'L100', manualLot: 'L100', weightKg: 3, inventoryItemId: 'inv-1' },
          { batchId: 'L101', manualLot: 'L101', weightKg: 2, inventoryItemId: 'inv-2' },
        ],
      },
    ],
    stockDeductionUpdates: [
      { inventoryId: 'inv-1', cutType: 'Picanha', previousWeightKg: 15.5, newWeightKg: 12.5, deductedWeightKg: 3, newStatus: 'IN_STOCK' },
      { inventoryId: 'inv-2', cutType: 'Picanha', previousWeightKg: 9.5, newWeightKg: 7.5, deductedWeightKg: 2, newStatus: 'IN_STOCK' },
    ],
  });
  // Registro de baixas: baixa do pedido sale-1 (10 kg da inv-1), estorno de pedido excluído e peça que não existe mais.
  d.stock_deduction_logs = [
    {
      id: 'log-1',
      type: 'DEDUCTION',
      orderId: 'sale-1',
      orderNumber: '20260001',
      customerName: 'Churrascaria Fogo Bom LTDA',
      operatorEmail: 'logistica@mvgbalimentacao.com',
      timestamp: '2026-10-01T15:00:00.000Z',
      updates: [{ inventoryId: 'inv-1', cutType: 'Picanha', previousWeightKg: 25.5, newWeightKg: 15.5, deductedWeightKg: 10, newStatus: 'IN_STOCK' }],
    },
    {
      id: 'log-2',
      type: 'RESTORE',
      orderId: 'sale-x',
      orderNumber: 'EXCLUIDO',
      timestamp: '2026-10-02T15:00:00.000Z',
      updates: [{ inventoryId: 'inv-5', cutType: 'Fraldinha', previousWeightKg: 6, restoredWeightKg: 2, newWeightKg: 8 }],
    },
    {
      id: 'log-3',
      type: 'DEDUCTION',
      orderId: 'sale-x',
      orderNumber: 'EXCLUIDO',
      timestamp: '2026-09-30T15:00:00.000Z',
      updates: [
        { inventoryId: 'inv-5', cutType: 'Fraldinha', previousWeightKg: 8, newWeightKg: 6, deductedWeightKg: 2 },
        { inventoryId: 'inv-sumiu', cutType: 'Cupim', previousWeightKg: 4, newWeightKg: 0, deductedWeightKg: 4 },
      ],
    },
  ];
  d.portal_invites = [
    { id: 'compras@fogobom.com.br', email: 'compras@fogobom.com.br', customerId: 'cust-1', name: 'João Compras', document: '11222333000181', phone: '(47) 99999-1111', status: 'APPROVED', priceTableId: 'pt-1', createdBy: 'Ana', createdAt: '2026-10-05T12:00:00.000Z' },
    { id: 'x@nada.com', email: 'x@nada.com', customerId: 'cust-nao-existe', name: 'X', status: 'APPROVED', priceTableId: 'PUBLIC', createdAt: '2026-10-05T12:00:00.000Z' },
  ];
  d.sales_attachments = [{ id: 'sale-v11__boleto', saleId: 'sale-v11', docType: 'boleto', fileName: 'boleto-90.pdf', fileType: 'application/pdf', fileSize: 12, chunkCount: 2 }];
  return d;
}

let p: MigrationPlan;
beforeAll(() => {
  p = transformLegacy(v11Dump() as never, { now: NOW });
});

describe('transformLegacy — formato v11', () => {
  it('pré-cadastro: bloqueio, sugestões e liberação do financeiro', () => {
    const reqs = p.tables.customer_requests!;
    const blk = reqs.find((r) => r.id === 'cr-blk')!;
    expect(blk).toMatchObject({ status: 'BLOCKED', blockReason: 'Protestos no CNPJ', suggestedCreditLimit: 5000, suggestedPaymentTerms: '28 DIAS', reviewedByRole: 'FINANCIAL' });
    expect(blk.notes).toContain('Cliente indicado');
    const ok = reqs.find((r) => r.id === 'cr-ok')!;
    expect(ok.status).toBe('APPROVED');
    expect(ok.financialApproval).toMatchObject({ creditLimit: 6000, paymentTerms: '28/35', paymentMethod: 'BOLETO', approvedByName: 'Fernanda Financeiro', notes: 'Revisar em 90 dias' });
  });

  it('venda v11: retirada, frete não cobrado, tabela e sub-lotes', () => {
    const s = p.tables.sales!.find((x) => x.id === 'sale-v11')!;
    expect(s.deliveryMode).toBe('PICKUP');
    expect(s.freightValue).toBe(0);
    expect(s.priceTableId).toBe('pt-1');
    const it = s.items[0];
    expect(it.lotId).toBeNull();
    expect(it.lotCode).toBe('L100 (3 kg) + L101 (2 kg)');
  });

  it('histórico de estoque: saldo final igual ao antigo e baixas ligadas aos pedidos', () => {
    const lots = p.tables.stock_lots!;
    const moves = p.tables.stock_movements!;
    // Razão coerente: soma dos movimentos = saldo de cada lote.
    for (const lot of lots) {
      const sum = round3(moves.filter((m) => m.lotId === lot.id).reduce((t, m) => t + m.qty, 0));
      expect(sum, lot.id).toBeCloseTo(lot.balanceQty, 3);
    }
    const inv1 = lots.find((l) => l.id === 'inv-1')!;
    expect(inv1.balanceQty).toBe(12.5);
    expect(inv1.initialQty).toBe(25.5); // 12,5 + 10 (sale-1) + 3 (sale-v11)
    const sale1 = moves.filter((m) => m.lotId === 'inv-1' && m.saleId === 'sale-1');
    expect(sale1).toHaveLength(1);
    expect(sale1[0]).toMatchObject({ type: 'SALE', qty: -10, date: '2026-10-01', unitPrice: 120, saleItemId: 'sale-1-i1', batchId: inv1.batchId });
    const v11 = moves.filter((m) => m.saleId === 'sale-v11');
    expect(v11.map((m) => [m.lotId, m.qty]).sort()).toEqual([
      ['inv-1', -3],
      ['inv-2', -2],
    ]);
    // Pedido excluído: baixa + estorno líquidos zero, sem vínculo de pedido.
    const inv5 = moves.filter((m) => m.lotId === 'inv-5' && m.type !== 'ENTRY');
    expect(inv5.map((m) => m.qty).sort()).toEqual([-2, 2]);
    expect(inv5.every((m) => m.saleId === null && /EXCLUIDO/.test(m.reason || ''))).toBe(true);
    expect(p.warnings.join('\n')).toMatch(/não existem mais no estoque/);
  });

  it('convites do portal: só de clientes existentes; tabela vai para o cliente', () => {
    const inv = p.tables.portal_invites!;
    expect(inv).toHaveLength(1);
    expect(inv[0]).toMatchObject({ id: 'compras@fogobom.com.br', customerId: 'cust-1', status: 'PENDING', priceTableId: 'pt-1', phone: '47999991111' });
    expect(p.tables.customers!.find((c) => c.id === 'cust-1')!.priceTableId).toBe('pt-1');
  });

  it('PDFs em pedaços entram na lista de cópia', () => {
    const f = p.files.find((x) => x.key === 'sale-v11__boleto')!;
    expect(f).toMatchObject({ saleId: 'sale-v11', kind: 'BOLETO', name: 'boleto-90.pdf', chunks: 2 });
    expect(p.files.some((x) => x.key === 'sale-1' && x.kind === 'NF')).toBe(true);
    expect(p.ignored.join(' ')).not.toMatch(/sales_attachments|stock_deduction_logs/);
    expect(p.unmapped).not.toContain('portal_invites');
  });
});

describe('importação v11 (MemoryData)', () => {
  let backend: Backend;

  beforeAll(async () => {
    backend = createMemoryBackend();
    await backend.data.insert('settings', { ...DEFAULT_SETTINGS, id: 'main', bootstrapped: true });
    await backend.data.insert('profiles', { id: 'u-admin', email: 'admin@mvgbalimentacao.com', name: 'Ana Admin', role: 'ADMIN', active: true });
    const r = await importPlan(backend.data, p);
    expect(r.ok).toBe(true);
  });

  it('cancelar pedido migrado com baixa registrada devolve o estoque às peças certas', async () => {
    const ops = createOps({ data: backend.data, actor: ADMIN });
    await ops.cancelSale('sale-v11', 'teste de estorno');
    expect((await backend.data.get('stock_lots', 'inv-1'))!.balanceQty).toBe(15.5);
    expect((await backend.data.get('stock_lots', 'inv-2'))!.balanceQty).toBe(9.5);
  });

  it('copia os PDFs em pedaços para o pedido e não duplica ao repetir', async () => {
    const text = 'PDF-TESTE-123';
    const dataUrl = `data:application/pdf;base64,${btoa(text)}`;
    const half = Math.ceil(dataUrl.length / 2);
    const source = {
      async readAttachment(key: string) {
        if (key !== 'sale-v11__boleto') return null;
        return chunksToBlob([
          { index: 1, data: dataUrl.slice(half) },
          { index: 0, data: dataUrl.slice(0, half) },
        ]);
      },
    };
    const files = p.files.filter((f) => f.saleId === 'sale-v11' || f.saleId === 'sale-1');
    const r1 = await copyLegacyFiles(backend, source, files);
    expect(r1).toMatchObject({ copied: 1, failed: 1 }); // sale-1 não tem pedaços no banco antigo
    const sale = (await backend.data.get('sales', 'sale-v11'))!;
    const att = sale.attachments.find((a) => a.id === legacyFileAttachmentId('sale-v11__boleto'))!;
    expect(att).toMatchObject({ kind: 'BOLETO', name: 'boleto-90.pdf', size: text.length });
    const r2 = await copyLegacyFiles(backend, source, files);
    expect(r2.copied).toBe(0);
    expect(r2.skipped).toBe(1);
    expect((await backend.data.get('sales', 'sale-v11'))!.attachments.filter((a) => a.id === att.id)).toHaveLength(1);
  });

  it('chunksToBlob junta os pedaços na ordem', async () => {
    const b = chunksToBlob([
      { index: 1, data: btoa('mundo') },
      { index: 0, data: '' },
    ]);
    expect(await b!.text()).toBe('mundo');
  });
});

describe('sistema novo em OUTRO projeto Firebase', () => {
  const dumpWithPath = () => {
    const d = v11Dump();
    d.sales.push({
      id: 'sale-path',
      orderNumber: '20260091',
      customerId: 'cust-1',
      approvalStatus: 'APPROVED',
      paymentMethod: 'PIX',
      date: '2026-10-16',
      totalValue: 120,
      items: [{ cutType: 'Picanha', weightKg: 1, pricePerKg: 120 }],
      invoiceStoragePath: 'invoices/sale-path/nf.pdf',
      invoiceFileName: 'nf.pdf',
    });
    return d;
  };

  it('liga usuários pelo e-mail e transforma clientes do portal em convites', () => {
    const q = transformLegacy(dumpWithPath() as never, {
      now: NOW,
      otherProject: true,
      currentUsers: [{ id: 'novo-vend', email: 'vendas@mvgbalimentacao.com' }],
      currentPortalAccounts: [],
    });
    expect(q.otherProject).toBe(true);
    const sales = q.tables.sales!;
    expect(sales.find((s) => s.id === 'sale-1')!.sellerId).toBe('novo-vend'); // já entrou → id novo
    expect(sales.find((s) => s.id === 'sale-4')!.sellerId).toBe('uid-renato'); // ainda não entrou → liga na próxima importação
    expect(q.warnings.join('\n')).toMatch(/ainda não entraram no sistema novo/);
    expect(q.tables.portal_accounts ?? []).toHaveLength(0);
    const inv = q.tables.portal_invites!.find((i) => i.id === 'cliente@restaurante.com')!;
    expect(inv).toMatchObject({ status: 'PENDING', customerId: 'cust-1' });
    expect(q.warnings.join('\n')).toMatch(/viraram convite/);
    const po = sales.find((s) => s.channel === 'PORTAL' && s.customerId === 'cust-1')!;
    expect(po.portalAccountId).toBeNull();
    expect(q.storageLinks).toContainEqual({ table: 'sales', rowId: 'sale-path', field: 'attachments', attachmentId: 'sale-path-nf', path: 'invoices/sale-path/nf.pdf' });
  });

  it('cliente que já entrou no portal novo recebe a conta e os pedidos antigos', () => {
    const q = transformLegacy(dumpWithPath() as never, {
      now: NOW,
      otherProject: true,
      currentUsers: [],
      currentPortalAccounts: [{ id: 'novo-p1', email: 'cliente@restaurante.com' }],
    });
    expect(q.tables.portal_accounts!.map((a) => [a.id, a.status, a.customerId])).toEqual([['novo-p1', 'APPROVED', 'cust-1']]);
    const po = q.tables.sales!.find((s) => s.channel === 'PORTAL' && s.customerId === 'cust-1')!;
    expect(po.portalAccountId).toBe('novo-p1');
    expect(q.tables.portal_invites!.find((i) => i.id === 'cliente@restaurante.com')).toBeUndefined();
  });

  it('completa o link dos arquivos que ficaram no Storage antigo', async () => {
    const q = transformLegacy(dumpWithPath() as never, { now: NOW, otherProject: true });
    const b = createMemoryBackend();
    await b.data.insert('settings', { ...DEFAULT_SETTINGS, id: 'main', bootstrapped: true });
    expect((await importPlan(b.data, q)).ok).toBe(true);
    const r = await resolveLegacyStorageLinks(b.data, { storageUrl: async (path) => (path.startsWith('invoices/') ? `https://antigo.example/${path}` : null) }, q.storageLinks);
    expect(r.copied).toBeGreaterThanOrEqual(1);
    const att = (await b.data.get('sales', 'sale-path'))!.attachments.find((a) => a.id === 'sale-path-nf')!;
    expect(att.url).toBe('https://antigo.example/invoices/sale-path/nf.pdf');
  });
});
