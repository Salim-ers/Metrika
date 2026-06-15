import { runClaude } from "@/lib/ai/client";
import { CCTP_PROMPT, PLAN_ANALYSIS_PROMPT, cctpModeDirective } from "@/lib/ai/prompts";
import type { GenerationMode } from "@/lib/fidelity";

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
  mode?: GenerationMode;
}): Promise<CctpSectionResult> {
  const user = `Lot demandé : ${params.lot}
Type de projet : ${params.projectType ?? "non précisé"}
Contexte / exigences particulières : ${params.context ?? "aucune"}
${params.planContext ? `\nSynthèse des plans du projet (à utiliser pour adapter les prescriptions) :\n${params.planContext}` : ""}

${cctpModeDirective(params.mode ?? "fidele")}

Rédige la section CCTP de ce lot, niveau économiste senior, intégrable directement à un DCE réel. Document COMPLET et DÉTAILLÉ : traite tous les postes du lot avec, pour chacun, fourniture / mise en œuvre / normes / contrôles / tolérances / interfaces. Aucune synthèse, aucun résumé.`;

  const content = await callCctpText(user, 12000);
  return { lot: params.lot, content };
}

// Bloc Généralités commun à tous les lots : impose le DOUBLE référentiel FR + MA.
const GENERALITES_CHAPTER =
  "## GÉNÉRALITÉS, en sous-sections détaillées et développées : " +
  "### Objet et consistance des travaux ; " +
  "### Références réglementaires — cite EXPLICITEMENT et SÉPARÉMENT le double référentiel : " +
  "(a) FRANCE : NF DTU applicables au lot, normes NF EN et Eurocodes (NF EN 1990 à 1999, dont NF EN 1992 béton et NF EN 1998 parasismique), fascicules du CCTG, CCAG-Travaux, Code de la commande publique, réglementation thermique/environnementale en vigueur ; " +
  "(b) MAROC : normes marocaines NM, Règlement Parasismique RPS 2000 (version en vigueur), Règlement de Construction Parasismique, DTU/CPT applicables, CCAG-T marocain et réglementation des marchés publics marocains ; " +
  "### Coordination interentreprises et gestion des interfaces ; " +
  "### Limites de prestations (ce qui est dû / non dû au présent lot) ; " +
  "### Documents à fournir par l'entreprise (plans d'exécution, notes de calcul, fiches techniques, PV) ; " +
  "### Contrôles, essais et épreuves ; " +
  "### Dossier des ouvrages exécutés (DOE) et DIUO. Développe chaque sous-section en plusieurs paragraphes.";

/** Définit les passes de rédaction d'un lot (mode exhaustif, document ≥ 30 pages). */
function passesFor(lot: string): { label: string; chapters: string }[] {
  const isGO = /gros\s*[œo]e?uvre/i.test(lot);
  const generalites = { label: "Généralités (référentiel FR + Maroc)", chapters: GENERALITES_CHAPTER };

  if (isGO) {
    return [
      generalites,
      {
        label: "Travaux préparatoires & terrassements",
        chapters:
          "## TRAVAUX PRÉPARATOIRES (### Installation de chantier ; ### Panneau de chantier et branchements provisoires ; ### Implantation par géomètre agréé ; ### Sécurité et protections collectives ; ### Protection des existants et avoisinants ; ### Gestion, tri et évacuation des déchets) " +
          "PUIS ## TERRASSEMENTS (### Décapage de la terre végétale ; ### Fouilles en rigoles, puits et pleine masse ; ### Blindages et épuisements ; ### Plateformes et fonds de forme ; ### Remblais et évacuation des terres)",
      },
      {
        label: "Réseaux enterrés, fondations & infrastructure",
        chapters:
          "## RÉSEAUX ENTERRÉS (### Eaux usées EU ; ### Eaux vannes EV ; ### Eaux pluviales EP ; ### Regards et boîtes de branchement ; ### Tranchées, lit de pose et grillage avertisseur) " +
          "PUIS ## FONDATIONS (### Béton de propreté ; ### Semelles isolées et filantes ; ### Radier le cas échéant ; ### Longrines — avec classes d'exposition XC/XA, dosages, enrobages) " +
          "PUIS ## INFRASTRUCTURE ET SOUBASSEMENTS (### Voiles d'infrastructure ; ### Cuvelage / étanchéité enterrée ; ### Drainage périphérique)",
      },
      {
        label: "Superstructure béton armé",
        chapters:
          "## SUPERSTRUCTURE EN BÉTON ARMÉ, poste par poste très détaillé : " +
          "### Voiles en béton armé ; ### Poteaux en béton armé ; ### Poutres, chaînages et linteaux ; " +
          "### Planchers et dalles (dalles pleines, dalles sur terre-plein, dalles de toiture-terrasse) ; ### Escaliers en béton armé. " +
          "Pour chaque poste : béton (classe de résistance, dosage, adjuvants, classe d'exposition), aciers (nuance, enrobage, façonnage), coffrage (type, qualité de parement, tolérances), mise en œuvre, contrôles, tolérances, interfaces.",
      },
      {
        label: "Maçonneries, ouvrages divers & réception",
        chapters:
          "## MAÇONNERIES (### Maçonnerie de remplissage en blocs/briques ; ### Chaînages et raidisseurs) " +
          "PUIS ## ACROTÈRES ET BANDEAUX ## RÉSERVATIONS, INCORPORATIONS ET SCELLEMENTS ## REBOUCHAGES ET RACCORDS " +
          "## OUVRAGES DIVERS (appuis, seuils, formes de pente, joints de dilatation/fractionnement) " +
          "PUIS ## CONTRÔLES, ESSAIS ET RÉCEPTION DES OUVRAGES (épreuves et essais béton, tolérances générales d'exécution, réception des supports et des ouvrages, réserves).",
      },
    ];
  }

  // Autres lots : 3 passes (généralités + 2 parties techniques) pour un volume conséquent.
  return [
    generalites,
    {
      label: "Prescriptions techniques — matériaux & fournitures",
      chapters: `## PRESCRIPTIONS TECHNIQUES — MATÉRIAUX ET FOURNITURES du lot « ${lot} » : pour chaque famille d'ouvrage, un sous-titre ### détaillant la fourniture (matériaux, caractéristiques, classes, références normatives), avec exigences de qualité.`,
    },
    {
      label: "Mise en œuvre, contrôles & réception",
      chapters: `## MISE EN ŒUVRE, CONTRÔLES ET RÉCEPTION du lot « ${lot} » : pour chaque ouvrage (sous-titres ###) la mise en œuvre, les normes/DTU applicables, les contrôles et essais, les tolérances, les interfaces avec les autres lots, puis ## OUVRAGES DIVERS et ## RÉCEPTION DES OUVRAGES.`,
    },
  ];
}

function baseUser(params: { lot: string; projectType?: string; context?: string; planContext?: string; mode?: GenerationMode }) {
  return `Lot demandé : ${params.lot}
Type de projet : ${params.projectType ?? "non précisé"}
Contexte / exigences particulières : ${params.context ?? "aucune"}
${params.planContext ? `\nSynthèse des plans du projet (à utiliser pour adapter les prescriptions) :\n${params.planContext}` : ""}

${cctpModeDirective(params.mode ?? "fidele")}`;
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
  mode?: GenerationMode;
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

