"use client";

import { CompanyExport, dataUrlToBytes, winAnsiSafe, legalLines } from "@/lib/export-common";

export interface CctpSection {
  lot: string;
  content: string;
}

/** Métadonnées de page de garde (renseignées dans le générateur CCTP). */
export interface CctpMeta {
  projectName?: string;
  projectType?: string;
  owner?: string;      // Maître d'ouvrage
  architect?: string;  // Architecte / maîtrise d'œuvre
  bet?: string;        // Bureau d'études techniques
  dateLabel?: string;
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

type Item =
  | { kind: "chapter"; id: number; num: string; text: string }
  | { kind: "h2"; id: number; num: string; text: string }
  | { kind: "h3"; num: string; text: string }
  | { kind: "li"; text: string }
  | { kind: "p"; text: string }
  | { kind: "blank" };

interface TocEntry { level: 0 | 1; id: number; num: string; text: string }

/** Numérote les lots (chapitres) et leurs sous-titres → items + sommaire. */
function buildItems(sections: CctpSection[]): { items: Item[]; toc: TocEntry[] } {
  const items: Item[] = [];
  const toc: TocEntry[] = [];
  let chap = 0;
  let idc = 0;
  for (const sec of sections) {
    chap++;
    let h2c = 0;
    let h3c = 0;
    const cid = idc++;
    items.push({ kind: "chapter", id: cid, num: String(chap), text: sec.lot ?? "Lot" });
    toc.push({ level: 0, id: cid, num: String(chap), text: sec.lot ?? "Lot" });
    for (const raw of (sec.content ?? "").split("\n")) {
      const { kind, text } = classify(raw);
      if (kind === "h2") {
        h2c++; h3c = 0;
        const num = `${chap}.${h2c}`;
        const hid = idc++;
        items.push({ kind: "h2", id: hid, num, text });
        toc.push({ level: 1, id: hid, num, text });
      } else if (kind === "h3") {
        h3c++;
        items.push({ kind: "h3", num: `${chap}.${h2c || 1}.${h3c}`, text });
      } else if (kind === "li") items.push({ kind: "li", text });
      else if (kind === "p") items.push({ kind: "p", text });
      else items.push({ kind: "blank" });
    }
  }
  return { items, toc };
}

// ── PDF officiel (page de garde + sommaire + chapitres + pied légal) ──
export async function exportCctpPdf(
  sections: CctpSection[],
  company?: CompanyExport | null,
  meta?: CctpMeta,
) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const NAVY = rgb(0.078, 0.137, 0.247);
  const GOLD = rgb(0.882, 0.647, 0.196);
  const GREY = rgb(0.32, 0.34, 0.4);
  const LIGHT = rgb(0.85, 0.86, 0.88);
  const WHITE = rgb(1, 1, 1);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 50, FOOT = 34;

