"use client";

export interface DevisData {
  quoteNumber: string;
  dateLabel: string;
  validity: string;
  vatRate: number;
  clientName: string;
  clientAddress?: string;
  projectName?: string;
  companyName?: string;
  lines: { designation: string; unit: string; quantity: number; unitPrice: number }[];
}

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MAD";
}

/** Génère et télécharge un devis PDF de marque Metrika (pdf-lib, côté navigateur). */
export async function downloadDevisPdf(d: DevisData): Promise<void> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const NAVY = rgb(0.078, 0.137, 0.247);
  const GOLD = rgb(0.882, 0.647, 0.196);
  const GREY = rgb(0.45, 0.47, 0.52);
  const LINE = rgb(0.85, 0.86, 0.88);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const W = 595.28, H = 841.89, M = 48;
  let page = doc.addPage([W, H]);
  let y = H;

  const text = (
    s: string, x: number, yy: number,
    opts?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "right" }
  ) => {
    const size = opts?.size ?? 9;
    const f = opts?.bold ? bold : font;
    let xx = x;
    if (opts?.align === "right") xx = x - f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: xx, y: yy, size, font: f, color: opts?.color ?? NAVY });
  };

  const wrap = (s: string, f: typeof font, size: number, maxW: number): string[] => {
    const words = s.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(t, size) > maxW && cur) { lines.push(cur); cur = w; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  };

  // ── En-tête ───────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: H - 5, width: W, height: 5, color: GOLD });
  y = H - M;
  text(d.companyName ?? "Metrika Métrage BTP", M, y, { size: 14, bold: true });
  text("Maroc", M, y - 14, { size: 9, color: GREY });
  text("DEVIS", W - M, y, { size: 22, bold: true, align: "right" });
  text(d.quoteNumber, W - M, y - 18, { size: 10, color: GOLD, align: "right" });
  y -= 48;

  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LINE });
  y -= 22;

  // ── Émetteur / Client ─────────────────────────────────────
  const colR = W / 2 + 10;
  text("ÉMETTEUR", M, y, { size: 8, bold: true, color: GOLD });
  text("CLIENT", colR, y, { size: 8, bold: true, color: GOLD });
  y -= 14;
  text(d.companyName ?? "Metrika Métrage BTP", M, y, { size: 10, bold: true });
  text(d.clientName || "—", colR, y, { size: 10, bold: true });
  y -= 13;
  text("ICE / RC / IF — voir paramètres", M, y, { size: 8, color: GREY });
  if (d.clientAddress) text(d.clientAddress, colR, y, { size: 8, color: GREY });
  y -= 12;
  if (d.projectName) { text("Projet : " + d.projectName, colR, y, { size: 8, color: GREY }); }
  y -= 18;

  // Meta
  text("Date : " + d.dateLabel, M, y, { size: 9 });
  text("Validité : " + d.validity + " jours", M + 170, y, { size: 9 });
  text("TVA : " + d.vatRate + " %", M + 320, y, { size: 9 });
  y -= 22;

  // ── Tableau ───────────────────────────────────────────────
  const cQty = W - M - 200, cPu = W - M - 110, cTot = W - M;
  const drawHead = () => {
    page.drawRectangle({ x: M, y: y - 16, width: W - 2 * M, height: 20, color: NAVY });
    text("DÉSIGNATION", M + 8, y - 11, { size: 8, bold: true, color: rgb(1, 1, 1) });
    text("QTÉ", cQty, y - 11, { size: 8, bold: true, color: rgb(1, 1, 1), align: "right" });
    text("P.U.", cPu, y - 11, { size: 8, bold: true, color: rgb(1, 1, 1), align: "right" });
    text("TOTAL HT", cTot, y - 11, { size: 8, bold: true, color: rgb(1, 1, 1), align: "right" });
    y -= 26;
  };
  drawHead();

  const rows = d.lines.filter((l) => l.designation.trim());
  for (const l of rows) {
    const wrapped = wrap(l.designation, bold, 9, cQty - M - 20);
    const rowH = wrapped.length * 11 + 10;
    if (y - rowH < M + 90) { page = doc.addPage([W, H]); y = H - M; drawHead(); }
    wrapped.forEach((ln, k) => text(ln, M + 8, y - k * 11, { size: 9, bold: true }));
    text(l.unit, M + 8, y - wrapped.length * 11, { size: 7.5, color: GREY });
    text(String(l.quantity), cQty, y, { size: 9, align: "right" });
    text(fmt(l.unitPrice), cPu, y, { size: 9, align: "right" });
    text(fmt(l.quantity * l.unitPrice), cTot, y, { size: 9, bold: true, align: "right" });
    y -= rowH;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.5, color: LINE });
  }

  // ── Totaux ────────────────────────────────────────────────
  const totalHT = rows.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const totalVAT = totalHT * (d.vatRate / 100);
  const totalTTC = totalHT + totalVAT;
  if (y < M + 90) { page = doc.addPage([W, H]); y = H - M; }
  y -= 14;
  const tx = W - M - 220;
  text("Total HT", tx, y, { size: 9, color: GREY }); text(fmt(totalHT), cTot, y, { size: 9, align: "right" });
  y -= 14;
  text("TVA (" + d.vatRate + " %)", tx, y, { size: 9, color: GREY }); text(fmt(totalVAT), cTot, y, { size: 9, align: "right" });
  y -= 8;
  page.drawLine({ start: { x: tx, y }, end: { x: cTot, y }, thickness: 0.6, color: NAVY });
  y -= 16;
  text("Total TTC", tx, y, { size: 11, bold: true }); text(fmt(totalTTC), cTot, y, { size: 11, bold: true, color: GOLD, align: "right" });

  // ── Pied ──────────────────────────────────────────────────
  text("Conditions de paiement et coordonnées bancaires : voir paramètres entreprise.", M, M + 18, { size: 7.5, color: GREY });
  text("Devis établi le " + d.dateLabel + " · Metrika Métrage BTP Maroc", M, M + 6, { size: 7.5, color: GREY });

  const bytes = await doc.save();
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${d.quoteNumber || "devis"}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
