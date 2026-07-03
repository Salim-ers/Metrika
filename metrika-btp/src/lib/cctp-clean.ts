/**
 * Nettoyage du CCTP pour l'EXPORT CLIENT (pur, testé).
 *
 * Le contenu de travail porte des tags internes de traçabilité
 * ([SOURCE …], [CALCULÉ], [À CONFIRMER]…) et un chapitre interne
 * « Points à compléter » : ils alimentent le registre qualité de
 * l'application mais n'ont pas leur place sur un document client.
 *
 * À l'export :
 *  - [SOURCE PLAN — fichier — p.X — …] → « (cf. fichier, p.X) » (la référence
 *    au plan est une information contractuelle utile, le reste est interne) ;
 *  - [COMPLÉMENT METRIKA …] / [NON CONTRACTUEL] → « (complément Metrika —
 *    non contractuel) » (la distinction contractuelle DOIT rester visible) ;
 *  - [SOURCE CCTP] [SOURCE CDPGF] [SOURCE RAPPORT] [CALCULÉ] [À CONFIRMER] → retirés ;
 *  - chapitre « Points à compléter » → retiré (registre interne).
 */

const PLAN_TAG_RE = /\[SOURCE PLAN([^\]]*)\]/giu;
const COMPLEMENT_TAG_RE = /\[(?:COMPLÉMENT|COMPLEMENT) METRIKA[^\]]*\]|\[NON CONTRACTUEL\]/giu;
const INTERNAL_TAG_RE = /\[(?:SOURCE (?:CCTP|CDPGF|RAPPORT)|CALCULÉ|CALCULE|À CONFIRMER|A CONFIRMER)\]/giu;

/** Transforme un tag plan détaillé en référence de plan propre, ou "" si vide. */
function planReference(tagBody: string): string {
  // Corps attendu : « — fichier — p.X — nom — cote — confiance » (champs optionnels).
  const parts = tagBody.split("—").map((s) => s.trim()).filter(Boolean);
  const file = parts[0] && parts[0] !== "?" && !/^fichier/i.test(parts[0]) ? parts[0] : "";
  const page = parts.find((p) => /^p\.?\s*\d+/i.test(p)) ?? "";
  if (!file) return "";
  return page ? `(cf. ${file}, ${page})` : `(cf. ${file})`;
}

/** Retire/convertit les tags internes d'un texte (corps de document client). */
export function stripProvenanceTags(text: string): string {
  return text
    .replace(PLAN_TAG_RE, (_m, body: string) => planReference(body))
    .replace(COMPLEMENT_TAG_RE, "(complément Metrika — non contractuel)")
    .replace(INTERNAL_TAG_RE, "")
    // Espaces résiduels : doubles espaces, espace parasite avant point/virgule
    // (l'espace avant « : ; ! ? » est conservée — typographie française).
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,])/g, "$1")
    .replace(/[ \t]+$/gm, "");
}

/** Titres de chapitres INTERNES, jamais exportés sur le document client. */
const INTERNAL_CHAPTER_RE = /^\s{0,3}##\s+(?:\d+[.)]\s*)?points à compléter\b/i;

/**
 * Retire les chapitres internes (« ## Points à compléter » jusqu'au « ## »
 * suivant ou la fin) du contenu markdown d'une section.
 */
export function stripInternalChapters(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const isH2 = /^\s{0,3}##\s/.test(line) && !/^\s{0,3}###/.test(line);
    if (isH2) skipping = INTERNAL_CHAPTER_RE.test(line.normalize("NFC"));
    if (!skipping) out.push(line);
  }
  // Compacte les lignes vides multiples laissées par le retrait.
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

/** Pipeline complet de préparation d'une section pour l'export client. */
export function cleanForExport(content: string): string {
  return stripProvenanceTags(stripInternalChapters(content));
}
