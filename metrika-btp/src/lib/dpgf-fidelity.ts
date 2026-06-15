/**
 * Garde-fous de FIABILITÉ pour les lignes DPGF (anti-hallucination), appliqués
 * CÔTÉ CODE en plus des consignes de prompt : même si le modèle propose une
 * quantité non sourcée, on la neutralise et on marque la ligne « À métrer ».
 * Principe : FIABILITÉ > COMPLÉTUDE.
 *
 * Les statuts et leurs libellés viennent désormais du socle commun
 * (src/lib/fidelity.ts) : un seul vocabulaire pour tous les agents.
 */
import { STATUS_META, type DataStatus } from "@/lib/fidelity";

/** Statut d'une ligne DPGF — alias du vocabulaire commun de fiabilité. */
export type DpgfStatus = DataStatus;

/** Méta d'affichage des statuts (libellé + variante de badge) — partagé. */
export const DPGF_STATUS = STATUS_META;

export interface FidelityLine {
  lot?: string;
  designation: string;
  unit: string;
  quantity: number;
  quantitySource?: string;
  status?: string;
  confidence?: string;
  sourceExcerpt?: string;
}

/** Sources qui justifient une quantité contractuelle. */
const SOURCED = new Set(["dpgf", "cdpgf", "cctp", "plan", "plans", "metre", "métré", "metré"]);
const VALID_STATUS = new Set<DpgfStatus>(["confirmed", "to_measure", "inferred", "conflict", "missing"]);

function isSourced(src?: string): boolean {
  return !!src && SOURCED.has(src.trim().toLowerCase());
}

/**
 * Normalise une liste de lignes : toute quantité NON sourcée est ramenée à 0 et
 * la ligne passe en « to_measure ». Une quantité sourcée > 0 devient « confirmed »
 * (sauf statut explicite valide conservé, ex. "conflict").
 */
export function enforceSourcedQuantities<T extends FidelityLine>(lines: T[]): Array<T & { status: DpgfStatus }> {
  return lines.map((l) => {
    const sourced = isSourced(l.quantitySource);
    const explicit = l.status && VALID_STATUS.has(l.status as DpgfStatus) ? (l.status as DpgfStatus) : undefined;
    const qty = Number.isFinite(l.quantity) ? l.quantity : 0;

    if (explicit === "conflict") return { ...l, quantity: qty, status: "conflict" as DpgfStatus };

    if (sourced && qty > 0) {
      return { ...l, quantity: qty, status: (explicit && explicit !== "to_measure" ? explicit : "confirmed") as DpgfStatus };
    }
    // Non sourcée (ou quantité absente) → on ne laisse passer aucune valeur inventée.
    return { ...l, quantity: 0, status: "to_measure" as DpgfStatus, quantitySource: sourced ? l.quantitySource : "none" };
  });
}

/** Indices des lignes en doublon (même désignation normalisée dans le même lot). */
export function duplicateIndices(lines: FidelityLine[]): number[] {
  const seen = new Map<string, number>();
  const dups: number[] = [];
  lines.forEach((l, i) => {
    const key = `${(l.lot ?? "").toLowerCase().trim()}|${l.designation.toLowerCase().trim()}`;
    if (!l.designation.trim()) return;
    if (seen.has(key)) dups.push(i);
    else seen.set(key, i);
  });
  return dups;
}

export interface FidelityReport {
  total: number;
  confirmed: number;
  toMeasure: number;
  conflicts: number;
  duplicates: number;
  /** Aucune quantité inventée ne subsiste (toute qté > 0 est sourcée). */
  noInvented: boolean;
}

/** Bilan de fiabilité d'un DPGF (pour affichage / tests). */
export function fidelityReport(lines: FidelityLine[]): FidelityReport {
  const dups = duplicateIndices(lines).length;
  let confirmed = 0, toMeasure = 0, conflicts = 0, invented = 0;
  for (const l of lines) {
    if (l.status === "confirmed") confirmed++;
    if (l.status === "to_measure") toMeasure++;
    if (l.status === "conflict") conflicts++;
    if (l.quantity > 0 && !isSourced(l.quantitySource)) invented++;
  }
  return { total: lines.length, confirmed, toMeasure, conflicts, duplicates: dups, noInvented: invented === 0 };
}
