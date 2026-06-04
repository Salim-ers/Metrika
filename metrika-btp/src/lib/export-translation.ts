"use client";

import { CompanyExport, dataUrlToBytes, legalLines } from "@/lib/export-common";
import { createPdf } from "@/lib/pdf-kit";
import { shapeArabicLine } from "@/lib/arabic";

interface TranslationMeta {
  fileName?: string;
  sourceLang?: string;
  targetLang?: string;
}

const LANG_FR: Record<string, string> = { fr: "Français", en: "Anglais", ar: "Arabe" };
const langLabel = (l?: string) => (l ? LANG_FR[l] ?? l : "");
const fileBase = (meta?: TranslationMeta) => (meta?.fileName ?? "document").replace(/\.pdf$/i, "");

// ── PDF ────────────────────────────────────────────────────────────
export async function exportTranslationPdf(
  pages: string[],
  company?: CompanyExport | null,
  meta?: TranslationMeta,
) {
  if (meta?.targetLang === "ar") {
    return exportArabicPdf(pages, company, meta);
  }
  return exportLatinPdf(pages, company, meta);
}

/** Cible FR/EN : kit Metrika standard (Helvetica, pagination, pied légal). */
async function exportLatinPdf(pages: string[], company?: CompanyExport | null, meta?: TranslationMeta) {
  const k = await createPdf(company);
  const { W, M, C } = k;
  k.header({
    title: "TRADUCTION",
    subtitle: meta?.fileName ? meta.fileName : undefined,
    docNo: meta?.sourceLang && meta?.targetLang ? `${langLabel(meta.sourceLang)} → ${langLabel(meta.targetLang)}` : undefined,
  });

  const maxW = W - 2 * M;
  pages.forEach((page, pi) => {
    if (pi > 0) { k.newPage(); k.y -= 6; }
    k.text(`— Page ${pi + 1} —`, M, k.y, { size: 7.5, color: C.GREY });
    k.y -= 16;
    for (const para of page.split("\n")) {
      if (!para.trim()) { k.y -= 6; continue; }
      const wl = k.wrap(para, 9.5, false, maxW);
      for (const ln of wl) {
        k.ensure(14);
        k.text(ln, M, k.y, { size: 9.5 });
        k.y -= 13;
      }
      k.y -= 4;
    }
  });

  drawStamp(k);
  await k.finish(`traduction-${fileBase(meta)}.pdf`);
}

