import { runClaude } from "@/lib/ai/client";
import { isArabic } from "@/lib/arabic";

export type Lang = "fr" | "en" | "ar";
export type Direction = "auto" | "fr-en" | "en-fr" | "fr-ar" | "ar-fr";

const LANG_LABEL: Record<Lang, string> = { fr: "français", en: "anglais", ar: "arabe" };

/** Détecte la langue dominante d'un échantillon (ar/fr/en, fallback fr). */
export async function detectLanguage(sample: string): Promise<Lang> {
  const text = sample.slice(0, 1500).trim();
  if (!text) return "fr";
  // L'arabe se détecte sans appel API (présence du script arabe).
  if (isArabic(text)) return "ar";
  const res = await runClaude<{ lang: string }>({
    system:
      "Tu es un détecteur de langue. Réponds uniquement via l'outil avec le code ISO 639-1 de la langue dominante du texte.",
    user: text,
    maxTokens: 50,
    schema: {
      type: "object",
      properties: { lang: { type: "string", description: "Code ISO 639-1, ex: fr, en ou ar" } },
      required: ["lang"],
    },
  });
  const code = res.lang?.toLowerCase() ?? "";
  if (code.startsWith("ar")) return "ar";
  if (code.startsWith("en")) return "en";
  return "fr";
}

/**
 * Traduit un TABLEAU de lignes en conservant l'ordre et le nombre (pour replacer
 * chaque ligne traduite à sa position d'origine). Traité par petits lots pour
 * fiabiliser la sortie structurée. Les lignes vides restent vides.
 */
export async function translateLines(lines: string[], target: Lang): Promise<string[]> {
  const out: string[] = lines.slice();
  const idx: number[] = [];
  const todo: string[] = [];
  lines.forEach((l, i) => { if (l && l.trim()) { idx.push(i); todo.push(l); } });

  const BATCH = 40;
  for (let b = 0; b < todo.length; b += BATCH) {
    const batch = todo.slice(b, b + BATCH);
    try {
      const res = await runClaude<{ translations: string[] }>({
        system: [
          `Tu es un traducteur technique BTP. Traduis chaque élément vers le ${LANG_LABEL[target]}.`,
          `On te fournit un tableau JSON de lignes. Renvoie EXACTEMENT le même nombre de traductions, dans le MÊME ordre (1 traduction par ligne).`,
          `Ne traduis pas les nombres, codes, unités (m², ml, m³, mm), références ni noms propres.`,
          `Ne fusionne pas, ne découpe pas, n'ajoute pas d'élément. Traduction seule.`,
        ].join("\n"),
        user: JSON.stringify(batch),
        maxTokens: 8000,
        schema: {
          type: "object",
          properties: { translations: { type: "array", items: { type: "string" } } },
          required: ["translations"],
        },
      });
      const tr = Array.isArray(res.translations) ? res.translations : [];
      batch.forEach((orig, j) => { out[idx[b + j]] = tr[j] ?? orig; });
    } catch {
      // En cas d'échec d'un lot, on conserve l'original (document toujours exploitable).
      batch.forEach((orig, j) => { out[idx[b + j]] = orig; });
    }
  }
  return out;
}

