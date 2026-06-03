"use client";

import { CompanyExport, dataUrlToBytes, winAnsiSafe } from "@/lib/export-common";

export interface CctpSection {
  lot: string;
  content: string;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Type de ligne markdown simplifié. */
function classify(line: string): { kind: "h2" | "h3" | "li" | "p" | "blank"; text: string } {
  const s = line.trimEnd();
  if (!s.trim()) return { kind: "blank", text: "" };
  if (s.startsWith("### ")) return { kind: "h3", text: s.slice(4) };
  if (s.startsWith("## ")) return { kind: "h2", text: s.slice(3) };
  if (s.startsWith("# ")) return { kind: "h2", text: s.slice(2) };
  if (/^\s*[-*]\s+/.test(s)) return { kind: "li", text: s.replace(/^\s*[-*]\s+/, "") };
  return { kind: "p", text: s.replace(/\*\*/g, "") };
}

// ── PDF ───────────────────────────────────────────────────────────
export async function exportCctpPdf(sections: CctpSection[], company?: CompanyExport | null) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const NAVY = rgb(0.078, 0.137, 0.247), GOLD = rgb(0.882, 0.647, 0.196), GREY = rgb(0.3, 0.32, 0.38);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 50;
  let page = doc.addPage([W, H]); let y = H - M;

  const ensure = (need: number) => { if (y - need < M) { page = doc.addPage([W, H]); y = H - M; } };
  const wrap = (s: string, f: typeof font, size: number) => {
    const words = s.split(/\s+/); const out: string[] = []; let cur = "";
    for (const w of words) { const tt = cur ? cur + " " + w : w; if (f.widthOfTextAtSize(tt, size) > W - 2 * M - 12 && cur) { out.push(cur); cur = w; } else cur = tt; }
    if (cur) out.push(cur); return out.length ? out : [""];
  };
  const para = (s: string, f: typeof font, size: number, color = NAVY, indent = 0, gap = 4) => {
    for (const ln of wrap(s, f, size)) {
      ensure(size + gap);
      page.drawText(winAnsiSafe(ln), { x: M + indent, y, size, font: f, color });
      y -= size + gap;
    }
  };

  page.drawRectangle({ x: 0, y: H - 5, width: W, height: 5, color: GOLD });
  const logo = dataUrlToBytes(company?.logoUrl);
  if (logo) {
    try {
      const img = logo.mime.includes("png") ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
      const lw = 120; const lh = (img.height / img.width) * lw;
      page.drawImage(img, { x: M, y: y - lh, width: lw, height: lh }); y -= lh + 8;
    } catch { /* ignore */ }
  }
  para("CCTP — Cahier des Clauses Techniques Particulières", bold, 16);
  para(company?.name ?? "Metrika Métrage BTP", font, 9, GREY, 0, 10);

  for (const sec of sections) {
    ensure(30);
    y -= 8;
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 22, color: NAVY });
    page.drawText(winAnsiSafe(sec.lot ?? "Lot"), { x: M + 8, y: y + 2, size: 12, font: bold, color: rgb(1, 1, 1) });
    y -= 30;
    for (const raw of (sec.content ?? "").split("\n")) {
      const { kind, text } = classify(raw);
      if (kind === "blank") { y -= 4; continue; }
      if (kind === "h2") { y -= 4; para(text, bold, 11, NAVY, 0, 5); }
      else if (kind === "h3") para(text, bold, 9.5, NAVY, 0, 4);
      else if (kind === "li") { para("•  " + text, font, 9, NAVY, 8, 3); }
      else para(text, font, 9, NAVY, 0, 3);
    }
  }
  download(new Blob([(await doc.save()) as BlobPart], { type: "application/pdf" }), "cctp-metrika.pdf");
}

// ── DOCX ──────────────────────────────────────────────────────────
export async function exportCctpDocx(sections: CctpSection[]) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun("CCTP — Cahier des Clauses Techniques Particulières")] }),
    new Paragraph({ children: [new TextRun({ text: "Metrika Métrage BTP", color: "888888" })] }),
  ];
  for (const sec of sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240 }, children: [new TextRun(sec.lot ?? "Lot")] }));
    for (const raw of (sec.content ?? "").split("\n")) {
      const { kind, text } = classify(raw);
      if (kind === "blank") continue;
      if (kind === "h2") children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] }));
      else if (kind === "h3") children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] }));
      else if (kind === "li") children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(text)] }));
      else children.push(new Paragraph({ children: [new TextRun(text)] }));
    }
  }
  const doc = new Document({ sections: [{ children }] });
  download(await Packer.toBlob(doc), "cctp-metrika.docx");
}
