import { runClaude } from "@/lib/ai/client";
import { DPGF_PROMPT, DPGF_SCHEMA } from "@/lib/ai/prompts";
import type { DpgfLineInput } from "@/types";

export interface PlanImage { data: string; mediaType: string }

/**
 * Convertit un CCTP en lignes DPGF. Le CCTP peut être fourni en texte
 * et/ou en images de pages PDF (lues visuellement par Claude).
 * Les quantités sont des PROPOSITIONS à valider par l'utilisateur.
 */
export async function cctpToDpgf(params: {
  cctpText?: string;
  planNotes?: string;
  images?: PlanImage[];
}): Promise<DpgfLineInput[]> {
  const hasImages = !!params.images?.length;
  const user = `${params.cctpText?.trim()
    ? `CCTP à analyser :\n"""\n${params.cctpText.slice(0, 60000)}\n"""`
    : ""}
${hasImages ? "Le CCTP est fourni sous forme d'images de pages (ci-jointes) : lis-les intégralement." : ""}
${params.planNotes ? `Dimensions/plans fournis : ${params.planNotes}` : ""}

Extrais les ouvrages et propose les quantités.`;

  const res = await runClaude<{ lines: DpgfLineInput[] }>({
    system: DPGF_PROMPT,
    user,
    images: params.images,
    schema: DPGF_SCHEMA,
    maxTokens: 8000,
  });
  return res.lines ?? [];
}
