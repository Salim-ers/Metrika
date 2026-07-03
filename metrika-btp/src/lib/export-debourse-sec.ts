"use client";

import { CompanyExport, downloadBlob, fmtMad, moneyUnit, dataUrlToBytes } from "@/lib/export-common";
import { createPdf } from "@/lib/pdf-kit";
import { computeSousDetail } from "@/lib/price-math";

export interface DsComponent {
  type: string; // MAIN_OEUVRE | MATERIAUX | MATERIEL | TRANSPORT
  designation: string;
  unit: string;
  quantity: number;
  unitCost: number;
  costSource?: string | null;
}

export interface DsOuvrage {
  designation: string;
  unit: string;
  lot?: string;
  components: DsComponent[];
  /** Paramètres d'étude de prix (sous-détail complet). */
  wasteRate?: number;
  generalFeesRate?: number;
  profitRate?: number;
  targetPrice?: number | null;
  debourseSec?: number;
  sellingPrice?: number;
  hypotheses?: string[];
  sources?: string[];
  pointsToVerify?: string[];
}

const VALIDATION_NOTICE =
  "Document généré automatiquement à partir des pièces fournies — validation MOE / BET / Bureau de contrôle requise.";

const TYPE_LABEL: Record<string, string> = {
  MATERIAUX: "Matériaux / Fournitures",
  MATERIEL: "Matériel",
  MAIN_OEUVRE: "Main-d'œuvre",
  TRANSPORT: "Transport / Amenée-repli",
};
const TYPE_ORDER = ["MATERIAUX", "MATERIEL", "MAIN_OEUVRE", "TRANSPORT"];

export function debourseSecOf(o: DsOuvrage): number {
  return o.components.reduce((s, c) => s + c.quantity * c.unitCost, 0);
}

/** Calcul complet (pertes, FG, marge, écart) — source unique : price-math. */
function computedOf(o: DsOuvrage) {
  return computeSousDetail({
    components: o.components,
    wasteRate: o.wasteRate,
    generalFeesRate: o.generalFeesRate,
    profitRate: o.profitRate,
    targetPrice: o.targetPrice,
  });
}

