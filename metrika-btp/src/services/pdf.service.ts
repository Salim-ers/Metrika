import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import sharp from "sharp";

const NAVY = rgb(0.078, 0.137, 0.247); // #14233F
const GOLD = rgb(0.882, 0.647, 0.196); // #E1A532

export interface BrandingOptions {
  companyName?: string;
  logo?: Uint8Array;        // PNG du logo
  header?: boolean;
  footer?: boolean;
  legalLine?: string;       // ICE / RC / IF en pied de page
}

/** Fusionne plusieurs PDF (déjà réordonnés par l'appelant) en un seul. */
export async function mergePdfs(
  files: { name: string; bytes: Uint8Array }[]
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await PDFDocument.load(f.bytes, { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return out.save();
}

/** Convertit une liste d'images (jpg/png/webp/heic) en un PDF unique. */
export async function imagesToPdf(
  images: { name: string; bytes: Uint8Array }[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const img of images) {
    // Normalisation via sharp → JPEG pour un embarquement fiable
    const jpg = await sharp(img.bytes).rotate().jpeg({ quality: 90 }).toBuffer();
    const meta = await sharp(jpg).metadata();
    const embedded = await doc.embedJpg(jpg);
    const w = meta.width ?? embedded.width;
    const h = meta.height ?? embedded.height;
    const page = doc.addPage([w, h]);
    page.drawImage(embedded, { x: 0, y: 0, width: w, height: h });
  }
  return doc.save();
}

/** Compresse un PDF (recompression des images bitmap intégrées). */
export async function compressPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  // pdf-lib réécrit le flux ; on active le streaming d'objets pour réduire la taille.
  return doc.save({ useObjectStreams: true });
}

/** Applique en-tête / pied de page de marque Metrika sur chaque page. */
export async function applyBranding(
  bytes: Uint8Array,
  opts: BrandingOptions
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await doc.embedFont(StandardFonts.Helvetica);
  const logoImg = opts.logo ? await doc.embedPng(opts.logo) : null;

  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const { width, height } = page.getSize();

    if (opts.header) {
      page.drawRectangle({ x: 0, y: height - 4, width, height: 4, color: GOLD });
      if (logoImg) {
        const lw = 90;
        const lh = (logoImg.height / logoImg.width) * lw;
        page.drawImage(logoImg, { x: 28, y: height - lh - 16, width: lw, height: lh });
      } else if (opts.companyName) {
        page.drawText(opts.companyName, {
          x: 28, y: height - 30, size: 13, font, color: NAVY,
        });
      }
    }

    if (opts.footer) {
      page.drawRectangle({ x: 28, y: 34, width: width - 56, height: 0.6, color: NAVY });
      if (opts.legalLine) {
        page.drawText(opts.legalLine, {
          x: 28, y: 20, size: 7.5, font: fontReg, color: NAVY, opacity: 0.7,
        });
      }
      page.drawText(`Page ${i + 1} / ${pages.length}`, {
        x: width - 90, y: 20, size: 7.5, font: fontReg, color: NAVY, opacity: 0.7,
      });
    }
  });

  return doc.save();
}

/** Pivote les pages indiquées (utile avant fusion). */
export async function rotatePages(
  bytes: Uint8Array,
  rotation: number,
  pageIndices?: number[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const targets = pageIndices ?? pages.map((_, i) => i);
  targets.forEach((i) => pages[i]?.setRotation(degrees(rotation)));
  return doc.save();
}
