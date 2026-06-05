"use client";

import { winAnsiSafe, downloadBlob } from "@/lib/export-common";
import { shapeArabicLine } from "@/lib/arabic";
import type { LayoutPage } from "@/lib/pdf-render";

/**
 * Reconstruit un PDF « copier-coller » fidèle : chaque ligne traduite est
 * redessinée à la position exacte (x, y, taille) de la ligne d'origine, sur une
 * page de même dimension. Les colonnes/tableaux restent donc alignés.
 * - cible latine (FR/EN) : police Helvetica.
 * - cible arabe : police Amiri (Unicode) + mise en forme RTL (alignée à droite).
 */
export async function buildTranslatedPdf(
  pages: LayoutPage[],
  translations: string[][],
  targetLang: "fr" | "en" | "ar",
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const isAr = targetLang === "ar";

  let font;
  if (isAr) {
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    doc.registerFontkit(fontkit);
    const buf = await fetch("/fonts/Amiri-Regular.ttf").then((r) => r.arrayBuffer());
    // subset:false → police complète embarquée. Le sous-ensemblage produisait des
    // glyphes vides (texte sélectionnable mais invisible) pour l'arabe.
    font = await doc.embedFont(buf, { subset: false });
  } else {
    font = await doc.embedFont(StandardFonts.Helvetica);
  }
  const BLACK = rgb(0.06, 0.09, 0.16);

  const prep = (s: string) => (isAr ? shapeArabicLine(s) : winAnsiSafe(s));

  pages.forEach((pg, pi) => {
    const page = doc.addPage([pg.width, pg.height]);
    const tr = translations[pi] ?? [];
    pg.lines.forEach((ln, li) => {
      const raw = (tr[li] ?? ln.text).trim();
      if (!raw) return;
      const shaped = prep(raw);
      let fs = Math.max(5, Math.min(ln.fontSize || 10, 40));
      let w = font.widthOfTextAtSize(shaped, fs);
      // Auto-ajustement : on réduit la taille si la traduction dépasse la largeur d'origine.
      const maxW = ln.width > 4 ? ln.width * 1.04 : Infinity;
      if (w > maxW) { fs = Math.max(4.5, (fs * maxW) / w); w = font.widthOfTextAtSize(shaped, fs); }
      // Position : LTR à gauche ; RTL aligné à droite sur le bord droit de la ligne.
      const x = isAr ? Math.max(ln.x, ln.x + ln.width - w) : ln.x;
      try { page.drawText(shaped, { x, y: ln.y, size: fs, font, color: BLACK }); } catch { /* glyphe ignoré */ }
    });
  });

  return (await doc.save()) as Uint8Array;
}

export function downloadPdfBytes(bytes: Uint8Array, filename: string) {
  downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), filename);
}
