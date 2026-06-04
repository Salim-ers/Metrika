"use client";

import { CompanyExport } from "@/lib/export-common";
import { createPdf } from "@/lib/pdf-kit";

interface TranslationMeta {
  fileName?: string;
  sourceLang?: string;
  targetLang?: string;
}

const LANG_FR: Record<string, string> = { fr: "Français", en: "Anglais" };
const langLabel = (l?: string) => (l ? LANG_FR[l] ?? l : "");

// ── PDF (kit Metrika, pagination automatique) ─────────────────────
export async function exportTranslationPdf(
  pages: string[],
  company?: CompanyExport | null,
  meta?: TranslationMeta,
) {
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
        if (k.ensure(14)) { /* nouvelle page auto */ }
        k.text(ln, M, k.y, { size: 9.5 });
        k.y -= 13;
      }
      k.y -= 4;
    }
  });

  await k.finish(`traduction-${(meta?.fileName ?? "document").replace(/\.pdf$/i, "")}.pdf`);
}

// ── DOCX ──────────────────────────────────────────────────────────
export async function exportTranslationDocx(pages: string[], meta?: TranslationMeta) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");
  const { downloadBlob } = await import("@/lib/export-common");

  const children = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Traduction")] }),
    new Paragraph({
      children: [new TextRun({
        text: [
          meta?.fileName,
          meta?.sourceLang && meta?.targetLang ? `${langLabel(meta.sourceLang)} → ${langLabel(meta.targetLang)}` : "",
        ].filter(Boolean).join(" · "),
        color: "888888",
      })],
    }),
  ];

  pages.forEach((page, pi) => {
    children.push(
      new Paragraph({
        spacing: { before: 240 },
        children: [new TextRun({ text: `Page ${pi + 1}`, bold: true, color: "B7A53A" })],
      }),
    );
    for (const para of page.split("\n")) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [new TextRun(para)],
        }),
      );
    }
  });

  const doc = new Document({ sections: [{ children }] });
  downloadBlob(await Packer.toBlob(doc), `traduction-${(meta?.fileName ?? "document").replace(/\.pdf$/i, "")}.docx`);
}
