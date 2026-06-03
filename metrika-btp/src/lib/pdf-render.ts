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