// ── PDF officiel : sous-détails de prix par ouvrage ────────────────
export async function exportDebourseSecPdf(ouvrages: DsOuvrage[], company?: CompanyExport | null, opts?: { download?: boolean }): Promise<Uint8Array> {
  const k = await createPdf(company);
  const { C, W, M } = k;
  const unit = moneyUnit(company);
  k.header({ title: "SOUS-DÉTAILS", subtitle: "Sous-détails de prix unitaires par ouvrage" });

  // ── Récapitulatif ──
  const recapTotR = W - M - 6;
  const recapPvR = W - M - 96;
  const recapUX = W - M - 190;
  const recapNX = M + 6;
  const recapDesigX = M + 28;
  k.page.drawRectangle({ x: M, y: k.y - 16, width: W - 2 * M, height: 20, color: C.NAVY });
  k.text("N°", recapNX, k.y - 11, { size: 7.5, bold: true, color: C.WHITE });
  k.text("DÉSIGNATION DE L'OUVRAGE", recapDesigX, k.y - 11, { size: 7.5, bold: true, color: C.WHITE });
  k.text("U", recapUX, k.y - 11, { size: 7.5, bold: true, color: C.WHITE });
  k.text(`PV HT / U (${unit})`, recapPvR, k.y - 11, { size: 7.5, bold: true, color: C.WHITE, align: "right" });
  k.text("ÉCART CDPGF", recapTotR, k.y - 11, { size: 7.5, bold: true, color: C.WHITE, align: "right" });
  k.y -= 24;
  ouvrages.forEach((o, i) => {
    const c = computedOf(o);
    const wl = k.wrap(`${o.lot ? `[${o.lot}] ` : ""}${o.designation}`, 8.5, false, recapUX - recapDesigX - 8);
    const rowH = wl.length * 11 + 4;
    if (k.ensure(rowH)) { /* page break */ }
    k.text(String(i + 1), recapNX, k.y, { size: 8.5, color: C.GREY });
    wl.forEach((ln, j) => k.text(ln, recapDesigX, k.y - j * 11, { size: 8.5 }));
    k.text(o.unit, recapUX, k.y, { size: 8.5, color: C.GREY });
    k.text(fmtMad(c.sellingPrice) + (c.complete ? "" : " *"), recapPvR, k.y, { size: 8.5, bold: true, align: "right", color: c.complete ? C.NAVY : C.GREY });
    k.text(c.ecartPct !== null ? `${c.ecartPct >= 0 ? "+" : ""}${c.ecartPct} %` : "—", recapTotR, k.y, { size: 8.5, align: "right", color: C.GREY });
    k.y -= rowH;
    k.hr(k.y + 2, C.LIGHT, 0.4);
  });
  const anyIncomplete = ouvrages.some((o) => !computedOf(o).complete);
  if (anyIncomplete) {
    k.ensure(12);
    k.text("* PV partiel : des coûts restent « à renseigner » (bibliothèque ou saisie) — jamais estimés automatiquement.", M, k.y, { size: 7, color: C.GREY });
    k.y -= 12;
  }
  k.y -= 8;

  // ── Détail par ouvrage ──
  const totR = W - M - 6;
  const puR = W - M - 78;
  const qR = W - M - 150;
  const uX = W - M - 200;
  const desigX = M + 8;
  const desigW = uX - desigX - 10;

  ouvrages.forEach((o, idx) => {
    const c = computedOf(o);
    k.ensure(70);
    k.y -= 6;
    // Bandeau ouvrage
    k.page.drawRectangle({ x: M, y: k.y - 18, width: W - 2 * M, height: 22, color: C.NAVY });
    const titleLines = k.wrap(`${idx + 1}.  ${o.designation}`, 10, true, W - 2 * M - 120);
    k.text(titleLines[0], desigX, k.y - 12, { size: 10, bold: true, color: C.WHITE });
    k.text(`/ ${o.unit}`, totR, k.y - 12, { size: 9, bold: true, color: C.GOLD, align: "right" });
    k.y -= 28;

    for (const type of TYPE_ORDER) {
      const rows = o.components.filter((x) => x.type === type);
      if (!rows.length) continue;
      k.ensure(34);
      k.page.drawRectangle({ x: M, y: k.y - 13, width: W - 2 * M, height: 16, color: C.GOLD });
      k.text(TYPE_LABEL[type] ?? type, desigX, k.y - 9, { size: 8, bold: true, color: C.NAVY });
      k.y -= 18;
      // entêtes colonnes
      k.text("Désignation", desigX, k.y, { size: 6.5, bold: true, color: C.GREY });
      k.text("U", uX, k.y, { size: 6.5, bold: true, color: C.GREY });
      k.text("Qté", qR, k.y, { size: 6.5, bold: true, color: C.GREY, align: "right" });
      k.text("Coût U.", puR, k.y, { size: 6.5, bold: true, color: C.GREY, align: "right" });
      k.text("Montant", totR, k.y, { size: 6.5, bold: true, color: C.GREY, align: "right" });
      k.y -= 12;
      for (const comp of rows) {
        const wl = k.wrap(comp.designation, 8, false, desigW);
        const rowH = Math.max(12, wl.length * 10 + 2);
        if (k.ensure(rowH)) { /* break */ }
        const costMissing = comp.unitCost <= 0 && !comp.costSource;
        wl.forEach((ln, i) => k.text(ln, desigX, k.y - i * 10, { size: 8 }));
        k.text(comp.unit, uX, k.y, { size: 7.5, color: C.GREY });
        k.text(comp.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 3 }), qR, k.y, { size: 8, align: "right" });
        k.text(costMissing ? "À renseigner" : fmtMad(comp.unitCost), puR, k.y, { size: 8, align: "right", color: costMissing ? C.GREY : C.NAVY });
        k.text(costMissing ? "—" : fmtMad(comp.quantity * comp.unitCost), totR, k.y, { size: 8, bold: true, align: "right" });
        k.y -= rowH;
        k.hr(k.y + 2, C.LIGHT, 0.35);
      }
    }

    // Cascade de prix : déboursé sec → FG → marge → PV HT → écart.
    k.ensure(96);
    k.y -= 4;
    const cascX = W - M - 300;
    const cascLine = (label: string, value: string, opts2?: { bold?: boolean; gold?: boolean }) => {
      k.text(label, cascX, k.y, { size: 8.5, bold: opts2?.bold, color: opts2?.bold ? C.NAVY : C.GREY });
      k.text(value, totR - 4, k.y, { size: opts2?.bold ? 9.5 : 8.5, bold: opts2?.bold, align: "right", color: opts2?.gold ? C.GOLD : C.NAVY });
      k.y -= 13;
    };
    if (c.wasteAmount > 0) cascLine(`Pertes / chutes (${Math.round((o.wasteRate ?? 0) * 100)} % matériaux)`, fmtMad(c.wasteAmount));
    cascLine("Déboursé sec unitaire", fmtMad(c.debourseSec), { bold: true });
    cascLine(`Frais généraux (${Math.round((o.generalFeesRate ?? 0) * 100)} %)`, fmtMad(c.generalFees));
    cascLine(`Marge (${Math.round((o.profitRate ?? 0) * 100)} %)`, fmtMad(c.profit));
    k.page.drawRectangle({ x: cascX - 8, y: k.y - 14, width: totR - cascX + 12, height: 18, color: C.ZEBRA, borderColor: C.NAVY, borderWidth: 0.6 });
    cascLine(`Prix de vente HT / ${o.unit}`, `${fmtMad(c.sellingPrice)} ${unit}${c.complete ? "" : " *"}`, { bold: true, gold: true });
    if (typeof o.targetPrice === "number" && o.targetPrice > 0) {
      cascLine("Prix CDPGF cible", fmtMad(o.targetPrice));
      if (c.ecart !== null) cascLine("Écart vs CDPGF", `${c.ecart >= 0 ? "+" : ""}${fmtMad(c.ecart)} (${c.ecartPct! >= 0 ? "+" : ""}${c.ecartPct} %)`, { bold: true });
    }

    // Hypothèses / points à vérifier (traçabilité).
    const blocks: { title: string; items: string[] }[] = [
      { title: "Sources", items: o.sources ?? [] },
      { title: "Hypothèses (non contractuelles)", items: o.hypotheses ?? [] },
      { title: "Points à vérifier avant chiffrage", items: o.pointsToVerify ?? [] },
    ].filter((b) => b.items.length > 0);
    for (const b of blocks) {
      k.ensure(24);
      k.y -= 2;
      k.text(b.title.toUpperCase(), desigX, k.y, { size: 7, bold: true, color: C.GREY });
      k.y -= 10;
      for (const it of b.items.slice(0, 12)) {
        for (const ln of k.wrap(`•  ${it}`, 7.5, false, W - 2 * M - 16)) {
          if (k.ensure(10)) { /* break */ }
          k.text(ln, desigX + 4, k.y, { size: 7.5, color: C.NAVY });
          k.y -= 10;
        }
      }
      k.y -= 2;
    }
    k.y -= 14;
  });

  k.ensure(14);
  k.text(VALIDATION_NOTICE, M, k.y, { size: 7, color: C.GREY });
  k.y -= 16;
  k.stamp({ label: "Cachet et signature" });
  return k.finish("sous-details-metrika.pdf", opts);
}

