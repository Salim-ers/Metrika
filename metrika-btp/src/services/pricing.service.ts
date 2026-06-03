import { runClaude } from "@/lib/ai/client";
import { PRICING_PROMPT, PRICING_SCHEMA } from "@/lib/ai/prompts";

/** Prix de vente = déboursé × (1 + frais généraux) × (1 + marge). */
export function computeSellingPrice(
  unitPrice: number, generalFeesRate: number, marginRate: number
): number {
  return Math.round(unitPrice * (1 + generalFeesRate) * (1 + marginRate) * 100) / 100;
}

/** Proposition IA d'un prix unitaire de référence (marché marocain). */
export async function suggestPrice(designation: string, lot?: string) {
  const user = `Ouvrage : ${designation}${lot ? `\nLot : ${lot}` : ""}\nPropose un prix de référence.`;
  return runClaude<{
    unitPrice: number; marginRate: number; generalFeesRate: number; confidence: string;
  }>({ system: PRICING_PROMPT, user, schema: PRICING_SCHEMA, maxTokens: 500 });
}
