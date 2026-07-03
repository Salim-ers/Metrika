import { runClaude } from "@/lib/ai/client";
import {
  CCTP_PROMPT, PLAN_ANALYSIS_PROMPT, cctpModeDirective, CCTP_MASTER_DIRECTIVE,
  jurisdictionDirective, LOT_STRUCTURE_DIRECTIVE, type Jurisdiction,
} from "@/lib/ai/prompts";
import type { GenerationMode } from "@/lib/fidelity";

interface CctpSectionResult { lot: string; content: string }

export interface CctpGenParams {
  lot: string;
  projectType?: string;
  context?: string;
  planContext?: string;
  mode?: GenerationMode;
  jurisdiction?: Jurisdiction;
  /** Références réglementaires configurées (bibliothèque validée, Paramètres). */
  configuredRefs?: string;
  officialCctp?: string;
  intervenantsTable?: string;
}

/** Bloc « CCTP officiel + intervenants » injecté en tête du message (R1/R2). */
function sourcesBlock(params: { officialCctp?: string; intervenantsTable?: string }): string {
  const parts: string[] = [];
  if (params.officialCctp?.trim()) {
    parts.push(`CCTP OFFICIEL (pilote le contenu) :\n"""\n${params.officialCctp.slice(0, 70000)}\n"""\n${CCTP_MASTER_DIRECTIVE}`);
  }
  if (params.intervenantsTable?.trim()) parts.push(params.intervenantsTable);
  return parts.length ? parts.join("\n\n") + "\n\n" : "";
}

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
 * Génère une section CCTP par lot en une seule passe (mode rapide).
 * La génération produit des BROUILLONS éditables : la validation humaine
 * est requise avant export officiel.
 */
export async function generateCctpSection(params: CctpGenParams): Promise<CctpSectionResult> {
  const user = `${baseUser(params)}

${LOT_STRUCTURE_DIRECTIVE}

Rédige la section CCTP de ce lot, niveau économiste senior, intégrable directement à un DCE réel, en suivant le plan type des 15 chapitres. Document COMPLET et DÉTAILLÉ : traite tous les postes du lot avec, pour chacun, fourniture / mise en œuvre / normes / contrôles / tolérances / interfaces — uniquement lorsque les sources le permettent, sinon marque [À CONFIRMER]. Aucune synthèse, aucun résumé.`;

  const content = await callCctpText(user, 12000);
  return { lot: params.lot, content };
}

/**
 * Passes de rédaction d'un lot en mode exhaustif (document DCE complet).
 * Les passes couvrent ensemble les 15 chapitres du plan type ; le Gros Œuvre
 * a une passe « description » supplémentaire (volume d'ouvrages).
 */
