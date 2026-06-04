"use client";

import * as pdfjsLib from "pdfjs-dist";

// Worker pdf.js bundlé localement (servi par l'app, pas de CDN externe).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export interface PlanImage {
  mediaType: "image/jpeg";
  /** base64 sans préfixe data: */
  data: string;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Rastérise les pages d'un PDF (plan) en JPEG downscalés, prêts à être
 * envoyés à Claude pour analyse visuelle. Le downscale garde la charge
 * réseau légère (limite des routes API Vercel ~4,5 Mo).
 */
export async function rasterizePdf(
  file: File,
  opts?: { maxDim?: number; quality?: number; maxPages?: number }
): Promise<PlanImage[]> {
  const maxDim = opts?.maxDim ?? 1500;
  const quality = opts?.quality ?? 0.68;
  const maxPages = opts?.maxPages ?? 25;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const out: PlanImage[] = [];
  const pages = Math.min(pdf.numPages, maxPages);

  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(maxDim / Math.max(base.width, base.height), 3) || 1;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponible");
    ctx.fillStyle = "#ffffff"; // fond blanc (sinon transparence → noir en JPEG)
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob) out.push({ mediaType: "image/jpeg", data: await blobToBase64(blob) });
  }

  await pdf.destroy();
  return out;
}

export interface BudgetedResult {
  images: PlanImage[];
  /** Pages effectivement rendues (≤ pages du PDF). */
  pagesRendered: number;
  /** Pages du PDF non traitées (au-delà de la limite). */
  pagesSkipped: number;
  /** Taille approximative du payload base64 (octets). */
  payloadChars: number;
}

/**
 * Rastérise un PDF en restant SOUS un budget de payload (limite API ~4,5 Mo).
 * Au lieu d'échouer sur un gros PDF, on réduit automatiquement la qualité puis
 * la résolution jusqu'à tenir dans le budget, et on tronque le nombre de pages
 * en dernier recours (en signalant combien ont été ignorées). Corrige le
 * "PDF trop volumineux" en dégradant proprement plutôt qu'en bloquant.
 */
export async function rasterizePdfBudgeted(
  file: File,
  opts?: { budgetChars?: number; maxPages?: number },
): Promise<BudgetedResult> {
  const budget = opts?.budgetChars ?? 3_600_000;
  const hardMaxPages = opts?.maxPages ?? 40;

  // Paliers de dégradation : on tente le plus net, puis on baisse.
  const tiers: { maxDim: number; quality: number }[] = [
    { maxDim: 1500, quality: 0.68 },
    { maxDim: 1300, quality: 0.6 },
    { maxDim: 1100, quality: 0.52 },
    { maxDim: 950, quality: 0.45 },
  ];

  let last: PlanImage[] = [];
  for (const tier of tiers) {
    const imgs = await rasterizePdf(file, { ...tier, maxPages: hardMaxPages });
    const total = imgs.reduce((n, im) => n + im.data.length, 0);
    last = imgs;
    if (total <= budget) {
      return { images: imgs, pagesRendered: imgs.length, pagesSkipped: 0, payloadChars: total };
    }
  }

  // Toujours trop gros au palier le plus bas : on tronque page par page.
  const kept: PlanImage[] = [];
  let acc = 0;
  for (const im of last) {
    if (acc + im.data.length > budget) break;
    kept.push(im);
    acc += im.data.length;
  }
  return {
    images: kept,
    pagesRendered: kept.length,
    pagesSkipped: last.length - kept.length,
    payloadChars: acc,
  };
}

/** Extrait le texte d'un PDF (PDF "textuel" ; un PDF scanné renverra peu/pas de texte). */
export async function extractPdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  await pdf.destroy();
  return text.trim();
}

/**
 * Extrait le texte page par page en reconstituant les sauts de ligne à partir
 * de la position verticale des fragments (préserve au mieux la mise en page
 * d'origine lors d'une traduction fidèle).
 */
export async function extractPdfPages(file: File): Promise<string[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let line = "";
    const lines: string[] = [];
    for (const it of content.items) {
      if (!("str" in it)) continue;
      const y = Math.round(it.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line.trimEnd());
        line = "";
      }
      line += it.str + (it.hasEOL ? "" : " ");
      lastY = y;
    }
    if (line.trim()) lines.push(line.trimEnd());
    pages.push(lines.join("\n").replace(/\n{3,}/g, "\n\n").trim());
  }
  await pdf.destroy();
  return pages;
}
