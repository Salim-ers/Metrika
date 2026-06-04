"use client";

import { CompanyExport, fmtMad, moneyUnit } from "@/lib/export-common";
import { createPdf } from "@/lib/pdf-kit";

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
export async function exportDpgfExcel(lines: DpgfExportLine[], company?: CompanyExport | null) {
  const unit = moneyUnit(company);
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
    { header: `P.U. (${unit})`, key: "unitPrice", width: 14 },
    { header: `Total HT (${unit})`, key: "total", width: 16 },
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
export async function exportDpgfDocx(lines: DpgfExportLine[], company?: CompanyExport | null) {
  const unit = moneyUnit(company);
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
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Total HT : ${fmt(totalHT)} ${unit}`, bold: true })] }),
      ],
    }],
  });
  download(await Packer.toBlob(doc), "dpgf-metrika.docx");
}

// ── PDF officiel (kit Metrika) ────────────────────────────────────
export async function exportDpgfPdf(lines: DpgfExportLine[], company?: CompanyExport | null, vatRate = 20) {
  const k = await createPdf(company);
  const { C, W, M } = k;
  const unit = moneyUnit(company);
  k.header({ title: "DPGF", subtitle: "Décomposition du Prix Global et Forfaitaire" });

  // Regroupement par lot (ordre d'apparition).
  const groups: { lot: string; items: DpgfExportLine[] }[] = [];
  for (const l of lines) {
    const lot = l.lot || "Sans lot";
    const g = groups.find((x) => x.lot === lot);
    if (g) g.items.push(l); else groups.push({ lot, items: [l] });
  }

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
    k.page.drawRectangle({ x: M, y: k.y - 16, width: W - 2 * M, height: 20, color: C.NAVY });
    k.text("N°", nX, k.y - 11, { size: 7, bold: true, color: C.WHITE });
    k.text("DÉSIGNATION DES OUVRAGES", desigX, k.y - 11, { size: 7, bold: true, color: C.WHITE });
    k.text("UNITÉ", uX, k.y - 11, { size: 7, bold: true, color: C.WHITE });
    k.text("QTÉ", qtyR, k.y - 11, { size: 7, bold: true, color: C.WHITE, align: "right" });
    k.text("P.U. HT", puR, k.y - 11, { size: 7, bold: true, color: C.WHITE, align: "right" });
    k.text("MONTANT HT", totR, k.y - 11, { size: 7, bold: true, color: C.WHITE, align: "right" });
    k.y -= 24;
  };
  head();

  let n = 0;
  let totalHT = 0;
  for (const g of groups) {
    if (k.ensure(40)) head();
    k.y -= 2;
    k.page.drawRectangle({ x: M, y: k.y - 14, width: W - 2 * M, height: 17, color: C.GOLD });
    k.text(g.lot.toUpperCase(), desigX, k.y - 10, { size: 8.5, bold: true, color: C.NAVY });
    k.y -= 22;
    let sub = 0;
    for (const l of g.items) {
      n++;
      const amt = l.quantity * l.unitPrice;
      sub += amt; totalHT += amt;
      const wl = k.wrap(l.designation, 8, false, desigW);
      const rowH = wl.length * 10 + 6;
      if (k.ensure(rowH + 4)) head();
      k.text(String(n), nX, k.y, { size: 8, color: C.GREY });
      wl.forEach((ln, i) => k.text(ln, desigX, k.y - i * 10, { size: 8, bold: i === 0 }));
      if (l.quantitySource) k.text(`source : ${l.quantitySource}`, desigX, k.y - wl.length * 10 + 1, { size: 6.5, color: C.GREY });
      k.text(l.unit, uX, k.y, { size: 8, color: C.GREY });
      k.text(String(l.quantity), qtyR, k.y, { size: 8, align: "right" });
      k.text(fmt(l.unitPrice), puR, k.y, { size: 8, align: "right" });
      k.text(fmt(amt), totR, k.y, { size: 8, bold: true, align: "right" });
      k.y -= rowH + (l.quantitySource ? 6 : 0);
      k.hr(k.y + 3, C.LIGHT, 0.4);
    }
    // Sous-total du lot
    if (k.ensure(20)) head();
    k.y -= 2;
    k.text(`Sous-total — ${g.lot}`, puR, k.y, { size: 8.5, bold: true, color: C.GREY, align: "right" });
    k.text(fmt(sub) + " " + unit, totR, k.y, { size: 8.5, bold: true, align: "right" });
    k.y -= 16;
  }

  // ── Totaux HT / TVA / TTC ──
  const vat = totalHT * (vatRate / 100);
  const ttc = totalHT + vat;
  k.ensure(78);
  k.y -= 8;
  const boxW = 250, boxX = W - M - boxW;
  k.text("Total HT", boxX + 12, k.y, { size: 9.5, color: C.GREY }); k.text(fmt(totalHT), totR, k.y, { size: 9.5, bold: true, align: "right" }); k.y -= 15;
  k.text(`TVA (${vatRate} %)`, boxX + 12, k.y, { size: 9.5, color: C.GREY }); k.text(fmt(vat), totR, k.y, { size: 9.5, align: "right" }); k.y -= 10;
  k.page.drawRectangle({ x: boxX, y: k.y - 24, width: boxW, height: 26, color: C.NAVY });
  k.text("TOTAL TTC", boxX + 12, k.y - 16, { size: 11, bold: true, color: C.WHITE });
  k.text(fmt(ttc) + " " + unit, totR, k.y - 16, { size: 12, bold: true, color: C.GOLD, align: "right" });

  k.y -= 40;
  k.stamp({ label: "Cachet et signature" });
  await k.finish("dpgf-metrika.pdf");
}
