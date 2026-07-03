/**
 * Garde-fou ANTI-INVENTION du sous-détail de prix (pur, testé).
 *
 * Doctrine : la génération IA propose une STRUCTURE (composants, coefficients
 * en hypothèses métier, rendement) — JAMAIS un coût. Tout unitCost renvoyé
 * par le modèle est neutralisé à 0 ; les coûts viennent exclusivement de la
 * bibliothèque de prix (costSource = "bibliotheque") ou de la saisie
 * utilisateur (costSource = "manuel").
 */

export interface RawSdComponent {
  type?: string;
  designation?: string;
  unit?: string;
  quantity?: number;
  unitCost?: number;
}

export interface SafeSdComponent {
  type: "MAIN_OEUVRE" | "MATERIAUX" | "MATERIEL" | "TRANSPORT";
  designation: string;
  unit: string;
  quantity: number;
  unitCost: 0;
  costSource: null;
}

const VALID_TYPES = new Set(["MAIN_OEUVRE", "MATERIAUX", "MATERIEL", "TRANSPORT"]);

/**
 * Neutralise toute tentative de coût généré : unitCost = 0, costSource = null.
 * Normalise aussi type/quantité (défense contre une sortie IA dégradée).
 */
export function sanitizeGeneratedComponents(components: RawSdComponent[] | undefined | null): SafeSdComponent[] {
  if (!Array.isArray(components)) return [];
  return components
    .filter((c) => c && typeof c.designation === "string" && c.designation.trim())
    .map((c) => ({
      type: (VALID_TYPES.has(String(c.type)) ? String(c.type) : "MATERIAUX") as SafeSdComponent["type"],
      designation: String(c.designation).trim(),
      unit: typeof c.unit === "string" && c.unit.trim() ? c.unit.trim() : "U",
      quantity: Number.isFinite(Number(c.quantity)) && Number(c.quantity) >= 0 ? Number(c.quantity) : 0,
      unitCost: 0,
      costSource: null,
    }));
}

/**
 * Un composant est-il chiffrable ? (coût strictement positif OU zéro
 * explicitement sourcé). Sert aux gates de validation : impossible de
 * valider un sous-détail dont des coûts restent « à renseigner ».
 */
export function componentCostKnown(c: { unitCost?: number; costSource?: string | null }): boolean {
  const cost = Number(c.unitCost) || 0;
  if (cost > 0) return true;
  return !!c.costSource;
}
