/**
 * Calculs monétaires purs — DPGF/CDPGF et sous-détails de prix.
 *
 * Module SANS dépendance (utilisable côté client, serveur et tests).
 * Doctrine : un montant n'existe que si ses composantes existent ; un coût
 * absent n'est jamais remplacé par 0 « silencieux » — il est signalé.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

// ────────────────────────────────────────────────────────────────────────
// DPGF / CDPGF
// ────────────────────────────────────────────────────────────────────────

export interface DpgfLineLike {
  lot?: string;
  quantity?: number;
  unitPrice?: number;
  status?: string;
  priceSource?: string | null;
}

/** La quantité est-elle réellement renseignée (métrée/sourcée), pas juste 0 ? */
export function quantityKnown(l: { quantity?: number; status?: string }): boolean {
  const q = Number(l.quantity) || 0;
  if (q > 0) return true;
  // 0 n'est une quantité connue que si le statut l'affirme (confirmed/calculated).
  return l.status === "confirmed" || l.status === "calculated";
}

/** Le prix unitaire est-il renseigné (saisie/bibliothèque), pas juste 0 ? */
export function priceKnown(l: { unitPrice?: number; priceSource?: string | null }): boolean {
  const p = Number(l.unitPrice) || 0;
  if (p > 0) return true;
  // Un prix nul n'est « connu » que s'il a une provenance explicite.
  return !!l.priceSource;
}

export interface DpgfTotals {
  totalHT: number;
  totalVAT: number;
  totalTTC: number;
  /** Sous-totaux HT par lot (ordre d'apparition). */
  byLot: { lot: string; totalHT: number; lines: number }[];
  /** Lignes sans quantité exploitable (« Q à renseigner »). */
  missingQuantities: number;
  /** Lignes sans prix exploitable (« Prix à renseigner »). */
  missingPrices: number;
  /** true si tous les montants sont calculables (aucun manquant). */
  complete: boolean;
}

/** Totaux HT/TVA/TTC d'un DPGF chiffré + sous-totaux par lot + manquants. */
export function computeDpgfTotals(lines: DpgfLineLike[], vatRate: number): DpgfTotals {
  const byLotMap = new Map<string, { totalHT: number; lines: number }>();
  let totalHT = 0;
  let missingQuantities = 0;
  let missingPrices = 0;
  for (const l of lines) {
    const lot = (l.lot ?? "").trim() || "Sans lot";
    const entry = byLotMap.get(lot) ?? { totalHT: 0, lines: 0 };
    entry.lines++;
    const qOk = quantityKnown(l);
    const pOk = priceKnown(l);
    if (!qOk) missingQuantities++;
    if (!pOk) missingPrices++;
    if (qOk && pOk) {
      const amount = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
      entry.totalHT = round2(entry.totalHT + amount);
      totalHT = totalHT + amount;
    }
    byLotMap.set(lot, entry);
  }
  totalHT = round2(totalHT);
  const totalVAT = round2(totalHT * (vatRate / 100));
  return {
    totalHT,
    totalVAT,
    totalTTC: round2(totalHT + totalVAT),
    byLot: [...byLotMap.entries()].map(([lot, v]) => ({ lot, ...v })),
    missingQuantities,
    missingPrices,
    complete: missingQuantities === 0 && missingPrices === 0,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Sous-détail de prix
// ────────────────────────────────────────────────────────────────────────

export type ComponentType = "MAIN_OEUVRE" | "MATERIAUX" | "MATERIEL" | "TRANSPORT";

export interface SdComponentLike {
  type: ComponentType | string;
  quantity?: number;
  unitCost?: number;
  costSource?: string | null;
}

export interface SousDetailComputation {
  /** Déboursé par famille (matériaux AVANT pertes). */
  byType: Record<string, number>;
  /** Montant des pertes/chutes (appliquées aux matériaux). */
  wasteAmount: number;
  /** Déboursé sec = Σ composants + pertes matériaux. */
  debourseSec: number;
  /** Frais généraux (sur déboursé sec). */
  generalFees: number;
  /** Marge / bénéfice (sur déboursé + FG). */
  profit: number;
  /** Prix de vente unitaire HT recalculé. */
  sellingPrice: number;
  /** Écart vs prix CDPGF cible (sellingPrice − targetPrice) ; null si pas de cible. */
  ecart: number | null;
  /** Écart relatif en % du prix cible ; null si pas de cible ou cible nulle. */
  ecartPct: number | null;
  /** Nombre de composants sans coût renseigné (« Coût à renseigner »). */
  missingCosts: number;
  /** true si tous les coûts sont renseignés (le PV est alors significatif). */
  complete: boolean;
}

/**
 * Calcule un sous-détail : déboursé sec (pertes appliquées aux matériaux),
 * frais généraux puis marge en cascade, écart vs prix CDPGF.
 * Un composant à coût nul SANS provenance est compté « manquant » : le prix
 * de vente est alors partiel et signalé comme tel (complete = false).
 */
export function computeSousDetail(params: {
  components: SdComponentLike[];
  wasteRate?: number;          // pertes/chutes, ex. 0.05
  generalFeesRate?: number;    // ex. 0.10
  profitRate?: number;         // ex. 0.10
  targetPrice?: number | null; // prix CDPGF de la ligne source
}): SousDetailComputation {
  const wasteRate = Number(params.wasteRate) || 0;
  const fgRate = Number(params.generalFeesRate) || 0;
  const profitRate = Number(params.profitRate) || 0;

  const byType: Record<string, number> = {};
  let missingCosts = 0;
  for (const c of params.components) {
    const qty = Number(c.quantity) || 0;
    const cost = Number(c.unitCost) || 0;
    if (cost <= 0 && !c.costSource) missingCosts++;
    const t = String(c.type || "AUTRE");
    byType[t] = round2((byType[t] ?? 0) + qty * cost);
  }

  const materiaux = byType["MATERIAUX"] ?? 0;
  const wasteAmount = round2(materiaux * wasteRate);
  const base = Object.values(byType).reduce((s, v) => s + v, 0);
  const debourseSec = round2(base + wasteAmount);
  const generalFees = round2(debourseSec * fgRate);
  const profit = round2((debourseSec + generalFees) * profitRate);
  const sellingPrice = round2(debourseSec + generalFees + profit);

  const target = params.targetPrice;
  const hasTarget = typeof target === "number" && isFinite(target) && target > 0;
  const ecart = hasTarget ? round2(sellingPrice - (target as number)) : null;
  const ecartPct = hasTarget ? round2(((sellingPrice - (target as number)) / (target as number)) * 100) : null;

  return {
    byType,
    wasteAmount,
    debourseSec,
    generalFees,
    profit,
    sellingPrice,
    ecart,
    ecartPct,
    missingCosts,
    complete: missingCosts === 0,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Libellés « à renseigner » (jamais de faux zéro)
// ────────────────────────────────────────────────────────────────────────

export const MISSING_LABELS = {
  quantity: "Q à renseigner",
  price: "Prix à renseigner",
  cost: "Coût à renseigner",
  amount: "—",
} as const;

/** Formate un montant, ou le libellé « à renseigner » si la donnée manque. */
export function amountOrMissing(known: boolean, amount: number, fmt: (n: number) => string): string {
  return known ? fmt(amount) : MISSING_LABELS.amount;
}
