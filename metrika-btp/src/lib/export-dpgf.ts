"use client";

import { CompanyExport, fmtMad, moneyUnit } from "@/lib/export-common";
import { createPdf } from "@/lib/pdf-kit";
import { STATUS_META, isValidStatus, NOT_FOUND_LABELS } from "@/lib/fidelity";
import { quantityKnown, priceKnown } from "@/lib/price-math";

export interface DpgfExportLine {
  lot: string;
  code?: string;
  designation: string;
  description?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  quantitySource?: string;
  status?: string;
  confidence?: string;
  sourceExcerpt?: string;
  calculation?: string;
  priceSource?: string | null;
  comment?: string;
  cctpArticle?: string | null;
}

export const VALIDATION_NOTICE =
  "Document généré automatiquement à partir des pièces fournies — validation MOE / BET / Bureau de contrôle requise.";

/** Libellé court de statut pour l'export (traçabilité §8). */
const statusLabel = (s?: string): string => (isValidStatus(s) ? STATUS_META[s].label : "—");
/** Quantité : « À métrer » tant qu'elle n'est pas sourcée (jamais 0 trompeur). */
const qtyCell = (l: DpgfExportLine): string => (quantityKnown(l) ? String(l.quantity) : NOT_FOUND_LABELS.quantity);
/** Prix : « À renseigner » tant qu'aucun P.U. n'est saisi (jamais 0 trompeur). */
const priceCell = (l: DpgfExportLine): string => (priceKnown(l) ? fmtMad(l.unitPrice) : NOT_FOUND_LABELS.price);
const amountCell = (l: DpgfExportLine): string => (quantityKnown(l) && priceKnown(l) ? fmtMad(l.quantity * l.unitPrice) : "—");

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const fmt = (n: number) => fmtMad(n);

/** Regroupement par lot (ordre d'apparition). */
function groupByLot(lines: DpgfExportLine[]): { lot: string; items: DpgfExportLine[] }[] {
  const groups: { lot: string; items: DpgfExportLine[] }[] = [];
  for (const l of lines) {
    const lot = l.lot || "Sans lot";
    const g = groups.find((x) => x.lot === lot);
    if (g) g.items.push(l); else groups.push({ lot, items: [l] });
  }
  return groups;
}

