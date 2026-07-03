/**
 * Comparaison CCTP ↔ DPGF — moteur pur (client, serveur, tests).
 *
 * Repère mécaniquement, sans IA :
 *  - les articles CCTP sans ligne DPGF (omissions),
 *  - les lignes DPGF sans article CCTP correspondant (hors cadre),
 *  - les doublons,
 *  - les unités incohérentes / inconnues,
 *  - les quantités manquantes (« Q à renseigner »),
 *  - les prix manquants (« Prix à renseigner », mode CDPGF).
 * Ces contrôles SIGNALENT, ils n'inventent ni ne corrigent rien.
 */

import { duplicateDesignations, normalizeUnit } from "@/lib/fidelity";
import { quantityKnown, priceKnown } from "@/lib/price-math";

export interface CctpArticle {
  lot: string;
  sectionId?: string;
  heading: string;
  /** Chemin de chapitre (ex. « Description des ouvrages ») pour contexte. */
  chapter?: string;
}

export interface CompareLine {
  lot?: string;
  designation: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  status?: string;
  priceSource?: string | null;
  cctpArticle?: string | null;
  cctpSectionId?: string | null;
}

/** Chapitres « cadre » du plan type : leurs titres ne sont pas des ouvrages. */
const GENERIC_HEADINGS = [
  "objet du lot", "étendue des travaux", "etendue des travaux",
  "documents et pièces sources", "documents et pieces sources",
  "références réglementaires", "references reglementaires",
  "hypothèses extraites", "hypotheses extraites",
  "prescriptions générales", "prescriptions generales",
  "description des ouvrages", "localisation", "mise en œuvre", "mise en oeuvre",
  "coordination avec les autres lots", "coordination interentreprises",
  "tolérances", "tolerances", "réception", "reception", "contrôles et essais", "controles et essais",
  "documents à remettre", "documents a remettre", "documents à fournir", "documents a fournir",
  "exclusions", "options / variantes", "options/variantes", "variantes",
  "points à compléter", "points a completer", "généralités", "generalites",
  "dossier des ouvrages exécutés", "dossier des ouvrages executes", "doe",
  "limites de prestations", "notes générales", "notes generales",
];

const normHeading = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/gi, " ").replace(/\s+/g, " ").trim();

function isGenericHeading(h: string): boolean {
  const n = normHeading(h);
  if (!n) return true;
  return GENERIC_HEADINGS.some((g) => {
    const ng = normHeading(g);
    return n === ng || n.startsWith(ng + " ") || ng.startsWith(n + " ");
  });
}

/**
 * Extrait les ARTICLES (postes d'ouvrage) d'un jeu de sections CCTP markdown :
 * les titres « ### » hors chapitres-cadres. C'est la maille de rattachement
 * des lignes DPGF (« article CCTP source »).
 */
export function extractCctpArticles(
  sections: { lot: string; content: string; id?: string }[],
): CctpArticle[] {
  const out: CctpArticle[] = [];
  for (const sec of sections) {
    let chapter = "";
    for (const raw of (sec.content ?? "").split("\n")) {
      const s = raw.trim();
      if (s.startsWith("## ") && !s.startsWith("### ")) {
        chapter = s.slice(3).replace(/\*\*/g, "").trim();
      } else if (s.startsWith("### ")) {
        const heading = s.slice(4).replace(/\*\*/g, "").trim();
        if (!heading || isGenericHeading(heading)) continue;
        // On ne retient comme « articles » que les postes des chapitres descriptifs.
        if (chapter && isGenericHeading(chapter) && !/description|ouvrages|travaux|prescriptions techniques/i.test(chapter)) continue;
        out.push({ lot: sec.lot, sectionId: sec.id, heading, chapter: chapter || undefined });
      }
    }
  }
  return out;
}

const tokensOf = (s: string) => {
  const n = normHeading(s);
  return new Set(n.split(" ").filter((w) => w.length > 3));
};

