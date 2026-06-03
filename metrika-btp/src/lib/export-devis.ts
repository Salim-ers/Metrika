"use client";

import { CompanyExport, downloadBlob, fmtMad, dataUrlToBytes, legalLines } from "@/lib/export-common";

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

// ── PDF (pdf-lib) ─────────────────────────────────────────────────
export async function exportDevisPdf(d: DevisData): Promise<void> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const NAVY = rgb(0.078, 0.137, 0.247), GOLD = rgb(0.882, 0.647, 0.196), GREY = rgb(0.45, 0.47, 0.52), LINE = rgb(0.85, 0.86, 0.88);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 48;
  let page = doc.addPage([W, H]); let y = H;
  const c = d.company;
  const rows = d.lines.filter((l) => l.designation.trim());
  const { ht, vat, ttc } = totals(d);

  const text = (s: string, x: number, yy: number, o?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "right" }) => {
    const size = o?.size ?? 9; const f = o?.bold ? bold : font;
    const xx = o?.align === "right" ? x - f.widthOfTextAtSize(s, size) : x;
    page.drawText(s, { x: xx, y: yy, size, font: f, color: o?.color ?? NAVY });
  };
  const wrap = (s: string, f: typeof font, size: number, maxW: number) => {
    const words = s.split(/\s+/); const out: string[] = []; let cur = "";
    for (const w of words) { const tt = cur ? cur + " " + w : w; if (f.widthOfTextAtSize(tt, size) > maxW && cur) { out.push(cur); cur = w; } else cur = tt; }
    if (cur) out.push(cur); return out.length ? out : [""];
  };

  page.drawRectangle({ x: 0, y: H - 5, width: W, height: 5, color: GOLD });
  y = H - M;

  // Logo (ou nom)
  const logo = dataUrlToBytes(c?.logoUrl);
  let headerBottom = y;
  if (logo) {
    try {
      const img = logo.mime.includes("png") ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
      const lw = 130; const lh = (img.height / img.width) * lw;
      page.drawImage(img, { x: M, y: y - lh, width: lw, height: lh });
      headerBottom = y - lh;
    } catch { /* image illisible : ignorer */ }
  }
  if (!logo) { text(c?.name ?? "Metrika Métrage BTP", M, y - 6, { size: 14, bold: true }); headerBottom = y - 20; }
  else if (c?.name) { text(c.name, M, headerBottom - 12, { size: 9, color: GREY }); headerBottom -= 16; }

  text("DEVIS", W - M, y - 4, { size: 22, bold: true, align: "right" });
  text(d.quoteNumber, W - M, y - 22, { size: 10, color: GOLD, align: "right" });
  y = Math.min(headerBottom, y - 34) - 14;

  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LINE });
  y -= 20;

  const colR = W / 2 + 10;
  text("ÉMETTEUR", M, y, { size: 8, bold: true, color: GOLD });
  text("CLIENT", colR, y, { size: 8, bold: true, color: GOLD });
  y -= 13;
  text(c?.name ?? "Metrika Métrage BTP", M, y, { size: 10, bold: true });
  text(d.clientName || "—", colR, y, { size: 10, bold: true });
  y -= 12;
  const emit = [c?.address, c?.city].filter(Boolean).join(", ");
  if (emit) text(emit, M, y, { size: 8, color: GREY });
  if (d.clientAddress) text(d.clientAddress, colR, y, { size: 8, color: GREY });
  y -= 11;
  const emit2 = [c?.phone, c?.email].filter(Boolean).join(" · ");
  if (emit2) text(emit2, M, y, { size: 8, color: GREY });
  if (d.projectName) text("Projet : " + d.projectName, colR, y, { size: 8, color: GREY });
  y -= 20;

  text("Date : " + d.dateLabel, M, y, { size: 9 });
  text("Validité : " + d.validity + " jours", M + 170, y, { size: 9 });
  text("TVA : " + d.vatRate + " %", M + 330, y, { size: 9 });
  y -= 20;

  const cQty = W - M - 200, cPu = W - M - 110, cTot = W - M;
  const head = () => {
    page.drawRectangle({ x: M, y: y - 16, width: W - 2 * M, height: 20, color: NAVY });
    text("DÉSIGNATION", M + 8, y - 11, { size: 8, bold: true, color: rgb(1, 1, 1) });
    text("QTÉ", cQty, y - 11, { size: 8, bold: true, color: rgb(1, 1, 1), align: "right" });
    text("P.U.", cPu, y - 11, { size: 8, bold: true, color: rgb(1, 1, 1), align: "right" });
    text("TOTAL HT", cTot, y - 11, { size: 8, bold: true, color: rgb(1, 1, 1), align: "right" });
    y -= 26;
  };
  head();
  for (const l of rows) {
    const wl = wrap(l.designation, bold, 9, cQty - M - 20);
    const rowH = wl.length * 11 + 10;
    if (y - rowH < M + 110) { page = doc.addPage([W, H]); y = H - M; head(); }
    wl.forEach((ln, k) => text(ln, M + 8, y - k * 11, { size: 9, bold: true }));
    text(l.unit, M + 8, y - wl.length * 11, { size: 7.5, color: GREY });
    text(String(l.quantity), cQty, y, { size: 9, align: "right" });
    text(fmtMad(l.unitPrice), cPu, y, { size: 9, align: "right" });
    text(fmtMad(l.quantity * l.unitPrice), cTot, y, { size: 9, bold: true, align: "right" });
    y -= rowH;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.5, color: LINE });
  }

  if (y < M + 110) { page = doc.addPage([W, H]); y = H - M; }
  y -= 14;
  const tx = W - M - 220;
  text("Total HT", tx, y, { size: 9, color: GREY }); text(fmtMad(ht), cTot, y, { size: 9, align: "right" }); y -= 14;
  text("TVA (" + d.vatRate + " %)", tx, y, { size: 9, color: GREY }); text(fmtMad(vat), cTot, y, { size: 9, align: "right" }); y -= 8;
  page.drawLine({ start: { x: tx, y }, end: { x: cTot, y }, thickness: 0.6, color: NAVY }); y -= 16;
  text("Total TTC", tx, y, { size: 11, bold: true }); text(fmtMad(ttc) + " MAD", cTot, y, { size: 11, bold: true, color: GOLD, align: "right" });

  // Cachet
  const stamp = dataUrlToBytes(c?.stampUrl);
  if (stamp) {
    try {
      const img = stamp.mime.includes("png") ? await doc.embedPng(stamp.bytes) : await doc.embedJpg(stamp.bytes);
      const sw = 90; const sh = (img.height / img.width) * sw;
      page.drawImage(img, { x: M, y: Math.max(M + 40, y - sh), width: sw, height: sh });
    } catch { /* ignore */ }
  }

  // Pied : mentions légales + conditions
  let fy = M + 40;
  for (const ln of legalLines(c)) { text(ln, M, fy, { size: 7, color: GREY }); fy -= 9; }
  if (c?.paymentTerms) for (const ln of wrap(c.paymentTerms, font, 7, W - 2 * M)) { text(ln, M, fy, { size: 7, color: GREY }); fy -= 9; }

  downloadBlob(new Blob([(await doc.save()) as BlobPart], { type: "application/pdf" }), `${d.quoteNumber || "devis"}.pdf`);
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
