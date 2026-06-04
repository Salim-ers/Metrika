import { runClaude } from "@/lib/ai/client";
import { CCTP_PROMPT, PLAN_ANALYSIS_PROMPT } from "@/lib/ai/prompts";

interface CctpSectionResult { lot: string; content: string }

export interface PlanImage { data: string; mediaType: string }

/**
 * Appel CCTP en SORTIE TEXTE (Markdown), pas en tool-use : sur du contenu long,
 * la sortie structurée pouvait être tronquée et revenir VIDE. En texte, même une
 * réponse longue reste exploitable. Petit retry pour les erreurs transitoires.
 */
async function callCctpText(user: string, maxTokens: number): Promise<string> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = await runClaude<string>({ system: CCTP_PROMPT, user, maxTokens });
      if (text && text.trim().length > 40) return text.trim();
      lastErr = new Error("Réponse vide du modèle");
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1))); // backoff court
  }
  throw lastErr instanceof Error ? lastErr : new Error("Génération impossible");
}

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

  const content = await callCctpText(user, 12000);
  return { lot: params.lot, content };
}

/** Définit les passes de rédaction d'un lot (mode exhaustif). */
function passesFor(lot: string): { label: string; chapters: string }[] {
  const isGO = /gros\s*[œo]e?uvre/i.test(lot);
  const common = {
    label: "Généralités & travaux préparatoires",
    chapters:
      "## GÉNÉRALITÉS (Objet et consistance des travaux ; Références réglementaires ; Coordination interentreprises ; Limites de prestations ; Documents à fournir par l'entreprise ; Contrôles et essais ; DOE) PUIS ## TRAVAUX PRÉPARATOIRES (Installation de chantier ; Implantation ; Sécurité et protections collectives ; Protection des existants ; Gestion et évacuation des déchets)",
  };
  if (isGO) {
    return [
      common,
      {
        label: "Terrassements & réseaux enterrés",
        chapters:
          "## TERRASSEMENTS (Décapage de la terre végétale ; Fouilles en rigoles, puits et pleine masse ; Plateformes et fonds de forme ; Évacuation des terres) PUIS ## RÉSEAUX ENTERRÉS (Eaux usées EU ; Eaux vannes EV ; Eaux pluviales EP ; Regards ; Tranchées et remblais)",
      },
      {
        label: "Gros œuvre",
        chapters:
          "## GROS ŒUVRE en traitant TOUS les postes : Fondations ; Infrastructure ; Soubassements ; Voiles en béton armé ; Poteaux en béton armé ; Poutres en béton armé ; Dalles en béton armé ; Escaliers en béton armé ; Acrotères ; Bandeaux ; Réservations, incorporations et scellements ; Rebouchages et raccords ; Ouvrages divers",
      },
    ];
  }
  return [
    common,
    {
      label: "Chapitres techniques du lot",
      chapters: `Tous les chapitres et postes techniques propres au lot « ${lot} », organisés en parties ## et postes ###`,
    },
  ];
}

function baseUser(params: { lot: string; projectType?: string; context?: string; planContext?: string }) {
  return `Lot demandé : ${params.lot}
Type de projet : ${params.projectType ?? "non précisé"}
Contexte / exigences particulières : ${params.context ?? "aucune"}
${params.planContext ? `\nSynthèse des plans du projet (à utiliser pour adapter les prescriptions) :\n${params.planContext}` : ""}`;
}

/** Nombre de passes pour un lot (1 si non exhaustif). */
export function cctpPassCount(lot: string, deep?: boolean): number {
  return deep ? passesFor(lot).length : 1;
}

/**
 * Génère UNE passe d'un lot (une seule requête IA courte). Orchestré côté client
 * pour rester sous la limite de durée des fonctions serverless : 1 requête HTTP
 * = 1 appel IA. passIndex sélectionne la partie à rédiger.
 */
export async function generateCctpPass(params: {
  lot: string;
  projectType?: string;
  context?: string;
  planContext?: string;
  deep?: boolean;
  passIndex: number;
}): Promise<{ content: string; passCount: number; label: string }> {
  if (!params.deep) {
    const r = await generateCctpSection(params);
    return { content: r.content, passCount: 1, label: params.lot };
  }
  const passes = passesFor(params.lot);
  const pass = passes[Math.max(0, Math.min(params.passIndex, passes.length - 1))];
  const user = `${baseUser(params)}

Rédige UNIQUEMENT, de façon EXHAUSTIVE et au niveau économiste senior, les chapitres suivants :
${pass.chapters}

Pour chaque poste (sous-titre ###) : fourniture, mise en œuvre, normes, contrôles, tolérances, interfaces. Ne rédige PAS les autres chapitres du lot (ils sont traités séparément). Aucune synthèse, aucun résumé.`;
  // Sortie texte (Markdown) + retry. 11000 tokens/passe : finit sous la limite serverless,
  // la longueur totale vient du cumul des passes.
  const content = await callCctpText(user, 11000);
  return { content, passCount: passes.length, label: pass.label };
}

