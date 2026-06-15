import { runClaude } from "@/lib/ai/client";
import { CCTP_PREAUDIT_PROMPT, CCTP_PREAUDIT_SCHEMA } from "@/lib/ai/prompts";

export interface CctpPreaudit {
  piecesUtilisees: string[];
  piecesManquantes: string[];
  donneesConfirmees: string[];
  donneesAConfirmer: string[];
  contradictions: string[];
  complementsMetrika: string[];
  pretPourGeneration: boolean;
  syntheseRisque: string;
}

/**
 * Rapport d'audit OBLIGATOIRE avant génération du CCTP (R7) : pièces utilisées /
 * manquantes, données confirmées / à confirmer, contradictions, compléments
 * Metrika. Pilote la décision « prêt pour génération ».
 */
export async function preauditCctp(params: {
  lots: string[];
  projectType?: string;
  officialCctp?: string;
  planContext?: string;
  context?: string;
}): Promise<CctpPreaudit> {
  const user = `Lots à produire : ${params.lots.join(", ") || "non précisés"}
Type de projet : ${params.projectType ?? "non précisé"}
${params.officialCctp?.trim() ? `CCTP OFFICIEL fourni (pilote le contenu) :\n"""\n${params.officialCctp.slice(0, 60000)}\n"""` : "Aucun CCTP officiel fourni."}
${params.planContext?.trim() ? `\nSynthèse des plans :\n"""\n${params.planContext.slice(0, 15000)}\n"""` : "\nAucun plan analysé."}
${params.context?.trim() ? `\nExigences particulières : ${params.context}` : ""}

Produis le rapport d'audit préalable AVANT toute rédaction de CCTP.`;

  const res = await runClaude<Partial<CctpPreaudit>>({
    system: CCTP_PREAUDIT_PROMPT,
    user,
    schema: CCTP_PREAUDIT_SCHEMA,
    maxTokens: 3000,
  });

  return {
    piecesUtilisees: res.piecesUtilisees ?? [],
    piecesManquantes: res.piecesManquantes ?? [],
    donneesConfirmees: res.donneesConfirmees ?? [],
    donneesAConfirmer: res.donneesAConfirmer ?? [],
    contradictions: res.contradictions ?? [],
    complementsMetrika: res.complementsMetrika ?? [],
    pretPourGeneration: res.pretPourGeneration !== false,
    syntheseRisque: res.syntheseRisque ?? "",
  };
}
