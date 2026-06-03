import { runClaude } from "@/lib/ai/client";
import { SOUS_DETAIL_PROMPT, SOUS_DETAIL_SCHEMA } from "@/lib/ai/prompts";
import type { SousDetailComponentInput } from "@/types";

interface SousDetailResult {
  designation: string;
  unit: string;
  yield: number;
  generalFeesRate: number;
  profitRate: number;
  components: SousDetailComponentInput[];
}

export interface PlanImage { data: string; mediaType: string }

export async function generateSousDetail(params: {
  designation: string;
  unit: string;
  lot?: string;
  images?: PlanImage[];
}): Promise<SousDetailResult> {
  const hasImages = !!params.images?.length;
  const user = `Ouvrage : ${params.designation || "(voir document joint)"}
Unité : ${params.unit}
Lot : ${params.lot ?? "non précisé"}
${hasImages ? "Un document (images de pages PDF) décrit l'ouvrage : lis-le pour préciser la décomposition." : ""}

Établis le sous-détail de prix.`;
  return runClaude<SousDetailResult>({
    system: SOUS_DETAIL_PROMPT, user, images: params.images, schema: SOUS_DETAIL_SCHEMA, maxTokens: 3000,
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
