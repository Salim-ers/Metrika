import { runClaude } from "@/lib/ai/client";

export type Lang = "fr" | "en";
export type Direction = "auto" | "fr-en" | "en-fr";

const LANG_LABEL: Record<Lang, string> = { fr: "français", en: "anglais" };

/** Découpe un texte en morceaux ~max caractères en respectant les sauts de ligne. */
function chunkText(text: string, max = 6000): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let buf = "";
  for (const para of text.split(/\n/)) {
    if (buf.length + para.length + 1 > max && buf) {
      out.push(buf);
      buf = "";
    }
    buf += (buf ? "\n" : "") + para;
  }
  if (buf) out.push(buf);
  return out;
}

/** Détecte la langue dominante d'un échantillon (fr/en, fallback fr). */
export async function detectLanguage(sample: string): Promise<Lang> {
  const text = sample.slice(0, 1500).trim();
  if (!text) return "fr";
  const res = await runClaude<{ lang: string }>({
    system:
      "Tu es un détecteur de langue. Réponds uniquement via l'outil avec le code ISO 639-1 de la langue dominante du texte.",
    user: text,
    maxTokens: 50,
    schema: {
      type: "object",
      properties: { lang: { type: "string", description: "Code ISO 639-1, ex: fr ou en" } },
      required: ["lang"],
    },
  });
  return res.lang?.toLowerCase().startsWith("en") ? "en" : "fr";
}

/**
 * Traduit un texte en préservant la structure (sauts de ligne, listes, titres,
 * nombres, unités, références techniques BTP). Aucune reformulation, aucun ajout.
 */
async function translateOnce(text: string, target: Lang): Promise<string> {
  if (!text.trim()) return text;
  return runClaude<string>({
    system: [
      `Tu es un traducteur technique professionnel spécialisé BTP / construction.`,
      `Traduis FIDÈLEMENT le texte fourni vers le ${LANG_LABEL[target]}.`,
      `Règles strictes :`,
      `- Conserve EXACTEMENT la mise en forme : sauts de ligne, retours à la ligne, indentation, listes, titres.`,
      `- Ne traduis pas les nombres, codes, références, unités (m², ml, m³, mm), noms propres, marques.`,
      `- Ne reformule pas, n'ajoute rien, ne commente pas. Renvoie UNIQUEMENT la traduction.`,
      `- Respecte la terminologie technique du bâtiment (CCTP, DPGF, gros œuvre, etc.).`,
    ].join("\n"),
    user: text,
    maxTokens: 8000,
  });
}

/** Traduit une page entière en la découpant si nécessaire. */
async function translatePage(page: string, target: Lang): Promise<string> {
  const chunks = chunkText(page);
  if (chunks.length === 1) return translateOnce(chunks[0], target);
  const parts: string[] = [];
  for (const c of chunks) parts.push(await translateOnce(c, target));
  return parts.join("\n");
}

export interface TranslateResult {
  sourceLang: Lang;
  targetLang: Lang;
  pages: string[];
}

/**
 * Traduit un document (pages de texte) FR↔EN. La direction "auto" détecte la
 * langue source et bascule vers l'autre. Les pages sont traduites en séquence
 * pour rester sous les limites de tokens (chunking interne sur les grosses pages).
 */
export async function translateDocument(
  pages: string[],
  direction: Direction,
): Promise<TranslateResult> {
  const sample = pages.find((p) => p.trim()) ?? "";
  let sourceLang: Lang;
  let targetLang: Lang;

  if (direction === "fr-en") { sourceLang = "fr"; targetLang = "en"; }
  else if (direction === "en-fr") { sourceLang = "en"; targetLang = "fr"; }
  else {
    sourceLang = await detectLanguage(sample);
    targetLang = sourceLang === "fr" ? "en" : "fr";
  }

  const translated: string[] = [];
  for (const page of pages) {
    translated.push(await translatePage(page, targetLang));
  }
  return { sourceLang, targetLang, pages: translated };
}