/** Cible arabe : police Unicode Amiri + mise en forme RTL (document officiel). */
async function exportArabicPdf(pages: string[], company?: CompanyExport | null, meta?: TranslationMeta) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const { downloadBlob } = await import("@/lib/export-common");

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regBuf, boldBuf] = await Promise.all([
    fetch("/fonts/Amiri-Regular.ttf").then((r) => r.arrayBuffer()),
    fetch("/fonts/Amiri-Bold.ttf").then((r) => r.arrayBuffer()),
  ]);
  const font = await doc.embedFont(regBuf, { subset: true });
  const bold = await doc.embedFont(boldBuf, { subset: true });

  const NAVY = rgb(0.078, 0.137, 0.247);
  const GOLD = rgb(0.882, 0.647, 0.196);
  const GREY = rgb(0.35, 0.37, 0.43);
  const LIGHT = rgb(0.86, 0.87, 0.9);
  const W = 595.28, H = 841.89, M = 50, FOOT = 40;

  // Logo + cachet.
  const lb = dataUrlToBytes(company?.logoUrl);
  let logoImg = null as Awaited<ReturnType<typeof doc.embedPng>> | null;
  if (lb) { try { logoImg = lb.mime.includes("png") ? await doc.embedPng(lb.bytes) : await doc.embedJpg(lb.bytes); } catch { logoImg = null; } }
  const sb = dataUrlToBytes(company?.stampUrl);
  let stampImg = null as Awaited<ReturnType<typeof doc.embedPng>> | null;
  if (sb) { try { stampImg = sb.mime.includes("png") ? await doc.embedPng(sb.bytes) : await doc.embedJpg(sb.bytes); } catch { stampImg = null; } }

  let page = doc.addPage([W, H]);
  let y = H - M;
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const ensure = (need: number) => { if (y - need < M + FOOT) newPage(); };

  // Largeur du texte mis en forme (arabe ou non).
  const widthOf = (s: string, size: number, b = false) => (b ? bold : font).widthOfTextAtSize(shapeArabicLine(s), size);
  // Dessin aligné à droite (RTL).
  const drawRTL = (s: string, size: number, opts?: { bold?: boolean; color?: typeof NAVY; x?: number }) => {
    const shaped = shapeArabicLine(s);
    const f = opts?.bold ? bold : font;
    const w = f.widthOfTextAtSize(shaped, size);
    const x = opts?.x ?? W - M - w;
    page.drawText(shaped, { x, y, size, font: f, color: opts?.color ?? NAVY });
  };
  // Découpe RTL d'un paragraphe en lignes qui tiennent dans maxW (ordre logique).
  const wrapRTL = (text: string, size: number, maxW: number) => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const tt = cur ? cur + " " + w : w;
      if (widthOf(tt, size) > maxW && cur) { lines.push(cur); cur = w; }
      else cur = tt;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  };

  // ── En-tête de marque ──
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: GOLD });
  const top = H - M;
  if (logoImg) {
    const lw = 130, lh = (logoImg.height / logoImg.width) * lw;
    page.drawImage(logoImg, { x: M, y: top - lh, width: lw, height: lh });
  }
  // Titre (arabe) à droite.
  drawRTL("ترجمة", 22, { bold: true, color: NAVY });
  y -= 18;
  drawRTL(`${langLabel(meta?.sourceLang)} ← ${langLabel(meta?.targetLang)}`, 9, { color: GOLD });
  y -= 14;
  if (meta?.fileName) { drawRTL(meta.fileName, 8, { color: GREY }); y -= 6; }
  page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.5, color: LIGHT });
  y -= 22;

  // ── Contenu RTL ──
  const maxW = W - 2 * M;
  pages.forEach((p, pi) => {
    if (pi > 0) { newPage(); }
    // libellé page (à droite, gris)
    ensure(16);
    drawRTL(`— صفحة ${pi + 1} —`, 8, { color: GREY });
    y -= 16;
    for (const para of p.split("\n")) {
      if (!para.trim()) { y -= 6; continue; }
      for (const ln of wrapRTL(para, 11, maxW)) {
        ensure(16);
        drawRTL(ln, 11);
        y -= 15;
      }
      y -= 4;
    }
  });

  // ── Cachet sur la dernière page ──
  if (stampImg) {
    const sw = 110, sh = (stampImg.height / stampImg.width) * sw;
    const sy = Math.max(M + FOOT + 6, y - sh);
    page.drawImage(stampImg, { x: W - M - sw, y: sy, width: sw, height: sh, opacity: 0.95 });
  }

  // ── Pieds de page (légal + pagination) ──
  const legal = legalLines(company);
  const allPages = doc.getPages();
  const total = allPages.length;
  const footLeft = ([company?.name, company?.city].filter(Boolean).join(" — ")) || "Metrika Métrage BTP";
  allPages.forEach((pg, idx) => {
    pg.drawLine({ start: { x: M, y: M + 24 }, end: { x: W - M, y: M + 24 }, thickness: 0.5, color: LIGHT });
    pg.drawText(shapeArabicLine(footLeft), { x: M, y: M + 13, size: 7, font, color: GREY });
    const pn = `Page ${idx + 1} / ${total}`;
    pg.drawText(pn, { x: W - M - font.widthOfTextAtSize(pn, 7), y: M + 13, size: 7, font, color: GREY });
    const lg = legal[1] ?? legal[0];
    if (lg) pg.drawText(shapeArabicLine(lg), { x: M, y: M + 4, size: 6, font, color: GREY });
  });

  downloadBlob(new Blob([(await doc.save()) as BlobPart], { type: "application/pdf" }), `traduction-${fileBase(meta)}.pdf`);
}

/** Dessine le cachet (si présent) en bas à droite de la page courante du kit. */
function drawStamp(k: Awaited<ReturnType<typeof createPdf>>) {
  if (!k.stampImg) return;
  const sw = 110, sh = (k.stampImg.height / k.stampImg.width) * sw;
  const sy = Math.max(k.M + k.FOOT + 6, k.y - sh);
  k.page.drawImage(k.stampImg, { x: k.W - k.M - sw, y: sy, width: sw, height: sh, opacity: 0.95 });
}

// ── DOCX (RTL natif pour l'arabe — recommandé pour un rendu parfait) ──
export async function exportTranslationDocx(pages: string[], company?: CompanyExport | null, meta?: TranslationMeta) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");
  const { downloadBlob } = await import("@/lib/export-common");
  const rtl = meta?.targetLang === "ar";

  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: company?.name ?? "Metrika Métrage BTP", bold: true, size: 28, color: "14233F" })],
    }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(rtl ? "ترجمة" : "Traduction")] }),
    new Paragraph({
      children: [new TextRun({
        text: [
          meta?.fileName,
          meta?.sourceLang && meta?.targetLang ? `${langLabel(meta.sourceLang)} → ${langLabel(meta.targetLang)}` : "",
        ].filter(Boolean).join(" · "),
        color: "888888",
      })],
    }),
    ...legalLines(company).map((l) => new Paragraph({ children: [new TextRun({ text: l, size: 14, color: "777777" })] })),
  ];

  pages.forEach((page, pi) => {
    children.push(
      new Paragraph({
        spacing: { before: 240 },
        bidirectional: rtl,
        alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text: rtl ? `صفحة ${pi + 1}` : `Page ${pi + 1}`, bold: true, color: "B7A53A" })],
      }),
    );
    for (const para of page.split("\n")) {
      children.push(
        new Paragraph({
          bidirectional: rtl,
          alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun({ text: para, rightToLeft: rtl })],
        }),
      );
    }
  });

  const doc = new Document({ sections: [{ children }] });
  downloadBlob(await Packer.toBlob(doc), `traduction-${fileBase(meta)}.docx`);
}
