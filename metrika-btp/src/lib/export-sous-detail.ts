"use client";

import { CompanyExport, downloadBlob, fmtMad, dataUrlToBytes, winAnsiSafe } from "@/lib/export-common";

export interface SousDetailExport {
  designation: string;
  unit: string;
  lot?: string;
  yield: number;
  generalFeesRate: number;
  profitRate: number;
  components: { type: string; designation: string; unit: string; quantity: number; unitCost: number }[];
  company?: CompanyExport | null;
}

const TYPE_LABEL: Record<string, string> = {
  MAIN_OEUVRE: "Main-d'œuvre", MATERIAUX: "Matériaux", MATERIEL: "Matériel",
};

function compute(d: SousDetailExport) {
  const debourse = d.components.reduce((s, c) => s + c.quantity * c.unitCost, 0);
  const selling = debourse * (1 + d.generalFeesRate) * (1 + d.profitRate);
  return { debourse, selling };
}

// ── Excel ─────────────────────────────────────────────────────────
export async function exportSousDetailExcel(d: SousDetailExport): Promise<void> {
  const mod = await import("exceljs");
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sous-détail");
  ws.columns = [
    { key: "type", width: 16 }, { key: "designation", width: 40 }, { key: "unit", width: 8 },
    { key: "quantity", width: 12 }, { key: "unitCost", width: 14 }, { key: "amount", width: 16 },
  ];
  const logo = dataUrlToBytes(d.company?.logoUrl);
  if (logo) {
    const id = wb.addImage({ base64: (d.company!.logoUrl as string).split(",")[1], extension: logo.mime.includes("png") ? "png" : "jpeg" });
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 48 } });
    ws.getRow(1).height = 40;
  }
  ws.addRow([]);
  ws.addRow([`Sous-détail de prix — ${d.designation} (/ ${d.unit})`]).font = { bold: true, size: 13 };
  ws.addRow([d.company?.name ?? "Metrika Métrage BTP"]);
  ws.addRow([]);
  const hdr = ws.addRow(["Type", "Désignation", "U.", "Qté/U.", "Coût U. (MAD)", "Montant (MAD)"]);
  hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hdr.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14233F" } }; });
  for (const c of d.components) {
    ws.addRow([TYPE_LABEL[c.type] ?? c.type, c.designation, c.unit, c.quantity, c.unitCost, c.quantity * c.unitCost]);
  }
  const { debourse, selling } = compute(d);
  ws.addRow([]);
  ws.addRow(["", "", "", "", "Déboursé sec", debourse]).font = { bold: true };
  ws.addRow(["", "", "", "", `Frais généraux (${Math.round(d.generalFeesRate * 100)}%) + Bénéfice (${Math.round(d.profitRate * 100)}%)`, ""]);
  ws.addRow(["", "", "", "", `Prix de vente / ${d.unit}`, Math.round(selling * 100) / 100]).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "sous-detail-metrika.xlsx");
}

// ── PDF ───────────────────────────────────────────────────────────
export async function exportSousDetailPdf(d: SousDetailExport): Promise<void> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const NAVY = rgb(0.078, 0.137, 0.247), GOLD = rgb(0.882, 0.647, 0.196), GREY = rgb(0.45, 0.47, 0.52), LINE = rgb(0.85, 0.86, 0.88);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 48;
  let page = doc.addPage([W, H]); let y = H - M;
  const t = (s: string, x: number, yy: number, o?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "right" }) => {
    const ss = winAnsiSafe(s);
    const size = o?.size ?? 9; const f = o?.bold ? bold : font;
    const xx = o?.align === "right" ? x - f.widthOfTextAtSize(ss, size) : x;
    page.drawText(ss, { x: xx, y: yy, size, font: f, color: o?.color ?? NAVY });
  };
  page.drawRectangle({ x: 0, y: H - 5, width: W, height: 5, color: GOLD });
  const logo = dataUrlToBytes(d.company?.logoUrl);
  if (logo) {
    try {
      const img = logo.mime.includes("png") ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
      const lw = 110; const lh = (img.height / img.width) * lw;
      page.drawImage(img, { x: M, y: y - lh, width: lw, height: lh }); y -= lh + 6;
    } catch { /* ignore */ }
  } else { t(d.company?.name ?? "Metrika Métrage BTP", M, y - 6, { size: 11, bold: true }); y -= 22; }
  t(`Sous-détail de prix — ${d.designation}`, M, y, { size: 13, bold: true }); y -= 16;
  t(`Unité : ${d.unit}   ·   Rendement : ${d.yield} U/j`, M, y, { size: 9, color: GREY }); y -= 20;

  const cQ = W - M - 200, cC = W - M - 110, cA = W - M;
  const head = () => {
    page.drawRectangle({ x: M, y: y - 15, width: W - 2 * M, height: 19, color: NAVY });
    t("POSTE", M + 8, y - 10, { size: 7.5, bold: true, color: rgb(1, 1, 1) });
    t("QTÉ/U", cQ, y - 10, { size: 7.5, bold: true, color: rgb(1, 1, 1), align: "right" });
    t("COÛT U.", cC, y - 10, { size: 7.5, bold: true, color: rgb(1, 1, 1), align: "right" });
    t("MONTANT", cA, y - 10, { size: 7.5, bold: true, color: rgb(1, 1, 1), align: "right" });
    y -= 24;
  };
  head();
  let currentType = "";
  for (const c of d.components) {
    if (c.type !== currentType) {
      currentType = c.type;
      if (y < M + 60) { page = doc.addPage([W, H]); y = H - M; head(); }
      t(TYPE_LABEL[c.type] ?? c.type, M, y, { size: 8, bold: true, color: GOLD }); y -= 14;
    }
    if (y < M + 40) { page = doc.addPage([W, H]); y = H - M; head(); }
    t(c.designation, M + 8, y, { size: 8.5 });
    t(String(c.quantity), cQ, y, { size: 8.5, align: "right" });
    t(fmtMad(c.unitCost), cC, y, { size: 8.5, align: "right" });
    t(fmtMad(c.quantity * c.unitCost), cA, y, { size: 8.5, bold: true, align: "right" });
    y -= 13;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.4, color: LINE });
  }
  const { debourse, selling } = compute(d);
  y -= 12;
  t("Déboursé sec", cC, y, { size: 9, color: GREY, align: "right" }); t(fmtMad(debourse), cA, y, { size: 9, align: "right" }); y -= 13;
  t(`Frais généraux ${Math.round(d.generalFeesRate * 100)}% · Bénéfice ${Math.round(d.profitRate * 100)}%`, cC, y, { size: 8, color: GREY, align: "right" }); y -= 8;
  page.drawLine({ start: { x: cC - 60, y }, end: { x: cA, y }, thickness: 0.6, color: NAVY }); y -= 16;
  t(`Prix de vente / ${d.unit}`, cC, y, { size: 11, bold: true, align: "right" }); t(fmtMad(selling) + " MAD", cA, y, { size: 11, bold: true, color: GOLD, align: "right" });

  downloadBlob(new Blob([(await doc.save()) as BlobPart], { type: "application/pdf" }), "sous-detail-metrika.pdf");
}