// ── Excel premium ─────────────────────────────────────────────────
export async function exportDpgfExcel(lines: DpgfExportLine[], company?: CompanyExport | null, provisional = true) {
  const unit = moneyUnit(company);
  const mod = await import("exceljs");
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = (company?.name as string) || "Metrika Métrage BTP";
  const ws = wb.addWorksheet("DPGF", { views: [{ state: "frozen", ySplit: 4 }] });

  ws.columns = [
    { header: "", key: "ref", width: 9 },
    { header: "", key: "designation", width: 52 },
    { header: "", key: "article", width: 34 },
    { header: "", key: "unit", width: 7 },
    { header: "", key: "quantity", width: 12 },
    { header: "", key: "unitPrice", width: 14 },
    { header: "", key: "total", width: 15 },
    { header: "", key: "source", width: 12 },
    { header: "", key: "status", width: 15 },
    { header: "", key: "comment", width: 36 },
  ];

  // Titre + mentions (lignes 1-3), en-têtes en ligne 4.
  ws.mergeCells("A1:J1");
  ws.getCell("A1").value = `DPGF — Décomposition du Prix Global et Forfaitaire${company?.name ? ` — ${company.name}` : ""}`;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF14233F" } };
  ws.mergeCells("A2:J2");
  ws.getCell("A2").value = provisional
    ? "DPGF provisoire généré à partir des pièces fournies — non contractuel."
    : "Structure conforme au CDPGF officiel fourni (cadre repris à l'identique).";
  ws.getCell("A2").font = { italic: true, color: { argb: "FF9C641B" } };
  ws.mergeCells("A3:J3");
  ws.getCell("A3").value = VALIDATION_NOTICE;
  ws.getCell("A3").font = { italic: true, size: 9, color: { argb: "FF888888" } };

  const headRow = ws.getRow(4);
  headRow.values = ["RÉF", "DÉSIGNATION", "ARTICLE CCTP SOURCE", "U", "Q", `PRIX U. HT (${unit})`, `TOTAL HT (${unit})`, "SOURCE QTÉ", "STATUT", "COMMENTAIRE / FORMULE"];
  headRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headRow.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14233F" } };
    c.border = { bottom: { style: "thin", color: { argb: "FFE1A532" } } };
    c.alignment = { vertical: "middle" };
  });

  const moneyFmt = `#,##0.00`;
  const groups = groupByLot(lines);
  const subtotalRows: number[] = [];
  let n = 0;

  for (const g of groups) {
    // Bandeau de lot.
    const lotRow = ws.addRow({ ref: "", designation: g.lot.toUpperCase() });
    ws.mergeCells(`A${lotRow.number}:J${lotRow.number}`);
    lotRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4D98F" } };
    lotRow.font = { bold: true, color: { argb: "FF14233F" } };

    const firstDataRow = lotRow.number + 1;
    for (const l of g.items) {
      n++;
      const qOk = quantityKnown(l);
      const pOk = priceKnown(l);
      const row = ws.addRow({
        ref: l.code || String(n),
        designation: l.designation,
        article: l.cctpArticle ?? "",
        unit: l.unit,
        quantity: qOk ? l.quantity : NOT_FOUND_LABELS.quantity,
        unitPrice: pOk ? l.unitPrice : NOT_FOUND_LABELS.price,
        source: l.quantitySource ?? "",
        status: statusLabel(l.status),
        comment: [l.calculation ? `Calcul : ${l.calculation}` : "", l.sourceExcerpt ? `Source : ${l.sourceExcerpt}` : "", l.comment ?? ""].filter(Boolean).join(" · ") || (l.description ?? ""),
      });
      // Total = formule Excel (recalcul dynamique si l'utilisateur ajuste Q ou PU).
      if (qOk && pOk) {
        row.getCell("total").value = { formula: `E${row.number}*F${row.number}` };
      } else {
        row.getCell("total").value = "—";
        row.getCell(qOk ? "unitPrice" : "quantity").font = { italic: true, color: { argb: "FF9C641B" } };
        if (!qOk && !pOk) row.getCell("unitPrice").font = { italic: true, color: { argb: "FF9C641B" } };
      }
      row.getCell("quantity").numFmt = qOk ? "#,##0.00" : "@";
      row.getCell("unitPrice").numFmt = pOk ? moneyFmt : "@";
      row.getCell("total").numFmt = moneyFmt;
      row.getCell("quantity").alignment = { horizontal: "right" };
      row.getCell("unitPrice").alignment = { horizontal: "right" };
      row.getCell("total").alignment = { horizontal: "right" };
    }
    // Sous-total du lot (formule SUM sur la plage du lot).
    const lastDataRow = ws.lastRow!.number;
    const st = ws.addRow({ designation: `Sous-total — ${g.lot}` });
    st.font = { bold: true };
    st.getCell("total").value = lastDataRow >= firstDataRow
      ? { formula: `SUM(G${firstDataRow}:G${lastDataRow})` }
      : 0;
    st.getCell("total").numFmt = moneyFmt;
    st.getCell("total").alignment = { horizontal: "right" };
    st.eachCell((c) => { c.border = { top: { style: "thin", color: { argb: "FF14233F" } } }; });
    subtotalRows.push(st.number);
  }

  // Totaux généraux : HT = somme des sous-totaux ; TVA ; TTC.
  const vatRate = Number(company?.vatRate) || 20;
  ws.addRow({});
  const ht = ws.addRow({ designation: "TOTAL HT" });
  ht.font = { bold: true };
  ht.getCell("total").value = subtotalRows.length
    ? { formula: subtotalRows.map((r) => `G${r}`).join("+") }
    : 0;
  const tva = ws.addRow({ designation: `TVA (${vatRate} %)` });
  tva.getCell("total").value = { formula: `G${ht.number}*${vatRate / 100}` };
  const ttc = ws.addRow({ designation: "TOTAL TTC" });
  ttc.font = { bold: true, color: { argb: "FF14233F" } };
  ttc.getCell("total").value = { formula: `G${ht.number}+G${tva.number}` };
  for (const r of [ht, tva, ttc]) {
    r.getCell("total").numFmt = moneyFmt;
    r.getCell("total").alignment = { horizontal: "right" };
  }
  ttc.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDF8EC" } }; });

  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 10 } };

  const buf = await wb.xlsx.writeBuffer();
  download(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "dpgf-metrika.xlsx"
  );
}