  const safe = winAnsiSafe;
  const wrap = (s: string, f: typeof font, size: number, maxW: number) => {
    const words = safe(s).split(/\s+/);
    const out: string[] = [];
    let cur = "";
    for (const w of words) {
      const tt = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(tt, size) > maxW && cur) { out.push(cur); cur = w; }
      else cur = tt;
    }
    if (cur) out.push(cur);
    return out.length ? out : [""];
  };
  const center = (page: ReturnType<typeof doc.addPage>, s: string, f: typeof font, size: number, color: typeof NAVY, yy: number) => {
    const t = safe(s);
    page.drawText(t, { x: (W - f.widthOfTextAtSize(t, size)) / 2, y: yy, size, font: f, color });
  };

  const { items, toc } = buildItems(sections);
  const lots = sections.map((s) => s.lot).filter(Boolean);
  const ENTRIES_PER_PAGE = 34;
  const tocPageCount = Math.max(1, Math.ceil(toc.length / ENTRIES_PER_PAGE));
  const dateLabel = meta?.dateLabel || new Date().toLocaleDateString("fr-FR");

  // Logo + cachet (embarqués une fois).
  const logoBytes = dataUrlToBytes(company?.logoUrl);
  let logoImg: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  if (logoBytes) {
    try { logoImg = logoBytes.mime.includes("png") ? await doc.embedPng(logoBytes.bytes) : await doc.embedJpg(logoBytes.bytes); }
    catch { logoImg = null; }
  }
  const stampBytes = dataUrlToBytes(company?.stampUrl);
  let stampImg: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  if (stampBytes) {
    try { stampImg = stampBytes.mime.includes("png") ? await doc.embedPng(stampBytes.bytes) : await doc.embedJpg(stampBytes.bytes); }
    catch { stampImg = null; }
  }

  // ───────────── PAGE DE GARDE ─────────────
  const cover = doc.addPage([W, H]);
  cover.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: GOLD });
  cover.drawRectangle({ x: 0, y: 0, width: W, height: 6, color: NAVY });
  let cy = H - M - 20;
  if (logoImg) {
    const lw = 150, lh = (logoImg.height / logoImg.width) * lw;
    cover.drawImage(logoImg, { x: (W - lw) / 2, y: cy - lh, width: lw, height: lh });
    cy -= lh + 14;
  }
  center(cover, company?.name ?? "Metrika Métrage BTP", bold, 14, NAVY, cy); cy -= 16;
  if (company?.legalForm || company?.city) {
    center(cover, [company?.legalForm, company?.city].filter(Boolean).join(" — "), font, 9, GREY, cy); cy -= 14;
  }
  cy -= 24;

  if (meta?.owner) { center(cover, meta.owner.toUpperCase(), bold, 12, GREY, cy); cy -= 22; }
  if (meta?.projectName) {
    for (const ln of wrap(meta.projectName, bold, 19, W - 2 * M)) { center(cover, ln, bold, 19, NAVY, cy); cy -= 24; }
  }
  cy -= 14;

  // Encadré C.C.T.P
  const boxH = lots.length ? 116 : 96;
  cover.drawRectangle({ x: M + 30, y: cy - boxH, width: W - 2 * (M + 30), height: boxH, borderColor: NAVY, borderWidth: 1.5, color: rgb(0.97, 0.97, 0.98) });
  let by = cy - 34;
  center(cover, "C.C.T.P", bold, 34, NAVY, by); by -= 22;
  center(cover, "(Cahier des Clauses Techniques Particulieres)", font, 10, GREY, by); by -= 24;
  if (lots.length) {
    center(cover, lots.length === 1 ? `LOT : ${lots[0]}` : `LOTS (${lots.length})`, bold, 13, NAVY, by); by -= 16;
    if (lots.length > 1) center(cover, lots.join("  •  "), font, 8.5, GREY, by);
  }
  cy -= boxH + 30;

  // Intervenants
  const intervenant = (label: string, value?: string) => {
    if (!value) return;
    center(cover, label, bold, 9, GOLD, cy); cy -= 13;
    for (const ln of wrap(value, font, 10, W - 2 * M)) { center(cover, ln, font, 10, NAVY, cy); cy -= 13; }
    cy -= 8;
  };
  intervenant("MAITRE D'OUVRAGE", meta?.owner);
  intervenant("ARCHITECTE / MAITRISE D'ŒUVRE", meta?.architect);
  intervenant("BUREAU D'ETUDES TECHNIQUES", meta?.bet);

  // Cachet de l'entreprise (signature officielle), au-dessus du bloc légal.
  if (stampImg) {
    const sw = 120, sh = (stampImg.height / stampImg.width) * sw;
    cover.drawImage(stampImg, { x: W - M - sw - 6, y: M + 64, width: sw, height: sh, opacity: 0.95 });
  }

  // Pied de page de garde : émetteur + mentions + date
  let fy = M + 30;
  const legal = legalLines(company);
  center(cover, dateLabel, font, 8, GREY, fy + 14);
  cover.drawLine({ start: { x: M, y: fy + 26 }, end: { x: W - M, y: fy + 26 }, thickness: 0.5, color: LIGHT });
  fy = M + 2;
  for (const l of legal.slice().reverse()) { center(cover, l, font, 6.5, GREY, fy); fy += 9; }
  if (company?.name) center(cover, `Document établi par ${company.name}`, bold, 8, NAVY, fy + 2);

  // ───────────── PAGES SOMMAIRE (réservées) ─────────────
  const tocPages: ReturnType<typeof doc.addPage>[] = [];
  for (let i = 0; i < tocPageCount; i++) tocPages.push(doc.addPage([W, H]));

  // ───────────── CONTENU ─────────────
  const entryPage = new Map<number, number>();
  let page = doc.addPage([W, H]);
  let pageNo = 1 + tocPageCount + 1; // numéro PDF de cette 1ʳᵉ page de contenu
  let y = H - M;
  const newPage = () => { page = doc.addPage([W, H]); pageNo++; y = H - M; };
  const ensure = (need: number) => { if (y - need < M + FOOT) newPage(); };

  for (const it of items) {
    if (it.kind === "chapter") {
      ensure(46); y -= 12;
      page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 24, color: NAVY });
      page.drawText(safe(`${it.num}.  ${it.text.toUpperCase()}`), { x: M + 10, y, size: 12, font: bold, color: WHITE });
      entryPage.set(it.id, pageNo);
      y -= 34;
    } else if (it.kind === "h2") {
      ensure(20); entryPage.set(it.id, pageNo);
      let first = true;
      for (const ln of wrap(`${it.num}  ${it.text}`, bold, 11, W - 2 * M)) {
        ensure(16); page.drawText(safe(ln), { x: M, y, size: 11, font: bold, color: NAVY }); y -= 16;
        if (first) { entryPage.set(it.id, pageNo); first = false; }
      }
      y -= 2;
    } else if (it.kind === "h3") {
      for (const ln of wrap(`${it.num}  ${it.text}`, bold, 9.5, W - 2 * M - 10)) {
        ensure(14); page.drawText(safe(ln), { x: M + 10, y, size: 9.5, font: bold, color: NAVY }); y -= 14;
      }
    } else if (it.kind === "li") {
      const lines = wrap(it.text, font, 9, W - 2 * M - 16);
      lines.forEach((ln, k) => { ensure(13); page.drawText(safe((k === 0 ? "•  " : "   ") + ln), { x: M + 12, y, size: 9, font, color: NAVY }); y -= 13; });
    } else if (it.kind === "p") {
      for (const ln of wrap(it.text, font, 9, W - 2 * M)) { ensure(13); page.drawText(safe(ln), { x: M, y, size: 9, font, color: NAVY }); y -= 13; }
      y -= 2;
    } else { y -= 5; }
  }

  // ───────────── DESSIN DU SOMMAIRE ─────────────
  let tp = 0;
  let ty = 0;
  const startTocPage = (idx: number) => {
    const p = tocPages[idx];
    p.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: GOLD });
    p.drawText(safe("SOMMAIRE"), { x: M, y: H - M - 6, size: 18, font: bold, color: NAVY });
    ty = H - M - 36;
    return p;
  };
  let tpage = startTocPage(0);
  for (const e of toc) {
    if (ty < M + FOOT + 6) { tp++; tpage = startTocPage(Math.min(tp, tocPages.length - 1)); }
    const f = e.level === 0 ? bold : font;
    const size = e.level === 0 ? 10 : 9;
    const indent = e.level === 0 ? 0 : 16;
    const color = e.level === 0 ? NAVY : GREY;
    if (e.level === 0) ty -= 6;
    const label = safe(`${e.num}   ${e.text}`);
    const pnum = safe(`p. ${entryPage.get(e.id) ?? "-"}`);
    const labelW = f.widthOfTextAtSize(label, size);
    const pnumW = font.widthOfTextAtSize(pnum, 8);
    tpage.drawText(label, { x: M + indent, y: ty, size, font: f, color });
    tpage.drawText(pnum, { x: W - M - pnumW, y: ty, size: 8, font, color: GREY });
    // points de conduite
    const dotsStart = M + indent + labelW + 6;
    const dotsEnd = W - M - pnumW - 6;
    if (dotsEnd > dotsStart) {
      const dot = font.widthOfTextAtSize(".", 8);
      const n = Math.max(0, Math.floor((dotsEnd - dotsStart) / dot));
      if (n > 0) tpage.drawText(".".repeat(n), { x: dotsStart, y: ty, size: 8, font, color: LIGHT });
    }
    ty -= e.level === 0 ? 17 : 14;
  }

  // ───────────── PIEDS DE PAGE (sauf garde) ─────────────
  const pages = doc.getPages();
  const total = pages.length;
  const footLeft = safe([company?.name, company?.city].filter(Boolean).join(" — ")) || "Metrika Métrage BTP";
  const footLegal = legal[1] ? safe(legal[1]) : "";
  pages.forEach((p, idx) => {
    if (idx === 0) return; // page de garde
    p.drawLine({ start: { x: M, y: M + 22 }, end: { x: W - M, y: M + 22 }, thickness: 0.5, color: LIGHT });
    p.drawText(footLeft, { x: M, y: M + 11, size: 7, font, color: GREY });
    const pn = safe(`Page ${idx + 1} / ${total}`);
    p.drawText(pn, { x: W - M - font.widthOfTextAtSize(pn, 7), y: M + 11, size: 7, font, color: GREY });
    if (footLegal) p.drawText(footLegal, { x: M, y: M + 2, size: 6, font, color: GREY });
  });

  download(new Blob([(await doc.save()) as BlobPart], { type: "application/pdf" }), "cctp-metrika.pdf");
}

