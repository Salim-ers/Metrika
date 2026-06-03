import type { QuoteLineInput } from "@/types";
import { runClaude } from "@/lib/ai/client";
import { QUOTE_EXTRACT_PROMPT, QUOTE_EXTRACT_SCHEMA } from "@/lib/ai/prompts";

export interface PlanImage { data: string; mediaType: string }

/** Extrait des lignes de devis depuis un document (images de pages PDF). */
export async function extractQuoteLines(images: PlanImage[]): Promise<QuoteLineInput[]> {
  if (!images.length) return [];
  const res = await runClaude<{ lines: QuoteLineInput[] }>({
    system: QUOTE_EXTRACT_PROMPT,
    user: "Voici le document. Extrais toutes les lignes d'ouvrages.",
    images,
    schema: QUOTE_EXTRACT_SCHEMA,
    maxTokens: 8000,
  });
  return res.lines ?? [];
}

/** Totaux HT / TVA / TTC d'un devis. */
export function computeQuoteTotals(lines: QuoteLineInput[], vatRate: number) {
  const totalHT = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const totalVAT = totalHT * (vatRate / 100);
  return {
    totalHT: round(totalHT),
    totalVAT: round(totalVAT),
    totalTTC: round(totalHT + totalVAT),
  };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