function covers(a: Set<string>, b: Set<string>, ratio: number): boolean {
  if (a.size === 0) return true;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common >= Math.max(1, Math.ceil(a.size * ratio));
}

/**
 * Couverture STRICTE pour la détection d'omissions : un article multi-mots
 * exige AU MOINS 2 tokens communs — sinon « Béton de propreté » serait
 * réputé couvert par n'importe quelle ligne contenant « béton ».
 * (Conservateur : mieux vaut sur-signaler une omission que la masquer.)
 */
function coversStrict(article: Set<string>, line: Set<string>): boolean {
  if (article.size === 0) return true;
  let common = 0;
  for (const w of article) if (line.has(w)) common++;
  const need = article.size === 1 ? 1 : Math.max(2, Math.ceil(article.size * 0.5));
  return common >= need;
}

export interface DpgfCompareReport {
  /** Articles CCTP sans ligne DPGF correspondante. */
  omissions: CctpArticle[];
  /** Index des lignes DPGF sans article CCTP correspondant. */
  orphanLines: number[];
  /** Index des lignes en doublon (même désignation, même lot). */
  duplicates: number[];
  /** Index des lignes dont l'unité est vide ou inhabituelle. */
  unitIssues: { index: number; unit: string }[];
  /** Index des lignes sans quantité exploitable. */
  missingQuantities: number[];
  /** Index des lignes sans prix exploitable (mode chiffré uniquement). */
  missingPrices: number[];
  /** Nombre total de contrôles en écart. */
  issueCount: number;
}

const KNOWN_UNITS = new Set(["m²", "m³", "ml", "u", "ens", "kg", "t", "forfait", "h", "j", "l", "m"]);

/**
 * Compare un CCTP (sections markdown) et des lignes DPGF.
 * `priced` : true en mode CDPGF (contrôle aussi les prix).
 */
export function compareCctpDpgf(
  sections: { lot: string; content: string; id?: string }[],
  lines: CompareLine[],
  opts?: { priced?: boolean },
): DpgfCompareReport {
  const articles = extractCctpArticles(sections);
  const lineTokens = lines.map((l) => tokensOf(l.designation));

  // Omissions : article sans ligne couvrante (couverture stricte).
  const omissions = articles.filter((a) => {
    const at = tokensOf(a.heading);
    return !lineTokens.some((lt) => coversStrict(at, lt));
  });

  // Lignes hors CCTP : ligne rattachée à rien (ni lien explicite, ni correspondance texte).
  const articleTokens = articles.map((a) => tokensOf(a.heading));
  const orphanLines = lines
    .map((l, i) => {
      if (l.cctpSectionId || l.cctpArticle) return -1; // lien explicite = rattachée
      if (articles.length === 0) return -1;            // pas de CCTP → contrôle sans objet
      const lt = lineTokens[i];
      const matched = articleTokens.some((at) => covers(lt, at, 0.5) || covers(at, lt, 0.5));
      return matched ? -1 : i;
    })
    .filter((i) => i >= 0);

  const duplicates = duplicateDesignations(lines.map((l) => ({ lot: l.lot, designation: l.designation })));

  const unitIssues = lines
    .map((l, index) => ({ index, unit: l.unit ?? "" }))
    .filter(({ unit }) => {
      const n = normalizeUnit(unit);
      return !n || !KNOWN_UNITS.has(n);
    });

  const missingQuantities = lines.map((l, i) => (quantityKnown(l) ? -1 : i)).filter((i) => i >= 0);
  const missingPrices = opts?.priced
    ? lines.map((l, i) => (priceKnown(l) ? -1 : i)).filter((i) => i >= 0)
    : [];

  return {
    omissions,
    orphanLines,
    duplicates,
    unitIssues,
    missingQuantities,
    missingPrices,
    issueCount:
      omissions.length + orphanLines.length + duplicates.length +
      unitIssues.length + missingQuantities.length + missingPrices.length,
  };
}
