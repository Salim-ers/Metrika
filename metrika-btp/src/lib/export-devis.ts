"use client";

import { CompanyExport, downloadBlob, fmtMad, dataUrlToBytes, legalLines } from "@/lib/export-common";
import { createPdf } from "@/lib/pdf-kit";

export interface DevisData {
  quoteNumber: string;
  dateLabel: string;
  validity: string;
  vatRate: number;
  clientName: string;
  clientAddress?: string;
  projectName?: string;
  lines: { designation: string; unit: string; quantity: number; unitPrice: number }[];
  company?: CompanyExport | null;
}

function totals(d: DevisData) {
  const ht = d.lines.filter((l) => l.designation.trim()).reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const vat = ht * (d.vatRate / 100);
  return { ht, vat, ttc: ht + vat };
}

// ── PDF officiel (kit Metrika) ────────────────────────────────────
export async function exportDevisPdf(d: DevisData): Promise<void> {
  const c = d.company;
  const k = await createPdf(c);
  const { C, W, M } = k;
  const rows = d.lines.filter((l) => l.designation.trim());
  const { ht, vat, ttc } = totals(d);

  k.header({ title: "DEVIS", docNo: d.quoteNumber });

  // ── Cartes Émetteur / Client ──
  const gap = 14;
  const colW = (W - 2 * M - gap) / 2;
  const lx = M, rx = M + colW + gap;
  const cardTop = k.y;
  const emitLines = [
    c?.name ?? "Metrika Métrage BTP",
    [c?.legalForm, c?.capital && `Capital ${c.capital}`].filter(Boolean).join(" — "),
    [c?.address, c?.city].filter(Boolean).join(", "),
    [c?.phone, c?.email].filter(Boolean).join("  ·  "),
  ].filter(Boolean) as string[];
  const cliLines = [
    d.clientName || "—",
    d.clientAddress || "",
    d.projectName ? "Projet : " + d.projectName : "",
  ].filter(Boolean) as string[];
  const cardH = 18 + Math.max(emitLines.length, cliLines.length) * 12 + 10;
  for (const [bx, title, lines] of [[lx, "ÉMETTEUR", emitLines], [rx, "CLIENT", cliLines]] as const) {
    k.page.drawRectangle({ x: bx, y: cardTop - cardH, width: colW, height: cardH, color: C.ZEBRA, borderColor: C.LIGHT, borderWidth: 0.5 });
    k.text(title, bx + 10, cardTop - 14, { size: 8, bold: true, color: C.GOLD });
    let yy = cardTop - 28;
    lines.forEach((ln, i) => { k.text(ln, bx + 10, yy, { size: i === 0 ? 10 : 8, bold: i === 0, color: i === 0 ? C.NAVY : C.GREY }); yy -= 12; });
  }
  k.y = cardTop - cardH - 16;

  // ── Bandeau infos (date / validité / TVA) ──
  k.page.drawRectangle({ x: M, y: k.y - 16, width: W - 2 * M, height: 20, color: C.ZEBRA });
  k.text("Date d'émission : " + d.dateLabel, M + 10, k.y - 11, { size: 8.5 });
  k.text("Validité : " + d.validity + " jours", M + 200, k.y - 11, { size: 8.5 });
  k.text("TVA : " + d.vatRate + " %", W - M - 10, k.y - 11, { size: 8.5, bold: true, align: "right" });
  k.y -= 30;

  // ── Tableau ──
  const totR = W - M - 8, puR = W - M - 90, qtyR = W - M - 165, uX = W - M - 215, desigX = M + 8;
  const desigW = uX - desigX - 8;
  const head = () => {
    k.page.drawRectangle({ x: M, y: k.y - 16, width: W - 2 * M, height: 20, color: C.NAVY });
    k.text("DÉSIGNATION", desigX, k.y - 11, { size: 8, bold: true, color: C.WHITE });
    k.text("UNITÉ", uX, k.y - 11, { size: 8, bold: true, color: C.WHITE });
    k.text("QTÉ", qtyR, k.y - 11, { size: 8, bold: true, color: C.WHITE, align: "right" });
    k.text("P.U. HT", puR, k.y - 11, { size: 8, bold: true, color: C.WHITE, align: "right" });
    k.text("TOTAL HT", totR, k.y - 11, { size: 8, bold: true, color: C.WHITE, align: "right" });
    k.y -= 24;
  };
  head();
  let zebra = false;
  for (const l of rows) {
    const wl = k.wrap(l.designation, 9, true, desigW);
    const rowH = wl.length * 11 + 8;
    if (k.ensure(rowH + 4)) head();
    if (zebra) k.page.drawRectangle({ x: M, y: k.y - rowH + 6, width: W - 2 * M, height: rowH, color: C.ZEBRA });
    zebra = !zebra;
    wl.forEach((ln, kk) => k.text(ln, desigX, k.y - kk * 11, { size: 9, bold: true }));
    k.text(l.unit, uX, k.y, { size: 8.5, color: C.GREY });
    k.text(String(l.quantity), qtyR, k.y, { size: 9, align: "right" });
    k.text(fmtMad(l.unitPrice), puR, k.y, { size: 9, align: "right" });
    k.text(fmtMad(l.quantity * l.unitPrice), totR, k.y, { size: 9, bold: true, align: "right" });
    k.y -= rowH;
    k.hr(k.y + 5);
  }

  // ── Totaux (encadré à droite) + signature (à gauche) ──
  k.ensure(150);
  const boxW = 230, boxX = W - M - boxW, boxTop = k.y - 6;
  k.text("Total HT", boxX + 12, boxTop - 4, { size: 9.5, color: C.GREY });
  k.text(fmtMad(ht), totR, boxTop - 4, { size: 9.5, align: "right" });
  k.text("TVA (" + d.vatRate + " %)", boxX + 12, boxTop - 20, { size: 9.5, color: C.GREY });
  k.text(fmtMad(vat), totR, boxTop - 20, { size: 9.5, align: "right" });
  k.page.drawRectangle({ x: boxX, y: boxTop - 50, width: boxW, height: 24, color: C.NAVY });
  k.text("TOTAL TTC", boxX + 12, boxTop - 42, { size: 11, bold: true, color: C.WHITE });
  k.text(fmtMad(ttc) + " MAD", totR, boxTop - 42, { size: 12, bold: true, color: C.GOLD, align: "right" });

  // Bloc signature / cachet
  const sigY = boxTop - 4, sigW = 200, sigH = 90;
  k.page.drawRectangle({ x: M, y: sigY - sigH, width: sigW, height: sigH, borderColor: C.LIGHT, borderWidth: 0.7 });
  k.text("Cachet et signature", M + 10, sigY - 14, { size: 8.5, bold: true, color: C.GOLD });
  k.text("Bon pour accord", M + 10, sigY - 28, { size: 8, color: C.GREY });
  if (k.stampImg) {
    const sw = 80, sh = (k.stampImg.height / k.stampImg.width) * sw;
    try { k.page.drawImage(k.stampImg, { x: M + 14, y: sigY - sigH + 8, width: sw, height: Math.min(sh, sigH - 36) }); } catch { /* ignore */ }
  }
  k.y = boxTop - 60;

  // ── Conditions de paiement + coordonnées bancaires ──
  k.ensure(60);
  k.y -= 6;
  if (c?.paymentTerms) {
    k.text("Modalités de paiement", M, k.y, { size: 8, bold: true, color: C.NAVY }); k.y -= 12;
    for (const ln of k.wrap(c.paymentTerms, 8, false, W - 2 * M)) { k.text(ln, M, k.y, { size: 8, color: C.GREY }); k.y -= 11; }
  }
  const bank = [c?.bankName && `Banque : ${c.bankName}`, c?.rib && `RIB : ${c.rib}`, c?.iban && `IBAN : ${c.iban}`, c?.swift && `SWIFT : ${c.swift}`].filter(Boolean).join("   ·   ");
  if (bank) { k.y -= 2; k.text("Coordonnées bancaires", M, k.y, { size: 8, bold: true, color: C.NAVY }); k.y -= 12; k.text(bank, M, k.y, { size: 8, color: C.GREY }); }

  await k.finish(`${d.quoteNumber || "devis"}.pdf`);
}

