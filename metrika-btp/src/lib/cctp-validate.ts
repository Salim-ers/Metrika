/**
 * VALIDATION POST-GÉNÉRATION DU CCTP (garde-fou CÔTÉ CODE, pas seulement prompt).
 *
 * Le CCTP est produit en Markdown (texte long) — la sortie structurée tronquait
 * sur les longs documents. On ne peut donc pas typer chaque ligne ; on SCANNE le
 * texte produit pour SIGNALER (sans bloquer) :
 *  - R3 : un tag [SOURCE PLAN …] insuffisamment localisé ;
 *  - un placeholder résiduel dans le corps ;
 *  - R5/R6 : en mode enrichi, une norme ABSENTE du CCTP officiel non taguée complément.
 *
 * IMPORTANT — ces contrôles sont des ALERTES, jamais bloquantes : le texte libre
 * d'un CCTP est trop variable pour un blocage mécanique fiable (faux positifs =
 * impasse d'export). Le vrai garde-fou du CCTP est la VALIDATION HUMAINE par
 * section + le PRÉ-AUDIT. Le blocage dur reste réservé aux données STRUCTURÉES
 * (lignes DPGF, rôles d'intervenants).
 */
export type CctpIssueCode = "plan_tag_incomplete" | "placeholder" | "norm_added_untagged";

export interface CctpIssue {
  code: CctpIssueCode;
  severity: "blocking" | "warning";
  message: string;
  excerpt?: string;
}

// Tag plan ouvert mais éventuellement peu détaillé.
const PLAN_TAG_OPEN = /\[SOURCE PLAN/i;
// Tag plan suffisamment LOCALISÉ : au moins 3 champs après « SOURCE PLAN »
// (ex. fichier — page — nom). La « cote » exacte n'existe pas toujours sur le
// plan ; on n'exige donc pas les 6 champs (sinon faux positifs systématiques).
const PLAN_TAG_DETAILED = /\[SOURCE PLAN(?:\s*—[^—\]]*){3,}\]/i;
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

    // R3 — tag plan peu localisé (alerte, non bloquant).
    if (PLAN_TAG_OPEN.test(line) && !PLAN_TAG_DETAILED.test(line)) {
      issues.push({
        code: "plan_tag_incomplete",
        severity: "warning",
        message: "Tag plan peu localisé — privilégier [SOURCE PLAN — fichier — p.X — nom — cote/annotation — confiance].",
        excerpt: line.slice(0, 140),
      });
    }

    // Placeholder résiduel dans le corps (alerte à vérifier).
    if (PLACEHOLDER_BODY.test(line)) {
      issues.push({ code: "placeholder", severity: "warning", message: "Placeholder possible dans le corps (TEST / à compléter / xxx…) — à vérifier.", excerpt: line.slice(0, 140) });
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

// ────────────────────────────────────────────────────────────────────────
// Registre des points à vérifier (extraction mécanique du texte généré)
// ────────────────────────────────────────────────────────────────────────

export type VerifyPointKind = "a_confirmer" | "a_metrer" | "non_renseigne" | "complement" | "conflit" | "localisation";

export interface VerifyPoint {
  kind: VerifyPointKind;
  lot: string;
  /** Chapitre courant (dernier titre ## rencontré). */
  chapter?: string;
  excerpt: string;
}

const VERIFY_PATTERNS: { kind: VerifyPointKind; re: RegExp }[] = [
  { kind: "conflit",      re: /contradiction à arbitrer|contradiction a arbitrer|écart entre plans|ecart entre plans/i },
  { kind: "localisation", re: /localisation à compléter|localisation a completer/i },
  { kind: "a_metrer",     re: /à métrer|a metrer/i },
  { kind: "non_renseigne", re: /non renseigné dans les pièces fournies|non renseigne dans les pieces fournies|non trouvé dans les pièces fournies|non trouve dans les pieces fournies/i },
  { kind: "complement",   re: /\[COMPL[ÉE]MENT METRIKA/i },
  { kind: "a_confirmer",  re: /\[À CONFIRMER\]|\[A CONFIRMER\]|à confirmer sur plans|a confirmer sur plans/i },
];

/**
 * Extrait le REGISTRE DES POINTS À VÉRIFIER d'un jeu de sections CCTP :
 * chaque ligne marquée « à confirmer / à métrer / non renseigné / complément /
 * contradiction » devient une entrée traçable (lot + chapitre + extrait).
 * Base du panneau contrôle qualité et de l'annexe « Points à vérifier ».
 */
export function extractVerifyRegister(sections: { lot: string; content: string }[]): VerifyPoint[] {
  const out: VerifyPoint[] = [];
  for (const sec of sections) {
    let chapter: string | undefined;
    for (const raw of (sec.content ?? "").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (/^\s{0,3}##\s/.test(raw) && !/^\s{0,3}###/.test(raw)) {
        chapter = line.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim();
        continue;
      }
      for (const { kind, re } of VERIFY_PATTERNS) {
        if (re.test(line)) {
          out.push({ kind, lot: sec.lot, chapter, excerpt: line.replace(/\*\*/g, "").slice(0, 200) });
          break; // une entrée par ligne (le motif le plus grave d'abord)
        }
      }
    }
  }
  return out;
}

export const VERIFY_KIND_LABELS: Record<VerifyPointKind, string> = {
  conflit: "Contradiction à arbitrer",
  localisation: "Localisation à compléter",
  a_metrer: "À métrer",
  non_renseigne: "Donnée non renseignée",
  complement: "Complément Metrika (non contractuel)",
  a_confirmer: "À confirmer",
};
