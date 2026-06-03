import { runClaude } from "@/lib/ai/client";
import { CCTP_PROMPT } from "@/lib/ai/prompts";

interface CctpSectionResult { lot: string; content: string }

/**
 * Génère une section CCTP par lot. La génération produit des BROUILLONS
 * éditables : la validation humaine est requise avant export officiel.
 */
export async function generateCctpSection(params: {
  lot: string;
  projectType?: string;
  context?: string;
}): Promise<CctpSectionResult> {
  const user = `Lot demandé : ${params.lot}
Type de projet : ${params.projectType ?? "non précisé"}
Contexte / exigences particulières : ${params.context ?? "aucune"}

Rédige la section CCTP de ce lot.`;

  return runClaude<CctpSectionResult>({ system: CCTP_PROMPT, user, json: true, maxTokens: 6000 });
}

export async function generateCctp(params: {
  lots: string[];
  projectType?: string;
  context?: string;
}): Promise<CctpSectionResult[]> {
  // Génération séquentielle pour préserver les quotas API.
  const out: CctpSectionResult[] = [];
  for (const lot of params.lots) {
    out.push(await generateCctpSection({ lot, ...params }));
  }
  return out;
}
