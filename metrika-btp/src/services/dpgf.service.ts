import { runClaude } from "@/lib/ai/client";
import { DPGF_PROMPT } from "@/lib/ai/prompts";
import type { DpgfLineInput } from "@/types";

/**
 * Convertit un texte CCTP en lignes DPGF. Les quantités sont des
 * PROPOSITIONS : chaque ligne devra être validée par l'utilisateur
 * (champ `validated`) avant export.
 */
export async function cctpToDpgf(params: {
  cctpText: string;
  planNotes?: string;
}): Promise<DpgfLineInput[]> {
  const user = `CCTP à analyser :
"""
${params.cctpText.slice(0, 60000)}
"""
${params.planNotes ? `Dimensions/plans fournis : ${params.planNotes}` : ""}

Extrais les ouvrages et propose les quantités.`;

  const res = await runClaude<{ lines: DpgfLineInput[] }>({
    system: DPGF_PROMPT, user, json: true, maxTokens: 8000,
  });
  return res.lines ?? [];
}
