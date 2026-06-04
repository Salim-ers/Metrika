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

/**
 * Génère un CCTP EXHAUSTIF pour un lot en plusieurs passes enchaînées
 * (chaque passe traite une partie de la structure), pour un document long
 * et complet, intégrable à un DCE réel. Une passe en échec n'annule pas le lot.
 */
export async function generateCctpSectionDeep(params: {
  lot: string;
  projectType?: string;
  context?: string;
  planContext?: string;
}): Promise<CctpSectionResult> {
  const passes = passesFor(params.lot);
  // Les passes couvrent des chapitres DISTINCTS → on les lance EN PARALLÈLE
  // (temps mur ≈ une passe au lieu de la somme) tout en gardant l'ordre.
  const settled = await Promise.allSettled(
    passes.map((pass) => {
      const user = `${baseUser(params)}

Rédige UNIQUEMENT, de façon EXHAUSTIVE et au niveau économiste senior, les chapitres suivants :
${pass.chapters}

Pour chaque poste (sous-titre ###) : fourniture, mise en œuvre, normes, contrôles, tolérances, interfaces. Ne rédige PAS les autres chapitres du lot (ils sont traités dans d'autres passes). Aucune synthèse, aucun résumé.`;
      return runClaude<CctpSectionResult>({ system: CCTP_PROMPT, user, schema: CCTP_SCHEMA, maxTokens: 16000 });
    }),
  );
  const parts = settled.map((s, i) => {
    if (s.status === "fulfilled" && s.value.content?.trim()) return s.value.content.trim();
    const reason = s.status === "rejected" ? (s.reason instanceof Error ? s.reason.message : "erreur") : "vide";
    return `## ${passes[i].label} — à régénérer\n\nCette partie n'a pas pu être générée (${reason}). Relancez la génération.`;
  });
  if (settled.every((s) => s.status === "rejected")) throw new Error("Génération du lot impossible.");
  return { lot: params.lot, content: parts.join("\n\n") };
}

export async function generateCctp(params: {
  lots: string[];
  projectType?: string;
  context?: string;
  planContext?: string;
  deep?: boolean;
}): Promise<CctpSectionResult[]> {
  const { lots, deep, ...rest } = params;
  const gen = (lot: string) =>
    deep ? generateCctpSectionDeep({ lot, ...rest }) : generateCctpSection({ lot, ...rest });

  // Génération par vagues de CONCURRENCY lots : assez parallèle pour rester
  // rapide, mais sans saturer l'API Claude (les rafales déclenchaient des
  // erreurs 429 qui faisaient échouer TOUTE la génération avec Promise.all).
  // En mode exhaustif, chaque lot lance déjà plusieurs passes en parallèle :
  // on traite donc 1 lot à la fois (sinon trop d'appels simultanés → 429).
  const CONCURRENCY = deep ? 1 : 3;
  const results: CctpSectionResult[] = new Array(lots.length);
  let failures = 0;

  for (let i = 0; i < lots.length; i += CONCURRENCY) {
    const batch = lots.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((lot) => gen(lot)),
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
