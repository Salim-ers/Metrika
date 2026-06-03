import { runClaude } from "@/lib/ai/client";
import { CCTP_PROMPT, PLAN_ANALYSIS_PROMPT } from "@/lib/ai/prompts";

interface CctpSectionResult { lot: string; content: string }

export interface PlanImage { data: string; mediaType: string }

/**
 * Analyse visuelle des plans (rastérisés en images côté navigateur) et
 * renvoie une synthèse technique factuelle réutilisée pour chaque lot.
 * Lecture des plans faite UNE seule fois (économie de tokens).
 */
export async function analyzePlans(images: PlanImage[]): Promise<string> {
  if (!images.length) return "";
  return runClaude<string>({
    system: PLAN_ANALYSIS_PROMPT,
    user: "Voici les plans du projet. Produis la synthèse technique demandée.",
    images,
    maxTokens: 4000,
  });
}

/**
 * Génère une section CCTP par lot. La génération produit des BROUILLONS
 * éditables : la validation humaine est requise avant export officiel.
 */
export async function generateCctpSection(params: {
  lot: string;
  projectType?: string;
  context?: string;
  planContext?: string;
}): Promise<CctpSectionResult> {
  const user = `Lot demandé : ${params.lot}
Type de projet : ${params.projectType ?? "non précisé"}
Contexte / exigences particulières : ${params.context ?? "aucune"}
${params.planContext ? `\nSynthèse des plans du projet (à utiliser pour adapter les prescriptions) :\n${params.planContext}` : ""}

Rédige la section CCTP de ce lot.`;

  return runClaude<CctpSectionResult>({ system: CCTP_PROMPT, user, json: true, maxTokens: 6000 });
}

export async function generateCctp(params: {
  lots: string[];
  projectType?: string;
  context?: string;
  planContext?: string;
}): Promise<CctpSectionResult[]> {
  // Génération séquentielle pour préserver les quotas API.
  const out: CctpSectionResult[] = [];
  for (const lot of params.lots) {
    out.push(await generateCctpSection({ lot, ...params }));
  }
  return out;
}