// ── DOCX ──────────────────────────────────────────────────────────
export async function exportCctpDocx(sections: CctpSection[], company?: CompanyExport | null, meta?: CctpMeta) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");
  const dateLabel = meta?.dateLabel || new Date().toLocaleDateString("fr-FR");
  const children: InstanceType<typeof Paragraph>[] = [];

  // Page de garde
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: company?.name ?? "Metrika Métrage BTP", bold: true, size: 28, color: "14233F" })] }));
  if (meta?.owner) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: [new TextRun({ text: meta.owner.toUpperCase(), bold: true, color: "555555" })] }));
  if (meta?.projectName) children.push(new Paragraph({ alignment: AlignmentType.CENTER, heading: HeadingLevel.TITLE, children: [new TextRun(meta.projectName)] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240 }, children: [new TextRun({ text: "C.C.T.P", bold: true, size: 56, color: "14233F" })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Cahier des Clauses Techniques Particulières", italics: true, color: "555555" })] }));
  const lots = sections.map((s) => s.lot).filter(Boolean);
  if (lots.length) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: [new TextRun({ text: lots.length === 1 ? `LOT : ${lots[0]}` : `LOTS : ${lots.join(", ")}`, bold: true })] }));
  if (meta?.architect) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: "Architecte / Maîtrise d'œuvre : ", bold: true }), new TextRun(meta.architect)] }));
  if (meta?.bet) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Bureau d'études : ", bold: true }), new TextRun(meta.bet)] }));
  for (const l of legalLines(company)) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l, size: 14, color: "777777" })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: dateLabel, size: 16, color: "777777" })] }));
  children.push(new Paragraph({ pageBreakBefore: true, children: [] }));

  let chap = 0;
  for (const sec of sections) {
    chap++;
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240 }, children: [new TextRun(`${chap}. ${(sec.lot ?? "Lot").toUpperCase()}`)] }));
    let h2c = 0;
    for (const raw of (sec.content ?? "").split("\n")) {
      const { kind, text } = classify(raw);
      if (kind === "blank") continue;
      if (kind === "h2") { h2c++; children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(`${chap}.${h2c} ${text}`)] })); }
      else if (kind === "h3") children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] }));
      else if (kind === "li") children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(text)] }));
      else children.push(new Paragraph({ children: [new TextRun(text)] }));
    }
  }
  const docx = new Document({ sections: [{ children }] });
  download(await Packer.toBlob(docx), "cctp-metrika.docx");
}
