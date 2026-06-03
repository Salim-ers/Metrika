"use client";

import { extractPdfText } from "@/lib/pdf-render";

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if (typeof o.result === "string" || typeof o.result === "number") return String(o.result);
    if (Array.isArray(o.richText)) return o.richText.map((r) => (r as { text?: string }).text ?? "").join("");
    if (o.hyperlink && typeof o.text === "string") return o.text as string;
    return "";
  }
  return String(v);
}

/**
 * Extrait le texte d'un fichier (PDF, Word .docx, Excel .xlsx/.xls, ou texte).
 * Tout se fait côté navigateur : les fichiers ne sont pas envoyés au serveur.
 */
export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return extractPdfText(file);
  }

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth/mammoth.browser");
    const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return res.value.trim();
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const mod = await import("exceljs");
    const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const lines: string[] = [];
    wb.eachSheet((sheet) => {
      sheet.eachRow((row) => {
        const cells = (row.values as unknown[]).slice(1).map(cellToString);
        if (cells.some((c) => c.trim())) lines.push(cells.join("\t"));
      });
    });
    return lines.join("\n").trim();
  }

  // .txt, .csv, .md et autres : lecture brute
  return (await file.text()).trim();
}

export const ACCEPTED_DOCS =
  ".pdf,.docx,.xlsx,.xls,.txt,.csv,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
