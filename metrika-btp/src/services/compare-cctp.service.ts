import { runClaude } from "@/lib/ai/client";
import { COMPARE_CCTP_PROMPT, COMPARE_CCTP_SCHEMA } from "@/lib/ai/prompts";

export type Gravite = "critique" | "majeur" | "moyen" | "mineur";

export type CompareType =
  | "identite" | "intervenant" | "structure" | "norme" | "materiau"
  | "mise_en_oeuvre" | "controle" | "limite_prestation" | "interface"
  | "ajout" | "suppression" | "reformulation" | "autre";

export interface CompareFinding {
  chapitre?: string;
  type?: CompareType;
  versionA: string;
  versionB: string;
  ecart: string;
  gravite: Gravite;
  action?: string;
}

export interface CompareCctpResult {
  verdict: string;
  noteSur10: number;
  scores: { similarite: number; risqueDivergence: number };
  findings: CompareFinding[];
  syntheseChapitres?: string[];
}

const clampScore = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const clampNote = (n: unknown) => Math.max(0, Math.min(10, Math.round((Number(n) || 0) * 10) / 10));
const GRAVITE_ORDER: Record<Gravite, number> = { critique: 0, majeur: 1, moyen: 2, mineur: 3 };

/**
 * Compare deux versions d'un CCTP (A = référence, B = à comparer) et renvoie
 * un rapport d'écarts classés par gravité, avec scores et synthèse de chapitres.
 */
export async function compareCctp(params: { cctpA: string; cctpB: string }): Promise<CompareCctpResult> {
  const user = `CCTP — VERSION A (référence) :
"""
${params.cctpA.slice(0, 60000)}
"""

CCTP — VERSION B (à comparer) :
"""
${params.cctpB.slice(0, 60000)}
"""

Compare A et B selon la méthode. Liste les écarts (versionA / versionB), classe-les par gravité et par type, donne des scores honnêtes, un verdict et la synthèse des chapitres ajoutés/supprimés.`;

  const res = await runClaude<CompareCctpResult>({
    system: COMPARE_CCTP_PROMPT,
    user,
    schema: COMPARE_CCTP_SCHEMA,
    maxTokens: 9000,
  });

  const findings = (res.findings ?? [])
    .map((f) => ({ ...f, gravite: (["critique", "majeur", "moyen", "mineur"].includes(f.gravite) ? f.gravite : "moyen") as Gravite }))
    .sort((a, b) => GRAVITE_ORDER[a.gravite] - GRAVITE_ORDER[b.gravite]);

  return {
    verdict: res.verdict ?? "",
    noteSur10: clampNote(res.noteSur10),
    scores: {
      similarite: clampScore(res.scores?.similarite),
      risqueDivergence: clampScore(res.scores?.risqueDivergence),
    },
    findings,
    syntheseChapitres: res.syntheseChapitres ?? [],
  };
}