// ── DOCX ──────────────────────────────────────────────────────────
export async function exportDpgfDocx(lines: DpgfExportLine[], company?: CompanyExport | null, provisional = true) {
  const unit = moneyUnit(company);
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType } =
    await import("docx");
  const header = ["Réf", "Désignation", "Article CCTP", "U.", "Qté", "P.U.", "Total HT", "Statut"];
  const cell = (t: string, bold = false, align: "left" | "right" = "left") =>
    new TableCell({
      children: [new Paragraph({ alignment: align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: t, bold })] })],
    });
  const rows = [
    new TableRow({ children: header.map((h, i) => cell(h, true, i >= 4 && i <= 6 ? "right" : "left")) }),
    ...lines.map((l, i) =>
      new TableRow({
        children: [
          cell(l.code || String(i + 1)), cell(l.designation), cell(l.cctpArticle ?? "—"), cell(l.unit),
          cell(qtyCell(l), false, "right"),
          cell(priceCell(l), false, "right"),
          cell(amountCell(l), false, "right"),
          cell(statusLabel(l.status)),
        ],
      })
    ),
  ];
  const totalHT = lines.reduce((s, l) => s + (quantityKnown(l) && priceKnown(l) ? l.quantity * l.unitPrice : 0), 0);
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("DPGF — Décomposition du Prix Global et Forfaitaire")] }),
        new Paragraph({ children: [new TextRun({ text: (company?.name as string) || "Metrika Métrage BTP", color: "888888" })] }),
        new Paragraph({ children: [new TextRun({
          text: provisional
            ? "DPGF provisoire généré à partir des pièces fournies — non contractuel."
            : "Structure conforme au CDPGF officiel fourni (cadre repris à l'identique).",
          italics: true, color: "9C641B",
        })] }),
        new Paragraph({ children: [new TextRun({ text: VALIDATION_NOTICE, italics: true, size: 16, color: "888888" })] }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Total HT : ${fmt(totalHT)} ${unit}`, bold: true })] }),
      ],
    }],
  });
  download(await Packer.toBlob(doc), "dpgf-metrika.docx");
}

// ── PDF officiel (kit Metrika) ────────────────────────────────────
export async function exportDpgfPdf(lines: DpgfExportLine[], company?: CompanyExport | null, vatRate = 20, opts?: { download?: boolean; provisional?: boolean }): Promise<Uint8Array> {
  const k = await createPdf(company);
  const { C, W, M } = k;
  const unit = moneyUnit(company);
  k.header({ title: "DPGF", subtitle: "Décomposition du Prix Global et Forfaitaire" });

  // Mention de fiabilité : provisoire (non contractuel) vs cadre officiel.
  if (opts?.provisional !== false) {
    k.page.drawRectangle({ x: M, y: k.y - 15, width: W - 2 * M, height: 17, color: C.ZEBRA });
    k.text("DPGF PROVISOIRE généré à partir des pièces fournies — NON CONTRACTUEL.", M + 6, k.y - 10, { size: 7.5, bold: true, color: C.GREY });
    k.y -= 24;
  } else {
    k.text("Structure conforme au CDPGF officiel fourni (cadre repris à l'identique).", M, k.y - 8, { size: 7.5, bold: true, color: C.GREY });
    k.y -= 18;
  }

  const groups = groupByLot(lines);

  // Géométrie des colonnes (de droite à gauche) avec marges franches pour éviter
  // tout chevauchement entre désignation / unité / quantité / P.U. / montant.
  const right = W - M;
  const totR = right;          // Montant HT (aligné à droite)
  const puR = right - 84;      // P.U. HT (aligné à droite)
  const qtyR = puR - 64;       // Quantité (aligné à droite)
  const uX = qtyR - 74;        // Unité (aligné à gauche)
  const nX = M + 4;            // N°
  const desigX = M + 24;       // Désignation (aligné à gauche)
  const desigW = uX - desigX - 12;
  const head = () => {
    k.page.drawRectangle({ x: M, y: k.y - 17, width: W - 2 * M, height: 20, color: C.NAVY });
    const hb = k.y - 11; // baseline des en-têtes
    k.text("N°", nX, hb, { size: 7.5, bold: true, color: C.WHITE });
    k.text("DÉSIGNATION DES OUVRAGES", desigX, hb, { size: 7.5, bold: true, color: C.WHITE });
    k.text("UNITÉ", uX, hb, { size: 7.5, bold: true, color: C.WHITE });
    k.text("QTÉ", qtyR, hb, { size: 7.5, bold: true, color: C.WHITE, align: "right" });
    k.text("P.U. HT", puR, hb, { size: 7.5, bold: true, color: C.WHITE, align: "right" });
    k.text("MONTANT HT", totR, hb, { size: 7.5, bold: true, color: C.WHITE, align: "right" });
    k.y -= 25;
  };
  head();

  let n = 0;
  let totalHT = 0;
  let zebra = false;
  for (const g of groups) {
    if (k.ensure(48)) head();
    // Bandeau de lot
    k.y -= 4;
    k.page.drawRectangle({ x: M, y: k.y - 15, width: W - 2 * M, height: 18, color: C.GOLD });
    k.text(g.lot.toUpperCase(), desigX, k.y - 10, { size: 8.5, bold: true, color: C.NAVY });
    k.y -= 22;
    zebra = false;
    let sub = 0;
    for (const l of g.items) {
      n++;
      const qOk = quantityKnown(l);
      const pOk = priceKnown(l);
      const amt = qOk && pOk ? l.quantity * l.unitPrice : 0;
      sub += amt; totalHT += amt;
      const wl = k.wrap(l.designation, 8.5, true, desigW);
      // Ligne de traçabilité (article CCTP · source · statut · formule) sous la désignation.
      const metaParts: string[] = [];
      if (l.cctpArticle) metaParts.push(`art. CCTP : ${l.cctpArticle}`);
      if (l.quantitySource) metaParts.push(`source : ${l.quantitySource}`);
      const st = statusLabel(l.status);
      if (st !== "—") metaParts.push(st);
      if (l.calculation) metaParts.push(`calcul : ${l.calculation}`);
      const metaLines = metaParts.length ? k.wrap(metaParts.join("  ·  "), 6.5, false, desigW) : [];
      const rowH = Math.max(22, wl.length * 11 + 10 + metaLines.length * 8);
      if (k.ensure(rowH)) { head(); zebra = false; }
      const top = k.y;
      // Bande zébrée (alternée) en guise de séparation — pas de trait qui barre le texte.
      if (zebra) k.page.drawRectangle({ x: M, y: top - rowH, width: W - 2 * M, height: rowH, color: C.ZEBRA });
      zebra = !zebra;
      const base = top - 13; // baseline de la 1ʳᵉ ligne, alignée pour toutes les colonnes
      k.text(l.code || String(n), nX, base, { size: 8, color: C.GREY });
      wl.forEach((ln, i) => k.text(ln, desigX, base - i * 11, { size: 8.5, bold: i === 0, color: C.NAVY }));
      metaLines.forEach((ln, i) => k.text(ln, desigX, base - wl.length * 11 + 1 - i * 8, { size: 6.5, color: C.GREY }));
      k.text(l.unit, uX, base, { size: 8, color: C.GREY });
      k.text(qtyCell(l), qtyR, base, { size: 8, align: "right", color: qOk ? C.NAVY : C.GREY });
      k.text(priceCell(l), puR, base, { size: 8, align: "right", color: pOk ? C.NAVY : C.GREY });
      k.text(amountCell(l), totR, base, { size: 8, bold: true, align: "right", color: C.NAVY });
      k.y = top - rowH;
    }
    // Sous-total du lot (bloc à droite, sans trait traversant)
    if (k.ensure(24)) head();
    k.hr(k.y, C.LIGHT, 0.6);
    k.y -= 6;
    const stW = 300, stX = W - M - stW;
    k.page.drawRectangle({ x: stX, y: k.y - 14, width: stW, height: 17, color: C.ZEBRA });
    k.text(`Sous-total — ${g.lot}`, puR, k.y - 10, { size: 8.5, bold: true, color: C.GREY, align: "right" });
    k.text(fmt(sub) + " " + unit, totR - 6, k.y - 10, { size: 8.5, bold: true, color: C.NAVY, align: "right" });
    k.y -= 24;
  }

  // ── Totaux HT / TVA / TTC ──
  const vat = totalHT * (vatRate / 100);
  const ttc = totalHT + vat;
  k.ensure(96);
  k.y -= 8;
  const boxW = 250, boxX = W - M - boxW;
  k.text("Total HT", boxX + 12, k.y, { size: 9.5, color: C.GREY }); k.text(fmt(totalHT), totR, k.y, { size: 9.5, bold: true, align: "right" }); k.y -= 15;
  k.text(`TVA (${vatRate} %)`, boxX + 12, k.y, { size: 9.5, color: C.GREY }); k.text(fmt(vat), totR, k.y, { size: 9.5, align: "right" }); k.y -= 10;
  k.page.drawRectangle({ x: boxX, y: k.y - 24, width: boxW, height: 26, color: C.NAVY });
  k.text("TOTAL TTC", boxX + 12, k.y - 16, { size: 11, bold: true, color: C.WHITE });
  k.text(fmt(ttc) + " " + unit, totR, k.y - 16, { size: 12, bold: true, color: C.GOLD, align: "right" });
  k.y -= 34;

  // Quantités / prix manquants : totaux partiels signalés (jamais masqués).
  const missingQ = lines.filter((l) => !quantityKnown(l)).length;
  const missingP = lines.filter((l) => !priceKnown(l)).length;
  if (missingQ > 0 || missingP > 0) {
    k.ensure(16);
    k.text(
      `Totaux PARTIELS : ${missingQ} quantité(s) « ${NOT_FOUND_LABELS.quantity} » et ${missingP} prix « ${NOT_FOUND_LABELS.price} » restent à renseigner.`,
      M, k.y, { size: 7.5, bold: true, color: C.GREY },
    );
    k.y -= 12;
  }
  k.ensure(14);
  k.text(VALIDATION_NOTICE, M, k.y, { size: 7, color: C.GREY });
  k.y -= 14;

  k.stamp({ label: "Cachet et signature" });
  return k.finish("dpgf-metrika.pdf", opts);
}
