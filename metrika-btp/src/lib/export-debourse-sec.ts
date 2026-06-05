"use client";

import { CompanyExport, downloadBlob, fmtMad, moneyUnit, dataUrlToBytes } from "@/lib/export-common";
import { createPdf } from "@/lib/pdf-kit";

export interface DsComponent {
  type: string; // MAIN_OEUVRE | MATERIAUX | MATERIEL
  designation: string;
  unit: string;
  quantity: number;
  unitCost: number;
}

export interface DsOuvrage {
  designation: string;
  unit: string;
  lot?: string;
  components: DsComponent[];
}

const TYPE_LABEL: Record<string, string> = {
  MATERIAUX: "Matériaux / Fournitures",
  MATERIEL: "Matériel",
  MAIN_OEUVRE: "Main-d'œuvre",
};
const TYPE_ORDER = ["MATERIAUX", "MATERIEL", "MAIN_OEUVRE"];

export function debourseSecOf(o: DsOuvrage): number {
  return o.components.reduce((s, c) => s + c.quantity * c.unitCost, 0);
}

// ── PDF officiel : bordereau des sous-détails de déboursé sec ──────
export async function exportDebourseSecPdf(ouvrages: DsOuvrage[], company?: CompanyExport | null, opts?: { download?: boolean }): Promise<Uint8Array> {
  const k = await createPdf(company);
  const { C, W, M } = k;
  const unit = moneyUnit(company);
  k.header({ title: "DÉBOURSÉ SEC", subtitle: "Sous-détails unitaires par ouvrage" });

  // ── Récapitulatif ──
  const recapTotR = W - M - 6;
  const recapUX = W - M - 120;
  const recapNX = M + 6;
  const recapDesigX = M + 28;
  k.page.drawRectangle({ x: M, y: k.y - 16, width: W - 2 * M, height: 20, color: C.NAVY });
  k.text("N°", recapNX, k.y - 11, { size: 7.5, bold: true, color: C.WHITE });
  k.text("DÉSIGNATION DE L'OUVRAGE", recapDesigX, k.y - 11, { size: 7.5, bold: true, color: C.WHITE });
  k.text("U", recapUX, k.y - 11, { size: 7.5, bold: true, color: C.WHITE });
  k.text(`DÉBOURSÉ SEC / U (${unit})`, recapTotR, k.y - 11, { size: 7.5, bold: true, color: C.WHITE, align: "right" });
  k.y -= 24;
  ouvrages.forEach((o, i) => {
    const ds = debourseSecOf(o);
    const wl = k.wrap(o.designation, 8.5, false, recapUX - recapDesigX - 8);
    const rowH = wl.length * 11 + 4;
    if (k.ensure(rowH)) { /* page break */ }
    k.text(String(i + 1), recapNX, k.y, { size: 8.5, color: C.GREY });
    wl.forEach((ln, j) => k.text(ln, recapDesigX, k.y - j * 11, { size: 8.5 }));
    k.text(o.unit, recapUX, k.y, { size: 8.5, color: C.GREY });
    k.text(fmtMad(ds), recapTotR, k.y, { size: 8.5, bold: true, align: "right" });
    k.y -= rowH;
    k.hr(k.y + 2, C.LIGHT, 0.4);
  });
  k.y -= 8;

  // ── Détail par ouvrage ──
  const totR = W - M - 6;
  const puR = W - M - 78;
  const qR = W - M - 150;
  const uX = W - M - 200;
  const desigX = M + 8;
  const desigW = uX - desigX - 10;

  ouvrages.forEach((o, idx) => {
    k.ensure(70);
    k.y -= 6;
    // Bandeau ouvrage
    k.page.drawRectangle({ x: M, y: k.y - 18, width: W - 2 * M, height: 22, color: C.NAVY });
    const titleLines = k.wrap(`${idx + 1}.  ${o.designation}`, 10, true, W - 2 * M - 120);
    k.text(titleLines[0], desigX, k.y - 12, { size: 10, bold: true, color: C.WHITE });
    k.text(`/ ${o.unit}`, totR, k.y - 12, { size: 9, bold: true, color: C.GOLD, align: "right" });
    k.y -= 28;

    for (const type of TYPE_ORDER) {
      const rows = o.components.filter((c) => c.type === type);
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
      for (const c of rows) {
        const wl = k.wrap(c.designation, 8, false, desigW);
        const rowH = Math.max(12, wl.length * 10 + 2);
        if (k.ensure(rowH)) { /* break */ }
        wl.forEach((ln, i) => k.text(ln, desigX, k.y - i * 10, { size: 8 }));
        k.text(c.unit, uX, k.y, { size: 7.5, color: C.GREY });
        k.text(c.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 3 }), qR, k.y, { size: 8, align: "right" });
        k.text(fmtMad(c.unitCost), puR, k.y, { size: 8, align: "right" });
        k.text(fmtMad(c.quantity * c.unitCost), totR, k.y, { size: 8, bold: true, align: "right" });
        k.y -= rowH;
        k.hr(k.y + 2, C.LIGHT, 0.35);
      }
    }
    // Déboursé sec de l'ouvrage
    const ds = debourseSecOf(o);
    k.ensure(22);
    k.y -= 2;
    k.page.drawRectangle({ x: W - M - 280, y: k.y - 16, width: 280, height: 20, color: C.ZEBRA, borderColor: C.NAVY, borderWidth: 0.6 });
    k.text("Déboursé sec unitaire", W - M - 268, k.y - 11, { size: 9, bold: true, color: C.NAVY });
    k.text(fmtMad(ds) + " " + unit, totR - 8, k.y - 11, { size: 10, bold: true, color: C.GOLD, align: "right" });
    k.y -= 26;
  });

  k.y -= 16;
  k.stamp({ label: "Cachet et signature" });
  return k.finish("debourse-sec-metrika.pdf", opts);
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
  rec.addRow([`Déboursé sec — ${company?.name ?? "Metrika Métrage BTP"}`]).font = { bold: true, size: 13 };
  rec.addRow([]);
  const rh = rec.addRow(["N°", "Désignation", "U.", `Déboursé sec / U. (${unit})`]);
  rh.font = { bold: true, color: { argb: "FFFFFFFF" } };
  rh.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14233F" } }; });
  rec.columns = [{ width: 6 }, { width: 50 }, { width: 8 }, { width: 20 }];
  ouvrages.forEach((o, i) => rec.addRow([i + 1, o.designation, o.unit, Math.round(debourseSecOf(o) * 100) / 100]));

  // Feuilles détail (une par ouvrage, nom limité à 31 car.)
  ouvrages.forEach((o, i) => {
    const name = `${i + 1}. ${o.designation}`.slice(0, 31).replace(/[\\/?*[\]:]/g, " ");
    const ws = wb.addWorksheet(name || `Ouvrage ${i + 1}`);
    ws.columns = [{ width: 16 }, { width: 40 }, { width: 8 }, { width: 12 }, { width: 14 }, { width: 16 }];
    ws.addRow([o.designation, "", "", "", "", `/ ${o.unit}`]).font = { bold: true, size: 12 };
    ws.addRow([]);
    const hdr = ws.addRow(["Type", "Désignation", "U.", "Qté", `Coût U. (${unit})`, `Montant (${unit})`]);
    hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
    hdr.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14233F" } }; });
    for (const type of TYPE_ORDER) {
      for (const c of o.components.filter((x) => x.type === type)) {
        ws.addRow([TYPE_LABEL[type] ?? type, c.designation, c.unit, c.quantity, c.unitCost, c.quantity * c.unitCost]);
      }
    }
    ws.addRow([]);
    ws.addRow(["", "", "", "", "Déboursé sec unitaire", Math.round(debourseSecOf(o) * 100) / 100]).font = { bold: true };
  });

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "debourse-sec-metrika.xlsx");
}
