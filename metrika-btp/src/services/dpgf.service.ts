import { runClaude } from "@/lib/ai/client";
import { DPGF_PROMPT, DPGF_SCHEMA, CDPGF_MASTER_DIRECTIVE, DPGF_PROVISIONAL_DIRECTIVE } from "@/lib/ai/prompts";
import { enforceSourcedQuantities, type DpgfStatus } from "@/lib/dpgf-fidelity";
import { resolveCurrency, cdpgfStructureDiff, type StructureLine } from "@/lib/fidelity";
import type { DpgfLineInput } from "@/types";

export interface PlanImage { data: string; mediaType: string }

export interface DpgfConversion {
  lines: Array<DpgfLineInput & { status: DpgfStatus }>;
  /** true = DPGF provisoire non contractuel (aucun CDPGF officiel fourni). */
  provisional: boolean;
  /** Devise du CDPGF officiel si lisible, sinon « À confirmer ». */
  currency: string;
  /**
   * Contrôle de structure maître (mode CDPGF officiel) : lignes du cadre absentes
   * du DPGF produit (missing) et lignes produites hors cadre (extra). Vide hors
   * mode maître. Garde-fou : on signale toute dérive sans la masquer.
   */
  structureDiff?: { missing: StructureLine[]; extra: StructureLine[] };
}

/**
 * Convertit un CCTP (et plans/métré éventuels) en lignes DPGF.
 *
 * Deux modes (cf. §8 du cahier de fiabilité) :
 *  - Un CDPGF/DPGF OFFICIEL est fourni → il devient la STRUCTURE MAÎTRE :
 *    on reproduit son cadre à l'identique, on ne renseigne que les quantités sourcées.
 *  - Sinon → DPGF PROVISOIRE non contractuel, quantités calculables uniquement.
 *
 * Les quantités sont des PROPOSITIONS à valider par l'utilisateur. Le garde-fou
 * code (enforceSourcedQuantities) neutralise toute quantité non sourcée.
 */
export async function cctpToDpgf(params: {
  cctpText?: string;
  planNotes?: string;
  officialCdpgf?: string;
  images?: PlanImage[];
}): Promise<DpgfConversion> {
  const hasImages = !!params.images?.length;
  const official = params.officialCdpgf?.trim();
  const provisional = !official;

  const user = `${official
    ? `CDPGF / DPGF OFFICIEL (structure maître — à reproduire à l'identique) :\n"""\n${official.slice(0, 80000)}\n"""\n`
    : ""}
${params.cctpText?.trim()
    ? `CCTP ${official ? "(uniquement pour SOURCER les quantités des lignes du cadre, pas pour créer des lignes)" : "à analyser"} :\n"""\n${params.cctpText.slice(0, 60000)}\n"""`
    : ""}
${hasImages ? "Le CCTP est fourni sous forme d'images de pages (ci-jointes) : lis-les intégralement." : ""}
${params.planNotes ? `Dimensions/plans fournis : ${params.planNotes}` : ""}

${official ? CDPGF_MASTER_DIRECTIVE : DPGF_PROVISIONAL_DIRECTIVE}

Extrais les ouvrages et propose les quantités.`;

  const res = await runClaude<{ lines: DpgfLineInput[]; detectedCurrency?: string; officialStructure?: StructureLine[] }>({
    system: DPGF_PROMPT,
    user,
    images: params.images,
    schema: DPGF_SCHEMA,
    maxTokens: 8000,
  });

  // Garde-fou anti-hallucination : aucune quantité non sourcée ne passe (→ « À métrer »).
  const lines = enforceSourcedQuantities(res.lines ?? []);

  // Contrôle de structure maître : on compare le cadre officiel lu par le modèle
  // aux lignes réellement produites (lignes omises / ajoutées hors cadre).
  let structureDiff: DpgfConversion["structureDiff"];
  if (official && Array.isArray(res.officialStructure) && res.officialStructure.length > 0) {
    structureDiff = cdpgfStructureDiff(
      res.officialStructure.map((s) => ({ code: s.code, designation: s.designation })),
      lines.map((l) => ({ code: l.code, designation: l.designation })),
    );
  }

  return {
    lines,
    provisional,
    currency: resolveCurrency(official ? res.detectedCurrency : undefined),
    structureDiff,
  };
}
