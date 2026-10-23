/**
 * Exportação: CSV (Excel) e PDF padronizado com cabeçalho da empresa.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';
import { dateTime } from '../domain/format';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right' | 'center';
  width?: number;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** CSV com ; e BOM (abre direto no Excel pt-BR). Números no formato 1234,56. */
export function exportCsv<T>(filename: string, rows: T[], columns: ExportColumn<T>[]) {
  const data = rows.map((r) =>
    Object.fromEntries(
      columns.map((c) => {
        const v = c.value(r);
        return [c.header, typeof v === 'number' ? String(v).replace('.', ',') : v ?? ''];
      }),
    ),
  );
  const csv = Papa.unparse(data, { delimiter: ';' });
  download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

/** Lê CSV (auto-detecta ; ou ,) e devolve objetos por cabeçalho. */
export function parseCsv(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (r) => resolve(r.data),
      error: reject,
    });
  });
}

export interface PdfOptions {
  title: string;
  subtitle?: string;
  company?: string;
  orientation?: 'portrait' | 'landscape';
  /** Cor de destaque (RGB) — cada opção passa a sua. */
  accent?: [number, number, number];
}

export interface PdfDoc {
  doc: jsPDF;
  y: number;
  /** Adiciona tabela e avança o cursor. */
  table<T>(rows: T[], columns: ExportColumn<T>[], opts?: { title?: string; foot?: (string | number)[] }): void;
  /** Pares rótulo/valor em 2 colunas. */
  keyValues(items: [string, string][], opts?: { title?: string }): void;
  text(s: string, opts?: { size?: number; bold?: boolean; color?: [number, number, number] }): void;
  space(mm?: number): void;
  image(dataUrl: string, w: number, h: number): void;
  save(filename: string): void;
  blob(): Blob;
}

let defaultAccent: [number, number, number] = [180, 35, 24];
let defaultCompany = 'MVGB Agro — Aurus Prime';
/** Cada opção define sua cor/nome padrão para os PDFs. */
export function configurePdf(opts: { accent?: [number, number, number]; company?: string }) {
  if (opts.accent) defaultAccent = opts.accent;
  if (opts.company) defaultCompany = opts.company;
}

export function createPdf(opts: PdfOptions): PdfDoc {
  const doc = new jsPDF({ orientation: opts.orientation || 'portrait', unit: 'mm', format: 'a4' });
  const accent = opts.accent || defaultAccent;
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  doc.setFillColor(...accent);
  doc.rect(0, 0, W, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text((opts.company || defaultCompany).toUpperCase(), M, 11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Emitido em ${dateTime(new Date().toISOString())}`, W - M, 11, { align: 'right' });
  doc.setTextColor(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(opts.title, M, 21);
  let y = 21;
  if (opts.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(90);
    const lines = doc.splitTextToSize(opts.subtitle, W - 2 * M);
    doc.text(lines, M, 27);
    y = 27 + lines.length * 4.5;
  } else y = 26;
  doc.setDrawColor(220);
  doc.line(M, y, W - M, y);
  y += 5;

  const api: PdfDoc = {
    doc,
    y,
    table(rows, columns, o) {
      if (o?.title) {
        api.text(o.title, { bold: true, size: 11 });
      }
      autoTable(doc, {
        startY: api.y,
        margin: { left: M, right: M },
        head: [columns.map((c) => c.header)],
        body: rows.map((r) => columns.map((c) => {
          const v = c.value(r);
          return v === null || v === undefined ? '' : String(v);
        })),
        foot: o?.foot ? [o.foot.map((x) => String(x))] : undefined,
        styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [230, 230, 230], lineWidth: 0.1 },
        headStyles: { fillColor: accent, textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [245, 245, 245], textColor: 20, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: Object.fromEntries(columns.map((c, i) => [i, { halign: c.align || 'left', cellWidth: c.width || 'auto' }])),
      });
      // @ts-expect-error lastAutoTable é adicionado pelo plugin
      api.y = (doc.lastAutoTable?.finalY || api.y) + 6;
    },
    keyValues(items, o) {
      if (o?.title) api.text(o.title, { bold: true, size: 11 });
      const colW = (W - 2 * M) / 2;
      doc.setFontSize(9);
      items.forEach(([k, v], i) => {
        const col = i % 2;
        const x = M + col * colW;
        if (col === 0 && i > 0) api.y += 9;
        if (api.y > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          api.y = 16;
        }
        doc.setTextColor(120);
        doc.setFont('helvetica', 'normal');
        doc.text(k.toUpperCase(), x, api.y);
        doc.setTextColor(20);
        doc.setFont('helvetica', 'bold');
        doc.text(doc.splitTextToSize(v || '—', colW - 4)[0], x, api.y + 4);
      });
      api.y += 12;
    },
    text(s, o) {
      doc.setFont('helvetica', o?.bold ? 'bold' : 'normal');
      doc.setFontSize(o?.size || 10);
      doc.setTextColor(...(o?.color || [20, 20, 20]));
      const lines = doc.splitTextToSize(s, W - 2 * M);
      if (api.y + lines.length * 5 > doc.internal.pageSize.getHeight() - 16) {
        doc.addPage();
        api.y = 16;
      }
      doc.text(lines, M, api.y);
      api.y += lines.length * ((o?.size || 10) * 0.45) + 2;
    },
    space(mm = 4) {
      api.y += mm;
    },
    image(dataUrl, w, h) {
      if (api.y + h > doc.internal.pageSize.getHeight() - 16) {
        doc.addPage();
        api.y = 16;
      }
      doc.addImage(dataUrl, 'PNG', M, api.y, w, h);
      api.y += h + 4;
    },
    save(filename) {
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pages}`, W - M, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
      }
      doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
    },
    blob() {
      return doc.output('blob');
    },
  };
  return api;
}
