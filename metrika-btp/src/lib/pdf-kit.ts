"use client";

import { CompanyExport, dataUrlToBytes, winAnsiSafe, legalLines } from "@/lib/export-common";

/**
 * Boîte à outils PDF partagée (pdf-lib) pour des documents Metrika
 * professionnels et cohérents : en-tête de marque avec logo, pied de page
 * légal + pagination, texte assaini (WinAnsi), césure et sauts de page.
 * Utilisée par les exports Devis / Sous-détail / DPGF.
 */
export async function createPdf(company?: CompanyExport | null) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const C = {
    NAVY: rgb(0.078, 0.137, 0.247),
    GOLD: rgb(0.882, 0.647, 0.196),
    GREY: rgb(0.35, 0.37, 0.43),
    LIGHT: rgb(0.86, 0.87, 0.9),
    ZEBRA: rgb(0.965, 0.968, 0.976),
    WHITE: rgb(1, 1, 1),
  };
  const W = 595.28, H = 841.89, M = 48, FOOT = 42;
  const safe = winAnsiSafe;
  const fontOf = (b?: boolean) => (b ? bold : font);

  // Logo + cachet embarqués une fois.
  let logoImg: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  let stampImg: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  const lb = dataUrlToBytes(company?.logoUrl);
  if (lb) { try { logoImg = lb.mime.includes("png") ? await doc.embedPng(lb.bytes) : await doc.embedJpg(lb.bytes); } catch { logoImg = null; } }
  const sb = dataUrlToBytes(company?.stampUrl);
  if (sb) { try { stampImg = sb.mime.includes("png") ? await doc.embedPng(sb.bytes) : await doc.embedJpg(sb.bytes); } catch { stampImg = null; } }

  const st = { page: doc.addPage([W, H]), y: H - M };

  const tw = (s: string, size: number, b?: boolean) => fontOf(b).widthOfTextAtSize(safe(s), size);

  type TextOpts = { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "right" | "center" };
  const text = (s: string, x: number, yy: number, o?: TextOpts) => {
    const ss = safe(s);
    const size = o?.size ?? 9;
    const f = fontOf(o?.bold);
    let xx = x;
    if (o?.align === "right") xx = x - f.widthOfTextAtSize(ss, size);
    else if (o?.align === "center") xx = x - f.widthOfTextAtSize(ss, size) / 2;
    st.page.drawText(ss, { x: xx, y: yy, size, font: f, color: o?.color ?? C.NAVY });
  };

  const wrap = (s: string, size: number, b: boolean, maxW: number) => {
    const words = safe(s).split(/\s+/);
    const out: string[] = [];
    let cur = "";
    const f = fontOf(b);
    for (const w of words) {
      const tt = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(tt, size) > maxW && cur) { out.push(cur); cur = w; }
      else cur = tt;
    }
    if (cur) out.push(cur);
    return out.length ? out : [""];
  };

  const newPage = () => { st.page = doc.addPage([W, H]); st.y = H - M; return st.page; };
  const ensure = (need: number) => { if (st.y - need < M + FOOT) { newPage(); return true; } return false; };
  const hr = (yy: number, color = C.LIGHT, thickness = 0.5) =>
    st.page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness, color });

  /** En-tête de marque (1ʳᵉ page). Renvoie le y sous l'en-tête. */
  const header = (opts: { title: string; docNo?: string; subtitle?: string }) => {
    st.page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: C.GOLD });
    const top = H - M;
    let leftBottom = top;
    if (logoImg) {
      const lw = 132, lh = (logoImg.height / logoImg.width) * lw;
      st.page.drawImage(logoImg, { x: M, y: top - lh, width: lw, height: lh });
      leftBottom = top - lh;
      if (company?.name) { text(company.name, M, leftBottom - 11, { size: 8.5, bold: true, color: C.NAVY }); leftBottom -= 14; }
    } else {
      text(company?.name ?? "Metrika Métrage BTP", M, top - 6, { size: 15, bold: true });
      leftBottom = top - 20;
      const sub = [company?.legalForm, company?.city].filter(Boolean).join(" — ");
      if (sub) { text(sub, M, leftBottom - 10, { size: 8, color: C.GREY }); leftBottom -= 13; }
    }
    // Bloc titre à droite
    text(opts.title, W - M, top - 4, { size: 22, bold: true, align: "right", color: C.NAVY });
    if (opts.docNo) text(opts.docNo, W - M, top - 22, { size: 10, color: C.GOLD, align: "right" });
    if (opts.subtitle) text(opts.subtitle, W - M, top - (opts.docNo ? 35 : 22), { size: 8, color: C.GREY, align: "right" });
    st.y = Math.min(leftBottom, top - 36) - 16;
    hr(st.y);
    st.y -= 18;
    return st.y;
  };

  /** Pieds de page légaux + pagination sur toutes les pages. */
  const footers = () => {
    const pages = doc.getPages();
    const total = pages.length;
    const legal = legalLines(company);
    const left = safe([company?.name, company?.city].filter(Boolean).join(" — ")) || "Metrika Métrage BTP";
    pages.forEach((p, idx) => {
      p.drawLine({ start: { x: M, y: M + 26 }, end: { x: W - M, y: M + 26 }, thickness: 0.5, color: C.LIGHT });
      p.drawText(left, { x: M, y: M + 15, size: 7, font, color: C.GREY });
      const pn = safe(`Page ${idx + 1} / ${total}`);
      p.drawText(pn, { x: W - M - font.widthOfTextAtSize(pn, 7), y: M + 15, size: 7, font, color: C.GREY });
      // 1ʳᵉ ligne légale (ICE/RC/IF…) si dispo, sinon contact.
      const lg = legal[1] ?? legal[0];
      if (lg) p.drawText(safe(lg), { x: M, y: M + 6, size: 6, font, color: C.GREY });
    });
  };

  const finish = async (filename: string) => {
    footers();
    const { downloadBlob } = await import("@/lib/export-common");
    downloadBlob(new Blob([(await doc.save()) as BlobPart], { type: "application/pdf" }), filename);
  };

  return {
    doc, font, bold, rgb, C, W, H, M, FOOT,
    get page() { return st.page; },
    get y() { return st.y; },
    set y(v: number) { st.y = v; },
    logoImg, stampImg,
    safe, tw, text, wrap, newPage, ensure, hr, header, footers, finish,
  };
}
