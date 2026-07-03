import { runClaude } from "@/lib/ai/client";
import { SOUS_DETAIL_PROMPT, SOUS_DETAIL_SCHEMA } from "@/lib/ai/prompts";
import { sanitizeGeneratedComponents } from "@/lib/sous-detail-guard";
import type { SousDetailComponentInput } from "@/types";

export interface SousDetailStructure {
  designation: string;
  unit: string;
  yield: number;
  generalFeesRate: number;
  profitRate: number;
  components: SousDetailComponentInput[];
  hypotheses: string[];
  pointsToVerify: string[];
}

export interface PlanImage { data: string; mediaType: string }

/**
 * Génère la STRUCTURE d'un sous-détail (composants, coefficients-hypothèses,
 * points à vérifier). DOCTRINE : aucun coût n'est inventé — les unitCost
 * renvoyés par le modèle sont neutralisés à 0 côté code (défense en
 * profondeur), les coûts venant de la bibliothèque ou de la saisie.
 */
export async function generateSousDetail(params: {
  designation: string;
  unit: string;
  lot?: string;
  images?: PlanImage[];
}): Promise<SousDetailStructure> {
  const hasImages = !!params.images?.length;
  const user = `Ouvrage : ${params.designation || "(voir document joint)"}
Unité : ${params.unit}
Lot : ${params.lot ?? "non précisé"}
${hasImages ? "Un document (images de pages PDF) décrit l'ouvrage : lis-le pour préciser la décomposition." : ""}

Prépare la structure du sous-détail de prix (composants + hypothèses + points à vérifier). Aucun coût.`;
  const res = await runClaude<SousDetailStructure>({
    system: SOUS_DETAIL_PROMPT, user, images: params.images, schema: SOUS_DETAIL_SCHEMA, maxTokens: 3000,
  });

  // Garde-fou anti-invention : coût toujours 0 en sortie de génération.
  const components = sanitizeGeneratedComponents(res.components);
  return {
    designation: res.designation || params.designation,
    unit: res.unit || params.unit,
    yield: Number(res.yield) || 1,
    generalFeesRate: typeof res.generalFeesRate === "number" ? res.generalFeesRate : 0.10,
    profitRate: typeof res.profitRate === "number" ? res.profitRate : 0.10,
    components,
    hypotheses: Array.isArray(res.hypotheses) ? res.hypotheses.filter(Boolean) : [],
    pointsToVerify: Array.isArray(res.pointsToVerify) ? res.pointsToVerify.filter(Boolean) : [],
  };
}
