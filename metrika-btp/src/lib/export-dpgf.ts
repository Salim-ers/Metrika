"use client";

import { CompanyExport, dataUrlToBytes, fmtMad, winAnsiSafe } from "@/lib/export-common";

export interface DpgfExportLine {
  lot: string;
  code?: string;
  designation: string;
  description?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  quantitySource?: string;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const fmt = (n: number) => fmtMad(n);

// ── Excel ─────────────────────────────────────────────────────────
export async function exportDpgfExcel(lines: DpgfExportLine[]) {
  const mod = await import("exceljs");
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("DPGF");
  ws.columns = [
    { header: "Lot", key: "lot", width: 22 },
    { header: "Code", key: "code", width: 8 },
    { header: "Désignation", key: "designation", width: 50 },
    { header: "Unité", key: "unit", width: 8 },
    { header: "Quantité", key: "quantity", width: 12 },
    { header: "P.U. (MAD)", key: "unitPrice", width: 14 },
    { header: "Total HT (MAD)", key: "total", width: 16 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14233F" } };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  for (const l of lines) {
    ws.addRow({
      lot: l.lot, code: l.code ?? "", designation: l.designation, unit: l.unit,
      quantity: l.quantity, unitPrice: l.unitPrice, total: l.quantity * l.unitPrice,
    });
  }
  const totalHT = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const r = ws.addRow({ designation: "TOTAL HT", total: totalHT });
  r.font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  download(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "dpgf-metrika.xlsx"
  );
}

// ── DOCX ──────────────────────────────────────────────────────────
export async function exportDpgfDocx(lines: DpgfExportLine[]) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType } =
    await import("docx");
  const header = ["Lot", "Désignation", "U.", "Qté", "P.U.", "Total HT"];
  const cell = (t: string, bold = false, align: "left" | "right" = "left") =>
    new TableCell({
      children: [new Paragraph({ alignment: align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: t, bold })] })],
    });
  const rows = [
    new TableRow({ children: header.map((h, i) => cell(h, true, i >= 3 ? "right" : "left")) }),
    ...lines.map((l) =>
      new TableRow({
        children: [
          cell(l.lot), cell(l.designation), cell(l.unit),
          cell(String(l.quantity), false, "right"),
          cell(fmt(l.unitPrice), false, "right"),
          cell(fmt(l.quantity * l.unitPrice), false, "right"),
        ],
      })
    ),
  ];
  const totalHT = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("DPGF — Décomposition du Prix Global et Forfaitaire")] }),
        new Paragraph({ children: [new TextRun({ text: "Metrika Métrage BTP", color: "888888" })] }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Total HT : ${fmt(totalHT)} MAD`, bold: true })] }),
      ],
    }],
  });
  download(await Packer.toBlob(doc), "dpgf-metrika.docx");
}

// ── PDF ───────────────────────────────────────────────────────────
export async function exportDpgfPdf(lines: DpgfExportLine[], company?: CompanyExport | null) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const NAVY = rgb(0.078, 0.137, 0.247), GOLD = rgb(0.882, 0.647, 0.196), GREY = rgb(0.45, 0.47, 0.52), LINE = rgb(0.85, 0.86, 0.88);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 40;
  let page = doc.addPage([W, H]); let y = H - M;

  const t = (s: string, x: number, yy: number, o?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "right" }) => {
    const ss = winAnsiSafe(s);
    const size = o?.size ?? 8; const f = o?.bold ? bold : font;
    const xx = o?.align === "right" ? x - f.widthOfTextAtSize(ss, size) : x;
    page.drawText(ss, { x: xx, y: yy, size, font: f, color: o?.color ?? NAVY });
  };
  const wrap = (s: string, size: number, maxW: number) => {
    const words = s.split(/\s+/); const out: string[] = []; let cur = "";
    for (const w of words) { const tt = cur ? cur + " " + w : w; if (bold.widthOfTextAtSize(tt, size) > maxW && cur) { out.push(cur); cur = w; } else cur = tt; }
    if (cur) out.push(cur); return out.length ? out : [""];
  };

  page.drawRectangle({ x: 0, y: H - 5, width: W, height: 5, color: GOLD });
  const logo = dataUrlToBytes(company?.logoUrl);
  if (logo) {
    try {
      const img = logo.mime.includes("png") ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
      const lw = 110; const lh = (img.height / img.width) * lw;
      page.drawImage(img, { x: M, y: y - lh, width: lw, height: lh }); y -= lh + 6;
    } catch { /* ignore */ }
  }
  t("DPGF — Décomposition du Prix Global et Forfaitaire", M, y, { size: 13, bold: true }); y -= 16;
  t(company?.name ?? "Metrika Métrage BTP", M, y, { size: 9, color: GREY }); y -= 18;

  const cDes = M + 8, cUnit = W - M - 230, cQty = W - M - 170, cPu = W - M - 90, cTot = W - M;
  const head = () => {
    page.drawRectangle({ x: M, y: y - 15, width: W - 2 * M, height: 19, color: NAVY });
    t("DÉSIGNATION", cDes, y - 10, { size: 7.5, bold: true, color: rgb(1, 1, 1) });
    t("U.", cUnit, y - 10, { size: 7.5, bold: true, color: rgb(1, 1, 1) });
    t("QTÉ", cQty, y - 10, { size: 7.5, bold: true, color: rgb(1, 1, 1), align: "right" });
    t("P.U.", cPu, y - 10, { size: 7.5, bold: true, color: rgb(1, 1, 1), align: "right" });
    t("TOTAL HT", cTot, y - 10, { size: 7.5, bold: true, color: rgb(1, 1, 1), align: "right" });
    y -= 24;
  };
  head();
  for (const l of lines) {
    const wl = wrap(l.designation, 8, cUnit - cDes - 6);
    const rowH = wl.length * 10 + 8;
    if (y - rowH < M + 40) { page = doc.addPage([W, H]); y = H - M; head(); }
    wl.forEach((ln, k) => t(ln, cDes, y - k * 10, { size: 8, bold: true }));
    t(`${l.lot}${l.quantitySource ? " · " + l.quantitySource : ""}`, cDes, y - wl.length * 10, { size: 6.5, color: GREY });
    t(l.unit, cUnit, y, { size: 8 });
    t(String(l.quantity), cQty, y, { size: 8, align: "right" });
    t(fmt(l.unitPrice), cPu, y, { size: 8, align: "right" });
    t(fmt(l.quantity * l.unitPrice), cTot, y, { size: 8, bold: true, align: "right" });
    y -= rowH;
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: W - M, y: y + 3 }, thickness: 0.4, color: LINE });
  }
  const totalHT = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  if (y < M + 30) { page = doc.addPage([W, H]); y = H - M; }
  y -= 12;
  t("TOTAL HT", cPu, y, { size: 10, bold: true, align: "right" });
  t(`${fmt(totalHT)} MAD`, cTot, y, { size: 10, bold: true, color: GOLD, align: "right" });

  download(new Blob([(await doc.save()) as BlobPart], { type: "application/pdf" }), "dpgf-metrika.pdf");
}
