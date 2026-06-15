/**
 * ERREURS BLOQUANTES (R6 du cahier de fiabilité).
 *
 * Contrôles MÉCANIQUES (purs, testables) qui empêchent de finaliser/exporter un
 * document non fiable :
 *  - quantité sans source ni formule,
 *  - unité absente sur une quantité chiffrée,
 *  - prix absent « remplacé par 0 » (export chiffré),
 *  - placeholder dans une désignation,
 *  - intervenant ambigu,
 *  - rôle déduit au lieu d'être extrait.
 *
 * Les contrôles SÉMANTIQUES (norme ajoutée sans tag, CCTP généré contredisant le
 * CCTP officiel) relèvent du pré-audit IA (cf. cctp-preaudit.service).
 *
 * Principe : FIABILITÉ > COMPLÉTUDE — on bloque plutôt que de laisser passer un faux.
 */
import {
  quantityHasJustification, normalizeUnit, hasPlaceholder,
  ambiguousActors, ACTOR_ROLES, type ActorEntry,
} from "./fidelity";

export type BlockingCode =
  | "qty_no_source" | "unit_missing" | "price_zero" | "placeholder"
  | "actor_inferred" | "actor_ambiguous";

export interface BlockingError {
  code: BlockingCode;
  message: string;
  /** Repère lisible (ex. « Ligne 3 — Voiles BA » ou « BET structure »). */
  ref?: string;
}

export interface DpgfErrLine {
  designation: string;
  unit?: string;
  quantity?: number;
  quantitySource?: string;
  status?: string;
  calculation?: string;
  unitPrice?: number;
}

/**
 * Erreurs bloquantes d'un tableau DPGF. `opts.priced` = true pour un export
 * CHIFFRÉ (CDPGF) : un prix unitaire à 0 devient alors bloquant.
 */
export function dpgfBlockingErrors(lines: DpgfErrLine[], opts?: { priced?: boolean }): BlockingError[] {
  const out: BlockingError[] = [];
  lines.forEach((l, i) => {
    const ref = `Ligne ${i + 1} — ${l.designation?.trim() || "(sans désignation)"}`;
    const qty = Number(l.quantity) || 0;
    if (qty > 0 && !quantityHasJustification({ quantity: qty, quantitySource: l.quantitySource, status: l.status, calculation: l.calculation })) {
      out.push({ code: "qty_no_source", message: `Quantité (${qty}) sans source ni formule.`, ref });
    }
    if (qty > 0 && !normalizeUnit(l.unit)) {
      out.push({ code: "unit_missing", message: "Unité absente pour une quantité chiffrée.", ref });
    }
    if (hasPlaceholder(l.designation)) {
      out.push({ code: "placeholder", message: "Désignation contenant un placeholder (TEST/exemple…).", ref });
    }
    if (opts?.priced && (Number(l.unitPrice) || 0) <= 0) {
      out.push({ code: "price_zero", message: "Prix unitaire absent (0) — à renseigner avant l'export chiffré.", ref });
    }
  });
  return out;
}

/**
 * Erreurs bloquantes de la table des intervenants : rôle déduit (inferred) ou
 * intervenant ambigu (même nom pour plusieurs rôles). Un rôle « missing »
 * (Non renseigné) n'est PAS bloquant — c'est une absence honnête.
 */
export function intervenantBlockingErrors(table: ActorEntry[]): BlockingError[] {
  const out: BlockingError[] = [];
  const amb = new Set(ambiguousActors(table));
  for (const a of table) {
    const label = ACTOR_ROLES[a.role].label;
    if (a.status === "inferred") {
      out.push({ code: "actor_inferred", message: `Rôle « ${label} » DÉDUIT au lieu d'être extrait d'une source. À confirmer.`, ref: label });
    }
    if (amb.has(a.role)) {
      out.push({ code: "actor_ambiguous", message: `Intervenant ambigu : « ${a.value} » rattaché à plusieurs rôles.`, ref: label });
    }
  }
  return out;
}
