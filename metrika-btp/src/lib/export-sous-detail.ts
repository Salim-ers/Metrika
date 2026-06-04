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

  // ── Colonnes (alignées sur des bords droits communs) ──
  const totR = W - M - 6;       // Total (toutes sections)
  const puR = W - M - 66;       // P.U. / P.M.H.
  const qtR = W - M - 128;      // Qté totale (fournitures)
  const qR = W - M - 190;       // Qté / Heures
  const perteR = W - M - 250;   // Perte %
  const uX = W - M - 285;       // Unité (gauche)
  const desigX = M + 6;
  const desigW = uX - desigX - 6;
  const qfmt = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

  const mat = d.components.filter((c) => c.type === "MATERIAUX");
  const mate = d.components.filter((c) => c.type === "MATERIEL");
  const mo = d.components.filter((c) => c.type === "MAIN_OEUVRE");

  const sectionTitle = (t: string) => {
    k.ensure(40); k.y -= 8;
    k.page.drawRectangle({ x: M, y: k.y - 13, width: W - 2 * M, height: 16, color: C.GOLD });
    k.text(t, desigX, k.y - 9, { size: 8.5, bold: true, color: C.NAVY });
    k.y -= 18;
  };
  const colHead = (labels: { t: string; x: number; align?: "left" | "right" }[]) => {
    k.page.drawRectangle({ x: M, y: k.y - 15, width: W - 2 * M, height: 18, color: C.NAVY });
    for (const l of labels) k.text(l.t, l.x, k.y - 10, { size: 7, bold: true, color: C.WHITE, align: l.align });
    k.y -= 21;
  };
  const totalLine = (label: string, val: number) => {
    if (k.ensure(18)) { /* page suffisante */ }
    k.text(label, qtR, k.y, { size: 8.5, bold: true, color: C.GREY, align: "right" });
    k.text(fmtMad(val) + " MAD", totR, k.y, { size: 9, bold: true, align: "right" });
    k.y -= 16;
  };
  let zebra = false;
  const zebraRow = (top: number, rowH: number) => { if (zebra) k.page.drawRectangle({ x: M, y: top - rowH, width: W - 2 * M, height: rowH, color: C.ZEBRA }); zebra = !zebra; };

  // ── 1) MATÉRIAUX / FOURNITURES ──
  let totFourn = 0;
  if (mat.length) {
    sectionTitle("1 — MATÉRIAUX / FOURNITURES (rendus chantier)");
    const head = () => colHead([
      { t: "DÉSIGNATION", x: desigX }, { t: "U", x: uX }, { t: "PERTE", x: perteR, align: "right" },
      { t: "QTÉ", x: qR, align: "right" }, { t: "QTÉ TOT.", x: qtR, align: "right" },
      { t: "P.U.", x: puR, align: "right" }, { t: "TOTAL", x: totR, align: "right" },
    ]);
    head(); zebra = false;
    for (const c of mat) {
      const qtot = c.quantity; const tot = qtot * c.unitCost; totFourn += tot;
      const wl = k.wrap(c.designation, 8, false, desigW);
      const rowH = Math.max(15, wl.length * 10 + 5);
      if (k.ensure(rowH)) head();
      const top = k.y; zebraRow(top, rowH); const base = top - 11;
      wl.forEach((ln, i) => k.text(ln, desigX, base - i * 10, { size: 8 }));
      k.text(c.unit, uX, base, { size: 7.5, color: C.GREY });
      k.text("0 %", perteR, base, { size: 8, align: "right", color: C.GREY });
      k.text(qfmt(c.quantity), qR, base, { size: 8, align: "right" });
      k.text(qfmt(qtot), qtR, base, { size: 8, align: "right" });
      k.text(fmtMad(c.unitCost), puR, base, { size: 8, align: "right" });
      k.text(fmtMad(tot), totR, base, { size: 8, bold: true, align: "right" });
      k.y = top - rowH; k.hr(k.y, C.LIGHT, 0.4);
    }
    totalLine("Total fournitures", totFourn);
  }

  // ── 2) LOCATION / MATÉRIEL ──
  let totMat = 0;
  if (mate.length) {
    sectionTitle("2 — MATÉRIEL (location / amortissement)");
    const head = () => colHead([
      { t: "DÉSIGNATION", x: desigX }, { t: "U", x: uX },
      { t: "QTÉ", x: qR, align: "right" }, { t: "P.U.", x: puR, align: "right" }, { t: "TOTAL", x: totR, align: "right" },
    ]);
    head(); zebra = false;
    for (const c of mate) {
      const tot = c.quantity * c.unitCost; totMat += tot;
      const wl = k.wrap(c.designation, 8, false, desigW);
      const rowH = Math.max(15, wl.length * 10 + 5);
      if (k.ensure(rowH)) head();
      const top = k.y; zebraRow(top, rowH); const base = top - 11;
      wl.forEach((ln, i) => k.text(ln, desigX, base - i * 10, { size: 8 }));
      k.text(c.unit, uX, base, { size: 7.5, color: C.GREY });
      k.text(qfmt(c.quantity), qR, base, { size: 8, align: "right" });
      k.text(fmtMad(c.unitCost), puR, base, { size: 8, align: "right" });
      k.text(fmtMad(tot), totR, base, { size: 8, bold: true, align: "right" });
      k.y = top - rowH; k.hr(k.y, C.LIGHT, 0.4);
    }
    totalLine("Total matériel", totMat);
  }

  // ── 3) MAIN D'ŒUVRE ──
  let totMO = 0;
  if (mo.length) {
    sectionTitle("3 — MAIN D'ŒUVRE");
    const head = () => colHead([
      { t: "DÉSIGNATION", x: desigX },
      { t: "HEURES", x: qR, align: "right" }, { t: "P.M.H.", x: puR, align: "right" }, { t: "TOTAL", x: totR, align: "right" },
    ]);
    head(); zebra = false;
    for (const c of mo) {
      const tot = c.quantity * c.unitCost; totMO += tot;
      const wl = k.wrap(c.designation, 8, false, qR - desigX - 60);
      const rowH = Math.max(15, wl.length * 10 + 5);
      if (k.ensure(rowH)) head();
      const top = k.y; zebraRow(top, rowH); const base = top - 11;
      wl.forEach((ln, i) => k.text(ln, desigX, base - i * 10, { size: 8 }));
      k.text(qfmt(c.quantity), qR, base, { size: 8, align: "right" });
      k.text(fmtMad(c.unitCost), puR, base, { size: 8, align: "right" });
      k.text(fmtMad(tot), totR, base, { size: 8, bold: true, align: "right" });
      k.y = top - rowH; k.hr(k.y, C.LIGHT, 0.4);
    }
    totalLine("Total main d'œuvre", totMO);
  }

  // ── Synthèse : déboursé sec → coefficient → prix de vente ──
  const ds = totFourn + totMat + totMO;
  const coef = (1 + d.generalFeesRate) * (1 + d.profitRate);
  const pv = ds * coef;
  k.ensure(96);
  k.y -= 10;
  k.hr(k.y + 8, C.NAVY, 0.8);
  const sx = W - M - 280;
  const synLine = (label: string, val: string, navy?: boolean, gold?: boolean) => {
    if (navy) k.page.drawRectangle({ x: sx, y: k.y - 18, width: 280, height: 22, color: C.NAVY });
    k.text(label, sx + 12, k.y - (navy ? 12 : 4), { size: navy ? 10 : 9, bold: true, color: navy ? C.WHITE : C.NAVY });
    k.text(val, totR, k.y - (navy ? 12 : 4), { size: navy ? 12 : 9.5, bold: true, color: gold ? C.GOLD : navy ? C.WHITE : C.NAVY, align: "right" });
    k.y -= navy ? 28 : 15;
  };
  synLine("Total déboursé sec unitaire", fmtMad(ds) + " MAD");
  synLine(`Frais généraux ${Math.round(d.generalFeesRate * 100)} %  +  Bénéfice ${Math.round(d.profitRate * 100)} %`, "");
  synLine("Coefficient de vente", coef.toLocaleString("fr-FR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }));
  synLine(`PRIX DE VENTE / ${d.unit}`, fmtMad(pv) + " MAD", true, true);

  await k.finish("sous-detail-metrika.pdf");
}
