/**
 * VALIDATION POST-GÉNÉRATION DU CCTP (garde-fou CÔTÉ CODE, pas seulement prompt).
 *
 * Le CCTP est produit en Markdown (texte long) — la sortie structurée tronquait
 * sur les longs documents. On ne peut donc pas typer chaque ligne ; on SCANNE le
 * texte produit pour faire respecter mécaniquement :
 *  - R3 : tout tag [SOURCE PLAN …] doit être DÉTAILLÉ (fichier — page — nom — cote — confiance) ;
 *  - corps contractuel sans placeholder (TEST, à compléter…) ;
 *  - R5/R6 : en mode enrichi, une norme ABSENTE du CCTP officiel doit porter un tag complément.
 *
 * Les écarts « blocking » désactivent l'export tant qu'ils ne sont pas levés
 * (les sections sont éditables → l'utilisateur corrige le texte).
 */
export type CctpIssueCode = "plan_tag_incomplete" | "placeholder" | "norm_added_untagged";

export interface CctpIssue {
  code: CctpIssueCode;
  severity: "blocking" | "warning";
  message: string;
  excerpt?: string;
}

// Tag plan ouvert mais éventuellement incomplet.
const PLAN_TAG_OPEN = /\[SOURCE PLAN/i;
// Tag plan DÉTAILLÉ : [SOURCE PLAN — a — b — c — d — e] (5 tirets cadratins « — »).
const PLAN_TAG_DETAILED = /\[SOURCE PLAN(?:\s*—[^—\]]*){5}\]/i;
// Placeholders interdits dans le corps (« exemple » exclu : trop fréquent en prose FR).
const PLACEHOLDER_BODY = /(?:^|[^\p{L}])(test|lorem ipsum|à compléter|a completer|placeholder|tbd|à remplir|a remplir|xxx+)(?:[^\p{L}]|$)/iu;
// Normes / références réglementaires.
const NORM_RE = /\b(NF\s?EN|NF\s?DTU|NF\s?P|DTU|Eurocode|EN\s?\d{3,4}|NM\s?\d|RPS\s?2000|RPC|CCAG|CCTG|fascicule)\b/gi;
// Un tag de provenance quelconque sur la ligne.
const ANY_TAG = /\[(SOURCE (CCTP|PLAN|CDPGF|RAPPORT)|CALCULÉ|CALCULE|À CONFIRMER|A CONFIRMER|COMPLÉMENT METRIKA|COMPLEMENT METRIKA|NON CONTRACTUEL)/i;
const COMPLEMENT_TAG_RE = /\[COMPL[ÉE]MENT METRIKA/i;

const isHeading = (l: string) => /^\s{0,3}#{1,6}\s/.test(l);

/**
 * Scanne un CCTP (Markdown assemblé) et renvoie les écarts de fidélité.
 * @param text contenu Markdown généré
 * @param opts.mode mode de rédaction ; opts.officialCctp texte du CCTP officiel (si fourni)
 */
export function validateCctpContent(text: string, opts?: { mode?: "fidele" | "enrichi"; officialCctp?: string }): CctpIssue[] {
  const issues: CctpIssue[] = [];
  if (!text || !text.trim()) return issues;
  const official = opts?.officialCctp?.toLowerCase() ?? "";
  const enrichi = opts?.mode === "enrichi";

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || isHeading(line)) continue;

    // R3 — tag plan détaillé obligatoire.
    if (PLAN_TAG_OPEN.test(line) && !PLAN_TAG_DETAILED.test(line)) {
      issues.push({
        code: "plan_tag_incomplete",
        severity: "blocking",
        message: "Tag plan incomplet — format attendu : [SOURCE PLAN — fichier — p.X — nom — cote/annotation — confiance].",
        excerpt: line.slice(0, 140),
      });
    }

    // Placeholder dans le corps contractuel.
    if (PLACEHOLDER_BODY.test(line)) {
      issues.push({ code: "placeholder", severity: "blocking", message: "Placeholder interdit dans le corps (TEST / à compléter / xxx…).", excerpt: line.slice(0, 140) });
    }

    // R5/R6 — en mode enrichi avec CCTP officiel : une norme ABSENTE de l'officiel
    // et non taguée complément est un ajout non tracé.
    if (enrichi && official) {
      const norms = line.match(NORM_RE);
      if (norms && !ANY_TAG.test(line)) {
        const added = norms.filter((n) => !official.includes(n.toLowerCase().replace(/\s+/g, " ").trim()) && !official.includes(n.toLowerCase().replace(/\s+/g, "")));
        if (added.length && !COMPLEMENT_TAG_RE.test(line)) {
          issues.push({ code: "norm_added_untagged", severity: "warning", message: `Norme ajoutée non présente dans le CCTP officiel et non taguée complément : ${added.join(", ")}.`, excerpt: line.slice(0, 140) });
        }
      }
    }
  }
  return issues;
}

/** Écarts bloquants uniquement (gate d'export). */
export function cctpBlockingIssues(issues: CctpIssue[]): CctpIssue[] {
  return issues.filter((i) => i.severity === "blocking");
}