// ── Excel ─────────────────────────────────────────────────────────
export async function exportDebourseSecExcel(ouvrages: DsOuvrage[], company?: CompanyExport | null) {
  const mod = await import("exceljs");
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = new ExcelJS.Workbook();
  const unit = moneyUnit(company);

  // Feuille récap
  const rec = wb.addWorksheet("Récapitulatif");
  const logo = dataUrlToBytes(company?.logoUrl);
  if (logo) {
    const id = wb.addImage({ base64: (company!.logoUrl as string).split(",")[1], extension: logo.mime.includes("png") ? "png" : "jpeg" });
    rec.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 48 } });
    rec.getRow(1).height = 40;
  }
  rec.addRow([]);
  rec.addRow([`Sous-détails de prix — ${company?.name ?? "Metrika Métrage BTP"}`]).font = { bold: true, size: 13 };
  rec.addRow([VALIDATION_NOTICE]).font = { italic: true, size: 9, color: { argb: "FF888888" } };
  rec.addRow([]);
  const rh = rec.addRow(["N°", "Lot", "Désignation", "U.", `Déboursé sec / U (${unit})`, `PV HT / U (${unit})`, `Prix CDPGF (${unit})`, "Écart %"]);
  rh.font = { bold: true, color: { argb: "FFFFFFFF" } };
  rh.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14233F" } }; });
  rec.columns = [{ width: 6 }, { width: 18 }, { width: 48 }, { width: 7 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 10 }];
  ouvrages.forEach((o, i) => {
    const c = computedOf(o);
    rec.addRow([
      i + 1, o.lot ?? "", o.designation, o.unit,
      c.debourseSec, c.sellingPrice,
      typeof o.targetPrice === "number" && o.targetPrice > 0 ? o.targetPrice : "—",
      c.ecartPct !== null ? c.ecartPct / 100 : "—",
    ]);
    const row = rec.lastRow!;
    row.getCell(5).numFmt = "#,##0.00";
    row.getCell(6).numFmt = "#,##0.00";
    if (typeof o.targetPrice === "number" && o.targetPrice > 0) row.getCell(7).numFmt = "#,##0.00";
    if (c.ecartPct !== null) row.getCell(8).numFmt = "+0.0%;-0.0%";
    if (!c.complete) row.getCell(6).font = { italic: true, color: { argb: "FF9C641B" } };
  });

  // Feuilles détail (une par ouvrage, nom limité à 31 car.)
  ouvrages.forEach((o, i) => {
    const c = computedOf(o);
    const name = `${i + 1}. ${o.designation}`.slice(0, 31).replace(/[\\/?*[\]:]/g, " ");
    const ws = wb.addWorksheet(name || `Ouvrage ${i + 1}`);
    ws.columns = [{ width: 20 }, { width: 40 }, { width: 8 }, { width: 12 }, { width: 14 }, { width: 16 }];
    ws.addRow([o.designation, "", "", "", "", `/ ${o.unit}`]).font = { bold: true, size: 12 };
    ws.addRow([]);
    const hdr = ws.addRow(["Type", "Désignation", "U.", "Qté / u", `Coût U. (${unit})`, `Montant (${unit})`]);
    hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
    hdr.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14233F" } }; });
    for (const type of TYPE_ORDER) {
      for (const comp of o.components.filter((x) => x.type === type)) {
        const costMissing = comp.unitCost <= 0 && !comp.costSource;
        const row = ws.addRow([
          TYPE_LABEL[type] ?? type, comp.designation, comp.unit, comp.quantity,
          costMissing ? "À renseigner" : comp.unitCost,
          costMissing ? "—" : comp.quantity * comp.unitCost,
        ]);
        if (costMissing) row.getCell(5).font = { italic: true, color: { argb: "FF9C641B" } };
        else { row.getCell(5).numFmt = "#,##0.00"; row.getCell(6).numFmt = "#,##0.00"; }
      }
    }
    ws.addRow([]);
    const casc: [string, number][] = [
      [`Pertes / chutes (${Math.round((o.wasteRate ?? 0) * 100)}% matériaux)`, c.wasteAmount],
      ["Déboursé sec unitaire", c.debourseSec],
      [`Frais généraux (${Math.round((o.generalFeesRate ?? 0) * 100)}%)`, c.generalFees],
      [`Marge (${Math.round((o.profitRate ?? 0) * 100)}%)`, c.profit],
      [`Prix de vente HT / ${o.unit}`, c.sellingPrice],
    ];
    for (const [label, value] of casc) {
      const row = ws.addRow(["", "", "", "", label, Math.round(value * 100) / 100]);
      row.getCell(6).numFmt = "#,##0.00";
      if (label.startsWith("Prix de vente") || label.startsWith("Déboursé")) row.font = { bold: true };
    }
    if (typeof o.targetPrice === "number" && o.targetPrice > 0 && c.ecart !== null) {
      ws.addRow(["", "", "", "", "Prix CDPGF cible", o.targetPrice]).getCell(6).numFmt = "#,##0.00";
      const er = ws.addRow(["", "", "", "", "Écart vs CDPGF", Math.round(c.ecart * 100) / 100]);
      er.font = { bold: true };
      er.getCell(6).numFmt = "#,##0.00";
    }
    const extras: [string, string[]][] = [
      ["Sources", o.sources ?? []],
      ["Hypothèses (non contractuelles)", o.hypotheses ?? []],
      ["Points à vérifier", o.pointsToVerify ?? []],
    ];
    for (const [title, items] of extras) {
      if (!items.length) continue;
      ws.addRow([]);
      ws.addRow([title]).font = { bold: true, color: { argb: "FF9C641B" } };
      for (const it of items) ws.addRow(["", it]).font = { color: { argb: "FF555555" } };
    }
  });

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "sous-details-metrika.xlsx");
}
