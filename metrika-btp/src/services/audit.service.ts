import { runClaude } from "@/lib/ai/client";
import { AUDIT_PROMPT, AUDIT_SCHEMA } from "@/lib/ai/prompts";

export type Gravite = "critique" | "majeur" | "moyen" | "mineur";

export interface AuditFinding {
  refSource?: string;
  elementSource: string;
  elementGenere: string;
  ecart: string;
  gravite: Gravite;
  action: string;
  sourcePage?: string;
  statut?: string;
}

export interface AuditHypothese {
  hypothese: string;
  raison?: string;
  sourcePartielle?: string;
  impact: string;
  validation?: string;
}

export interface AuditResult {
  verdict: string;
  noteSur10: number;
  scores: { fidelite: number; exploitabilite: number; tracabilite: number; risqueMarche: number };
  findings: AuditFinding[];
  correctionsPrioritaires?: string[];
  hypotheses?: AuditHypothese[];
  piecesManquantes?: string[];
}

const clampScore = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const clampNote = (n: unknown) => Math.max(0, Math.min(10, Math.round((Number(n) || 0) * 10) / 10));
const GRAVITE_ORDER: Record<Gravite, number> = { critique: 0, majeur: 1, moyen: 2, mineur: 3 };

/**
 * Compare un CCTP et un DPGF/CDPGF (texte) et renvoie un rapport d'audit
 * structuré : verdict, scores, écarts classés par gravité, corrections.
 */
export async function auditCctpDpgf(params: { cctpText: string; dpgfText: string }): Promise<AuditResult> {
  const user = `CCTP (source) :
"""
${params.cctpText.slice(0, 60000)}
"""

DPGF / CDPGF à auditer :
"""
${params.dpgfText.slice(0, 60000)}
"""

Compare le DPGF au CCTP selon la méthode. Liste les écarts sourcés, classe-les par gravité, donne des scores honnêtes et un verdict.`;

  const res = await runClaude<AuditResult>({
    system: AUDIT_PROMPT,
    user,
    schema: AUDIT_SCHEMA,
    maxTokens: 9000,
  });

  const findings = (res.findings ?? [])
    .map((f) => ({ ...f, gravite: (["critique", "majeur", "moyen", "mineur"].includes(f.gravite) ? f.gravite : "moyen") as Gravite }))
    .sort((a, b) => GRAVITE_ORDER[a.gravite] - GRAVITE_ORDER[b.gravite]);

  return {
    verdict: res.verdict ?? "",
    noteSur10: clampNote(res.noteSur10),
    scores: {
      fidelite: clampScore(res.scores?.fidelite),
      exploitabilite: clampScore(res.scores?.exploitabilite),
      tracabilite: clampScore(res.scores?.tracabilite),
      risqueMarche: clampScore(res.scores?.risqueMarche),
    },
    findings,
    correctionsPrioritaires: res.correctionsPrioritaires ?? [],
    hypotheses: res.hypotheses ?? [],
    piecesManquantes: res.piecesManquantes ?? [],
  };
}