function passesFor(lot: string): { label: string; chapters: string }[] {
  const isGO = /gros\s*[œo]e?uvre/i.test(lot);

  const cadrage = {
    label: "Cadrage & généralités (ch. 1 à 6)",
    chapters:
      "## Objet du lot ## Étendue des travaux ## Documents et pièces sources ## Références réglementaires " +
      "## Hypothèses extraites des pièces ## Prescriptions générales. " +
      "Développe chaque chapitre en sous-sections ### détaillées : consistance des travaux, limites de prestations " +
      "(dû / non dû au présent lot), documents d'exécution dus par l'entreprise, qualité et provenance des matériaux, " +
      "coordination interentreprises. Les références réglementaires suivent STRICTEMENT la directive de juridiction.",
  };

  const localisationMeo = {
    label: "Localisation & mise en œuvre (ch. 8 et 9)",
    chapters:
      "## Localisation — pour chaque famille d'ouvrage, sa localisation issue des plans (tag plan détaillé obligatoire) " +
      "ou « Localisation à compléter d'après plans [À CONFIRMER] ». " +
      "PUIS ## Mise en œuvre — conditions d'exécution, séquences, sujétions, prescriptions d'exécution par ouvrage " +
      "(sous-titres ###), uniquement lorsque les sources le permettent.",
  };

  const cloture = {
    label: "Coordination, réception & clôture (ch. 10 à 15)",
    chapters:
      "## Coordination avec les autres lots (interfaces, réservations, attentes, ordonnancement) " +
      "## Tolérances, réception et contrôles (contrôles internes, essais, épreuves, critères d'acceptation, tolérances chiffrées UNIQUEMENT si sourcées) " +
      "## Documents à remettre (plans d'exécution, notes de calcul, fiches techniques, PV d'essais, DOE/DIUO) " +
      "## Exclusions ## Options / variantes ## Points à compléter — registre récapitulatif de TOUS les [À CONFIRMER] du lot.",
  };

  if (isGO) {
    return [
      cadrage,
      {
        label: "Description des ouvrages — infrastructure (ch. 7, 1/2)",
        chapters:
          "## Description des ouvrages — PREMIÈRE PARTIE : ### Installation de chantier ; ### Implantation ; " +
          "### Terrassements (décapage, fouilles, plateformes, remblais, évacuation) ; ### Réseaux enterrés (EU/EV/EP, regards, tranchées) ; " +
          "### Béton de propreté ; ### Fondations (semelles, radier le cas échéant — avec classes d'exposition et dosages UNIQUEMENT si sourcés) ; " +
          "### Infrastructure et soubassements (voiles, cuvelage, drainage). " +
          "Pour chaque poste : fourniture, mise en œuvre, normes (selon juridiction), contrôles, tolérances, interfaces.",
      },
      {
        label: "Description des ouvrages — superstructure (ch. 7, 2/2)",
        chapters:
          "## Description des ouvrages — SECONDE PARTIE (poursuite du même chapitre, ne répète pas le titre ## Description des ouvrages, continue en ###) : " +
          "### Voiles en béton armé ; ### Poteaux ; ### Poutres, chaînages et linteaux ; ### Planchers et dalles ; ### Escaliers ; " +
          "### Acrotères et bandeaux ; ### Maçonneries de remplissage ; ### Réservations, incorporations et scellements ; " +
          "### Rebouchages et raccords ; ### Ouvrages divers. " +
          "Pour chaque poste : béton/matériaux (classe, dosage si sourcés), aciers, coffrage, mise en œuvre, contrôles, tolérances, interfaces.",
      },
      localisationMeo,
      cloture,
    ];
  }

  return [
    cadrage,
    {
      label: "Description des ouvrages (ch. 7)",
      chapters:
        `## Description des ouvrages du lot « ${lot} » : pour chaque famille d'ouvrage, un sous-titre ### détaillant ` +
        "la fourniture (matériaux, caractéristiques, classes, références normatives selon juridiction) et les exigences de qualité — " +
        "uniquement lorsque les sources le permettent, sinon clause prescriptive renvoyant aux études d'exécution.",
    },
    localisationMeo,
    cloture,
  ];
}

function baseUser(params: CctpGenParams) {
  return `${sourcesBlock(params)}Lot demandé : ${params.lot}
Type de projet : ${params.projectType ?? "non précisé"}
Contexte / exigences particulières : ${params.context ?? "aucune"}
${params.planContext ? `\nSynthèse des plans du projet (à utiliser pour adapter les prescriptions) :\n${params.planContext}` : ""}

${jurisdictionDirective(params.jurisdiction ?? "Mixte", params.configuredRefs)}

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
export async function generateCctpPass(params: CctpGenParams & {
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

${LOT_STRUCTURE_DIRECTIVE}

Rédige UNIQUEMENT, de façon EXHAUSTIVE et au niveau économiste senior, les chapitres suivants du plan type :
${pass.chapters}

Pour chaque poste (sous-titre ###) : fourniture, mise en œuvre, normes, contrôles, tolérances, interfaces — sans jamais inventer une donnée absente des sources. Ne rédige PAS les autres chapitres du lot (ils sont traités séparément). Aucune synthèse, aucun résumé.`;
  // Sortie texte (Markdown) + retry. 11000 tokens/passe : finit sous la limite serverless,
  // la longueur totale vient du cumul des passes.
  const content = await callCctpText(user, 11000);
  return { content, passCount: passes.length, label: pass.label };
}
