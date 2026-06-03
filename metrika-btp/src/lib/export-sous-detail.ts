"use client";

import { CompanyExport, downloadBlob, fmtMad, dataUrlToBytes } from "@/lib/export-common";
import { createPdf } from "@/lib/pdf-kit";

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

// ── PDF officiel (kit Metrika) ────────────────────────────────────
export async function exportSousDetailPdf(d: SousDetailExport): Promise<void> {
  const k = await createPdf(d.company);
  const { C, W, M } = k;
  k.header({ title: "SOUS-DÉTAIL", subtitle: "de prix unitaire" });

  // ── Bloc ouvrage ──
  k.page.drawRectangle({ x: M, y: k.y - 44, width: W - 2 * M, height: 48, color: C.ZEBRA, borderColor: C.LIGHT, borderWidth: 0.5 });
  k.text("OUVRAGE", M + 10, k.y - 12, { size: 8, bold: true, color: C.GOLD });
  let oy = k.y - 26;
  for (const ln of k.wrap(d.designation, 11, true, W - 2 * M - 20)) { k.text(ln, M + 10, oy, { size: 11, bold: true }); oy -= 13; }
  k.text(`Unité : ${d.unit}      ·      Rendement : ${d.yield} U/jour${d.lot ? `      ·      Lot : ${d.lot}` : ""}`, M + 10, oy, { size: 8.5, color: C.GREY });
  k.y -= 60;

  // ── Tableau par poste ──
  const amtR = W - M - 8, costR = W - M - 95, qtyR = W - M - 170, uX = W - M - 220, posteX = M + 10;
  const posteW = uX - posteX - 8;
  const head = () => {
    k.page.drawRectangle({ x: M, y: k.y - 16, width: W - 2 * M, height: 20, color: C.NAVY });
    k.text("POSTE", posteX, k.y - 11, { size: 8, bold: true, color: C.WHITE });
    k.text("UNITÉ", uX, k.y - 11, { size: 8, bold: true, color: C.WHITE });
    k.text("QTÉ / U", qtyR, k.y - 11, { size: 8, bold: true, color: C.WHITE, align: "right" });
    k.text("COÛT U.", costR, k.y - 11, { size: 8, bold: true, color: C.WHITE, align: "right" });
    k.text("MONTANT", amtR, k.y - 11, { size: 8, bold: true, color: C.WHITE, align: "right" });
    k.y -= 24;
  };
  head();
  let currentType = "";
  for (const c of d.components) {
    if (c.type !== currentType) {
      currentType = c.type;
      if (k.ensure(34)) head();
      k.y -= 2;
      k.page.drawRectangle({ x: M, y: k.y - 13, width: W - 2 * M, height: 16, color: C.GOLD });
      k.text((TYPE_LABEL[c.type] ?? c.type).toUpperCase(), posteX, k.y - 9, { size: 8, bold: true, color: C.NAVY });
      k.y -= 20;
    }
    const wl = k.wrap(c.designation, 8.5, false, posteW);
    const rowH = wl.length * 11 + 5;
    if (k.ensure(rowH + 4)) head();
    wl.forEach((ln, i) => k.text(ln, posteX, k.y - i * 11, { size: 8.5 }));
    k.text(c.unit, uX, k.y, { size: 8, color: C.GREY });
    k.text(String(c.quantity), qtyR, k.y, { size: 8.5, align: "right" });
    k.text(fmtMad(c.unitCost), costR, k.y, { size: 8.5, align: "right" });
    k.text(fmtMad(c.quantity * c.unitCost), amtR, k.y, { size: 8.5, bold: true, align: "right" });
    k.y -= rowH;
    k.hr(k.y + 4, C.LIGHT, 0.4);
  }

  // ── Synthèse ──
  const { debourse, selling } = compute(d);
  k.ensure(110);
  k.y -= 10;
  const boxW = 250, boxX = W - M - boxW;
  k.text("Déboursé sec", boxX + 12, k.y, { size: 9, color: C.GREY }); k.text(fmtMad(debourse) + " MAD", amtR, k.y, { size: 9, bold: true, align: "right" }); k.y -= 15;
  k.text(`Frais généraux : ${Math.round(d.generalFeesRate * 100)} %`, boxX + 12, k.y, { size: 8.5, color: C.GREY }); k.y -= 13;
  k.text(`Bénéfice : ${Math.round(d.profitRate * 100)} %`, boxX + 12, k.y, { size: 8.5, color: C.GREY }); k.y -= 10;
  k.page.drawRectangle({ x: boxX, y: k.y - 24, width: boxW, height: 26, color: C.NAVY });
  k.text(`PRIX DE VENTE / ${d.unit}`, boxX + 12, k.y - 16, { size: 10, bold: true, color: C.WHITE });
  k.text(fmtMad(selling) + " MAD", amtR, k.y - 16, { size: 12, bold: true, color: C.GOLD, align: "right" });

  await k.finish("sous-detail-metrika.pdf");
}