// ── Excel (exceljs) ───────────────────────────────────────────────
export async function exportDevisExcel(d: DevisData): Promise<void> {
  const mod = await import("exceljs");
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Devis");
  ws.columns = [
    { key: "designation", width: 50 }, { key: "unit", width: 8 },
    { key: "quantity", width: 10 }, { key: "unitPrice", width: 14 }, { key: "total", width: 16 },
  ];
  const c = d.company;
  const logo = dataUrlToBytes(c?.logoUrl);
  if (logo) {
    const id = wb.addImage({ base64: (c!.logoUrl as string).split(",")[1], extension: logo.mime.includes("png") ? "png" : "jpeg" });
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 130, height: 52 } });
    ws.getRow(1).height = 42;
  }
  ws.mergeCells("D1:E1"); ws.getCell("D1").value = `DEVIS ${d.quoteNumber}`;
  ws.getCell("D1").font = { bold: true, size: 14 }; ws.getCell("D1").alignment = { horizontal: "right" };
  ws.addRow([]);
  ws.addRow([c?.name ?? "Metrika Métrage BTP"]).font = { bold: true };
  ws.addRow([`Client : ${d.clientName}`]);
  if (d.clientAddress) ws.addRow([d.clientAddress]);
  ws.addRow([`Date : ${d.dateLabel}    Validité : ${d.validity} j    TVA : ${d.vatRate} %`]);
  ws.addRow([]);
  const hdr = ws.addRow(["Désignation", "U.", "Qté", "P.U. (MAD)", "Total HT (MAD)"]);
  hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hdr.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14233F" } }; });
  for (const l of d.lines.filter((x) => x.designation.trim())) {
    ws.addRow([l.designation, l.unit, l.quantity, l.unitPrice, l.quantity * l.unitPrice]);
  }
  const { ht, vat, ttc } = totals(d);
  ws.addRow([]);
  ws.addRow(["", "", "", "Total HT", ht]);
  ws.addRow(["", "", "", `TVA ${d.vatRate}%`, vat]);
  const t = ws.addRow(["", "", "", "Total TTC", ttc]); t.font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${d.quoteNumber || "devis"}.xlsx`);
}

// ── DOCX (docx) ───────────────────────────────────────────────────
export async function exportDevisDocx(d: DevisData): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, ImageRun, HeadingLevel } = await import("docx");
  const c = d.company;
  const cell = (t: string, b = false, align: "left" | "right" = "left") =>
    new TableCell({ children: [new Paragraph({ alignment: align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: t, bold: b })] })] });

  const head: InstanceType<typeof Paragraph>[] = [];
  const logo = dataUrlToBytes(c?.logoUrl);
  if (logo) {
    const ratio = 130;
    head.push(new Paragraph({ children: [new ImageRun({ data: logo.bytes, transformation: { width: ratio, height: 52 }, type: logo.mime.includes("png") ? "png" : "jpg" })] }));
  }
  head.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(`DEVIS ${d.quoteNumber}`)] }));
  head.push(new Paragraph({ children: [new TextRun({ text: c?.name ?? "Metrika Métrage BTP", bold: true })] }));
  head.push(new Paragraph({ children: [new TextRun(`Client : ${d.clientName}${d.clientAddress ? " — " + d.clientAddress : ""}`)] }));
  head.push(new Paragraph({ children: [new TextRun(`Date : ${d.dateLabel}    Validité : ${d.validity} jours    TVA : ${d.vatRate} %`)] }));

  const rows = [
    new TableRow({ children: [cell("Désignation", true), cell("U.", true), cell("Qté", true, "right"), cell("P.U.", true, "right"), cell("Total HT", true, "right")] }),
    ...d.lines.filter((l) => l.designation.trim()).map((l) =>
      new TableRow({ children: [cell(l.designation), cell(l.unit), cell(String(l.quantity), false, "right"), cell(fmtMad(l.unitPrice), false, "right"), cell(fmtMad(l.quantity * l.unitPrice), false, "right")] })),
  ];
  const { ht, vat, ttc } = totals(d);
  const doc = new Document({
    sections: [{
      children: [
        ...head,
        new Paragraph({ children: [] }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun(`Total HT : ${fmtMad(ht)} MAD`)] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun(`TVA (${d.vatRate}%) : ${fmtMad(vat)} MAD`)] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Total TTC : ${fmtMad(ttc)} MAD`, bold: true })] }),
        ...legalLines(c).map((ln) => new Paragraph({ children: [new TextRun({ text: ln, size: 14, color: "888888" })] })),
        ...(c?.paymentTerms ? [new Paragraph({ children: [new TextRun({ text: c.paymentTerms, size: 14, color: "888888" })] })] : []),
      ],
    }],
  });
  downloadBlob(await Packer.toBlob(doc), `${d.quoteNumber || "devis"}.docx`);
}
