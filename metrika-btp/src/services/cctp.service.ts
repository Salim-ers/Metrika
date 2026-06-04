import { runClaude } from "@/lib/ai/client";
import { CCTP_PROMPT, CCTP_SCHEMA, PLAN_ANALYSIS_PROMPT } from "@/lib/ai/prompts";

interface CctpSectionResult { lot: string; content: string }

export interface PlanImage { data: string; mediaType: string }

/**
 * Analyse visuelle des plans (rastérisés en images côté navigateur) et
 * renvoie une synthèse technique factuelle réutilisée pour chaque lot.
 * Lecture des plans faite UNE seule fois (économie de tokens).
 */
export async function analyzePlans(images: PlanImage[]): Promise<string> {
  if (!images.length) return "";
  return runClaude<string>({
    system: PLAN_ANALYSIS_PROMPT,
    user: "Voici les plans du projet. Produis la synthèse technique structurée demandée (inventaire des ouvrages, dimensions, niveaux, structure, fondations, éléments particuliers).",
    images,
    maxTokens: 6000,
  });
}

/**
 * Génère une section CCTP par lot. La génération produit des BROUILLONS
 * éditables : la validation humaine est requise avant export officiel.
 */
export async function generateCctpSection(params: {
  lot: string;
  projectType?: string;
  context?: string;
  planContext?: string;
}): Promise<CctpSectionResult> {
  const user = `Lot demandé : ${params.lot}
Type de projet : ${params.projectType ?? "non précisé"}
Contexte / exigences particulières : ${params.context ?? "aucune"}
${params.planContext ? `\nSynthèse des plans du projet (à utiliser pour adapter les prescriptions) :\n${params.planContext}` : ""}

Rédige la section CCTP de ce lot, niveau économiste senior, intégrable directement à un DCE réel. Document COMPLET et DÉTAILLÉ : traite tous les postes du lot avec, pour chacun, fourniture / mise en œuvre / normes / contrôles / tolérances / interfaces. Aucune synthèse, aucun résumé.`;

  // 16000 tokens : profondeur DCE (document long et détaillé) sans troncature.
  const res = await runClaude<CctpSectionResult>({ system: CCTP_PROMPT, user, schema: CCTP_SCHEMA, maxTokens: 16000 });
  // Garde-fou : si le modèle a renvoyé un objet sans contenu, on évite un export vide.
  return { lot: res.lot || params.lot, content: res.content ?? "" };
}

export async function generateCctp(params: {
  lots: string[];
  projectType?: string;
  context?: string;
  planContext?: string;
}): Promise<CctpSectionResult[]> {
  const { lots, ...rest } = params;

  // Génération par vagues de CONCURRENCY lots : assez parallèle pour rester
  // rapide, mais sans saturer l'API Claude (les rafales déclenchaient des
  // erreurs 429 qui faisaient échouer TOUTE la génération avec Promise.all).
  const CONCURRENCY = 3;
  const results: CctpSectionResult[] = new Array(lots.length);
  let failures = 0;

  for (let i = 0; i < lots.length; i += CONCURRENCY) {
    const batch = lots.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((lot) => generateCctpSection({ lot, ...rest })),
    );
    settled.forEach((s, j) => {
      const lot = batch[j];
      if (s.status === "fulfilled") {
        results[i + j] = s.value;
      } else {
        // Un lot en échec ne bloque plus les autres : on renvoie une section
        // éditable signalant l'erreur, à régénérer/compléter par l'utilisateur.
        failures++;
        const reason = s.reason instanceof Error ? s.reason.message : "Erreur de génération";
        results[i + j] = {
          lot,
          content: `## Section à régénérer\n\nLa génération automatique de ce lot a échoué : ${reason}\n\nRelancez la génération pour ce lot, ou rédigez la section manuellement.`,
        };
      }
    });
  }

  // Si TOUS les lots ont échoué, on lève l'erreur (rien d'exploitable).
  if (failures === lots.length) {
    throw new Error("La génération du CCTP a échoué pour tous les lots. Vérifiez la clé API Claude et réessayez.");
  }
  return results;
}
