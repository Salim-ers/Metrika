import { runClaude } from "@/lib/ai/client";
import { SOUS_DETAIL_PROMPT } from "@/lib/ai/prompts";
import type { SousDetailComponentInput } from "@/types";

interface SousDetailResult {
  designation: string;
  unit: string;
  yield: number;
  generalFeesRate: number;
  profitRate: number;
  components: SousDetailComponentInput[];
}

export async function generateSousDetail(params: {
  designation: string;
  unit: string;
  lot?: string;
}): Promise<SousDetailResult> {
  const user = `Ouvrage : ${params.designation}
Unité : ${params.unit}
Lot : ${params.lot ?? "non précisé"}

Établis le sous-détail de prix.`;
  return runClaude<SousDetailResult>({
    system: SOUS_DETAIL_PROMPT, user, json: true, maxTokens: 3000,
  });
}

/** Calcule le déboursé sec et le prix de vente d'un sous-détail. */
export function computeSousDetail(
  components: SousDetailComponentInput[],
  yieldVal: number,
  generalFeesRate: number,
  profitRate: number
) {
  const debourseSec = components.reduce((s, c) => s + c.quantity * c.unitCost, 0);
  const sellingPrice =
    Math.round(debourseSec * (1 + generalFeesRate) * (1 + profitRate) * 100) / 100;
  return { debourseSec: Math.round(debourseSec * 100) / 100, sellingPrice, yield: yieldVal };
}
