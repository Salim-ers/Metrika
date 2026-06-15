/**
 * SOCLE DE FIABILITÉ COMMUN — Metrika BTP.
 *
 * Module partagé par TOUS les agents (CCTP, DPGF, audit, comparaison, métré).
 * Il centralise :
 *  - les modes de génération (fidèle marché / enrichi Metrika),
 *  - la hiérarchie des sources,
 *  - les statuts de donnée + traçabilité,
 *  - les tags de paragraphe (CCTP),
 *  - les validateurs purs qui alimentent les tests automatiques.
 *
 * PRINCIPE DIRECTEUR : FIABILITÉ > COMPLÉTUDE.
 * Mieux vaut une donnée manquante marquée « À métrer / À confirmer » qu'une
 * valeur inventée présentée comme certaine. Les garde-fous ci-dessous sont
 * appliqués CÔTÉ CODE, en plus des consignes de prompt (défense en profondeur).
 */

// ────────────────────────────────────────────────────────────────────────
// 1. MODES DE GÉNÉRATION
// ────────────────────────────────────────────────────────────────────────

/**
 * - "fidele"  : reprend strictement les pièces fournies, conserve la structure
 *   officielle, n'ajoute aucune prescription/quantité/norme absente. MODE PAR DÉFAUT.
 * - "enrichi" : autorise des compléments professionnels Metrika, mais chacun
 *   DOIT être marqué [COMPLÉMENT METRIKA — NON CONTRACTUEL — À VALIDER] et n'est
 *   jamais mélangé aux données contractuelles.
 */
export type GenerationMode = "fidele" | "enrichi";

export const GENERATION_MODES: Record<GenerationMode, { label: string; short: string; description: string }> = {
  fidele: {
    label: "Fidèle marché",
    short: "Fidèle",
    description:
      "Reprend strictement les pièces fournies. Aucune prescription, quantité, unité ou norme ajoutée. Données absentes marquées « À confirmer / À métrer ». Mode par défaut.",
  },
  enrichi: {
    label: "Enrichi Metrika",
    short: "Enrichi",
    description:
      "Ajoute des compléments professionnels utiles, chacun marqué [COMPLÉMENT METRIKA — NON CONTRACTUEL — À VALIDER] et séparé des données contractuelles.",
  },
};

export const COMPLEMENT_TAG = "[COMPLÉMENT METRIKA — NON CONTRACTUEL — À VALIDER BET/MOE]";

// ────────────────────────────────────────────────────────────────────────
// 2. HIÉRARCHIE DES SOURCES (1 = plus fort, 5 = plus faible)
// ────────────────────────────────────────────────────────────────────────

export interface SourceTier {
  level: 1 | 2 | 3 | 4 | 5;
  key: string;
  label: string;
}

export const SOURCE_HIERARCHY: SourceTier[] = [
  { level: 1, key: "cdpgf", label: "CDPGF / DPGF officiel fourni" },
  { level: 2, key: "cctp", label: "CCTP officiel" },
  { level: 3, key: "plan", label: "Plans architecte / structure / VRD, coupes, façades" },
  { level: 4, key: "rapport", label: "Rapport géotechnique, notices, pièces annexes" },
  { level: 5, key: "metier", label: "Règles métier générales (non contractuel)" },
];

/** Synonymes de tokens de source → niveau de hiérarchie. */
const SOURCE_LEVEL_MAP: Record<string, SourceTier["level"]> = {
  cdpgf: 1, dpgf: 1, bordereau: 1,
  cctp: 2, cctg: 2, descriptif: 2,
  plan: 3, plans: 3, archi: 3, structure: 3, vrd: 3, coupe: 3, facade: 3, "façade": 3, dwg: 3, metre: 3, "métré": 3, metré: 3,
  rapport: 4, geotech: 4, "géotech": 4, g2: 4, notice: 4, annexe: 4,
  metier: 5, "métier": 5, regle: 5, "règle": 5, estimation: 5,
};

/** Niveau de hiérarchie d'une source (1 fort … 5 faible) ; 99 si inconnue. */
export function sourceLevel(name?: string): number {
  if (!name) return 99;
  const k = name.trim().toLowerCase();
  if (k in SOURCE_LEVEL_MAP) return SOURCE_LEVEL_MAP[k];
  for (const token of Object.keys(SOURCE_LEVEL_MAP)) {
    if (k.includes(token)) return SOURCE_LEVEL_MAP[token];
  }
  return 99;
}

/** La source justifie-t-elle une donnée CONTRACTUELLE (niveaux 1 à 4) ? */
export function isContractualSource(name?: string): boolean {
  const lvl = sourceLevel(name);
  return lvl >= 1 && lvl <= 4;
}

// ────────────────────────────────────────────────────────────────────────
// 3. STATUTS DE DONNÉE + CONFIANCE
// ────────────────────────────────────────────────────────────────────────

export type DataStatus =
  | "confirmed"        // directement présent dans une source fiable
  | "calculated"       // calculé à partir de cotes sources fiables (formule obligatoire)
  | "inferred"         // déduit mais non confirmé
  | "to_measure"       // quantité à métrer
  | "missing"          // donnée absente
  | "conflict"         // contradiction entre sources
  | "non_contractual"  // complément Metrika / règle métier
  | "low_confidence";  // détecté mais peu fiable (ex. OCR douteux)

export type Confidence = "high" | "medium" | "low";

export type TraceType =
  | "project_identity" | "work_item" | "quantity" | "unit" | "prescription"
  | "norm" | "actor" | "date" | "dimension" | "assumption";

export const STATUS_META: Record<DataStatus, { label: string; variant: "success" | "warning" | "muted" | "gold" | "default"; contractual: boolean }> = {
  confirmed:       { label: "Confirmé",                 variant: "success", contractual: true },
  calculated:      { label: "Calculé",                  variant: "success", contractual: true },
  inferred:        { label: "Déduit (non contractuel)", variant: "gold",    contractual: false },
  to_measure:      { label: "À métrer",                 variant: "warning", contractual: false },
  missing:         { label: "Manquant",                 variant: "muted",   contractual: false },
  conflict:        { label: "À arbitrer",               variant: "default", contractual: false },
  non_contractual: { label: "Complément Metrika",       variant: "gold",    contractual: false },
  low_confidence:  { label: "Peu fiable",               variant: "warning", contractual: false },
};

export const ALL_STATUSES = Object.keys(STATUS_META) as DataStatus[];

export function isValidStatus(s: unknown): s is DataStatus {
  return typeof s === "string" && (s as DataStatus) in STATUS_META;
}

/**
 * Bloc de traçabilité obligatoire d'une donnée importante. Toute donnée
 * exposée comme « certaine » doit porter ce bloc (source + statut + confiance).
 */
export interface TraceItem {
  id: string;
  type: TraceType;
  value: string;
  source_file?: string;
  source_page?: string;
  source_plan_number?: string;
  source_section?: string;
  source_excerpt?: string;
  source_coordinates_or_zone?: string;
  confidence: Confidence;
  status: DataStatus;
  calculation?: string;
  notes?: string;
}

// ────────────────────────────────────────────────────────────────────────
// 4. TAGS DE PARAGRAPHE (CCTP)
// ────────────────────────────────────────────────────────────────────────

export const CCTP_TAGS = [
  "[SOURCE CCTP]", "[SOURCE PLAN]", "[SOURCE CDPGF]", "[SOURCE RAPPORT]",
  "[CALCULÉ]", "[À CONFIRMER]", "[COMPLÉMENT METRIKA]", "[NON CONTRACTUEL]",
] as const;
export type CctpTag = (typeof CCTP_TAGS)[number];

const CCTP_TAG_RE = /\[(SOURCE CCTP|SOURCE PLAN|SOURCE CDPGF|SOURCE RAPPORT|CALCULÉ|À CONFIRMER|COMPLÉMENT METRIKA|NON CONTRACTUEL)\]/u;
export function hasCctpTag(line: string): boolean {
  return CCTP_TAG_RE.test(line);
}

// ────────────────────────────────────────────────────────────────────────
// 5. RÔLES D'INTERVENANTS (ne jamais confondre archi / MOE / BET / OPC / CT)
// ────────────────────────────────────────────────────────────────────────

export type ActorRole = "MOA" | "MOE" | "ARCHITECTE" | "BET_STRUCTURE" | "BET_FLUIDES" | "OPC" | "CONTROLE";

export const ACTOR_ROLES: Record<ActorRole, { label: string; aliases: string[] }> = {
  MOA:           { label: "Maître d'ouvrage",          aliases: ["maitre d'ouvrage", "maître d'ouvrage", "moa", "maitre d ouvrage"] },
  MOE:           { label: "Maître d'œuvre",            aliases: ["maitre d'oeuvre", "maître d'œuvre", "moe", "maitrise d'oeuvre"] },
  ARCHITECTE:    { label: "Architecte",                aliases: ["architecte", "cabinet d'architecture", "agence d'architecture"] },
  BET_STRUCTURE: { label: "BET structure",             aliases: ["bet structure", "bureau d'etudes structure", "bureau d'études structure", "bet béton"] },
  BET_FLUIDES:   { label: "BET fluides",               aliases: ["bet fluides", "bureau d'etudes fluides", "bet cvc", "bet electricite"] },
  OPC:           { label: "OPC",                       aliases: ["opc", "ordonnancement pilotage coordination", "pilote"] },
  CONTROLE:      { label: "Bureau de contrôle",        aliases: ["bureau de controle", "bureau de contrôle", "controleur technique", "contrôleur technique", "bureau de contrôle technique"] },
};

/** Détecte le rôle évoqué par un libellé, ou null si ambigu/inconnu. */
export function detectActorRole(label: string): ActorRole | null {
  const k = label.toLowerCase();
  // On teste du plus spécifique au plus générique pour éviter les collisions.
  const order: ActorRole[] = ["BET_STRUCTURE", "BET_FLUIDES", "CONTROLE", "OPC", "ARCHITECTE", "MOE", "MOA"];
  for (const role of order) {
    if (ACTOR_ROLES[role].aliases.some((a) => k.includes(a))) return role;
  }
  return null;
}

/** Ordre de référence des intervenants dans la table unique du projet. */
export const ACTOR_ORDER: ActorRole[] = ["MOA", "MOE", "ARCHITECTE", "BET_STRUCTURE", "BET_FLUIDES", "OPC", "CONTROLE"];

/**
 * Rôles qui peuvent LÉGITIMEMENT être tenus par le même intervenant (donc même
 * valeur sans ambiguïté). Cas classique : l'architecte est aussi le maître
 * d'œuvre. Partager une valeur HORS de ces groupes = ambiguïté à lever.
 */
export const COMPATIBLE_ROLE_GROUPS: ActorRole[][] = [["MOE", "ARCHITECTE"]];

function rolesAreCompatible(roles: ActorRole[]): boolean {
  return COMPATIBLE_ROLE_GROUPS.some((g) => roles.every((r) => g.includes(r)));
}

/**
 * Une ligne de la TABLE UNIQUE des intervenants (rôle figé + traçabilité).
 * Le rôle est EXTRAIT, jamais réinterprété ailleurs dans le document.
 */
export interface ActorEntry {
  role: ActorRole;
  value: string;            // nom réel, ou NOT_FOUND_LABELS.identity si absent
  source_file?: string;
  source_page?: string;
  confidence: Confidence;
  status: DataStatus;       // confirmed (extrait) | inferred (déduit, interdit en final) | missing
  notes?: string;
}

/**
 * Normalise la table des intervenants : garantit qu'EXACTEMENT les 7 rôles de
 * référence sont présents, une seule fois chacun, dans l'ordre canonique. Un
 * rôle absent est marqué « Non renseigné dans les pièces fournies » (missing).
 */
export function normalizeActorTable(entries: Partial<ActorEntry>[]): ActorEntry[] {
  const byRole = new Map<ActorRole, Partial<ActorEntry>>();
  for (const e of entries) {
    if (!e?.role || !(e.role in ACTOR_ROLES)) continue;
    if (!byRole.has(e.role)) byRole.set(e.role, e);
  }
  return ACTOR_ORDER.map((role) => {
    const e = byRole.get(role);
    const value = e?.value?.trim();
    if (!value || value.toLowerCase() === "non renseigné" || hasPlaceholder(value)) {
      return { role, value: NOT_FOUND_LABELS.identity, confidence: "low", status: "missing" };
    }
    const status: DataStatus = isValidStatus(e?.status) ? (e!.status as DataStatus) : "confirmed";
    return {
      role,
      value,
      source_file: e?.source_file,
      source_page: e?.source_page,
      confidence: (["high", "medium", "low"] as const).includes(e?.confidence as Confidence) ? (e!.confidence as Confidence) : "medium",
      status,
      notes: e?.notes,
    };
  });
}

/**
 * Une même valeur partagée par ≥ 2 rôles INCOMPATIBLES = ambiguïté. Les
 * recouvrements légitimes (ex. MOE = Architecte) ne sont PAS signalés.
 */
export function ambiguousActors(table: ActorEntry[]): ActorRole[] {
  const seen = new Map<string, ActorRole[]>();
  for (const a of table) {
    if (a.status === "missing") continue;
    const key = a.value.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key) continue;
    seen.set(key, [...(seen.get(key) ?? []), a.role]);
  }
  const dup = new Set<ActorRole>();
  for (const roles of seen.values()) {
    if (roles.length > 1 && !rolesAreCompatible(roles)) roles.forEach((r) => dup.add(r));
  }
  return [...dup];
}

/**
 * Tag plan DÉTAILLÉ (R3) — aucune donnée plan utilisable sans localisation :
 * [SOURCE PLAN — fichier — page — nom — cote/annotation — confiance].
 */
export function planTag(p: { file?: string; page?: string | number; name?: string; reading?: string; confidence?: string }): string {
  const parts = [
    "SOURCE PLAN",
    p.file?.trim() || "fichier ?",
    p.page != null && String(p.page).trim() ? `p.${p.page}` : "page ?",
    p.name?.trim() || "plan/coupe/façade ?",
    p.reading?.trim() || "cote/annotation ?",
    p.confidence?.trim() || "confiance ?",
  ];
  return `[${parts.join(" — ")}]`;
}

// ────────────────────────────────────────────────────────────────────────
// 6. VALIDATEURS PURS (alimentent les tests automatiques §12 du cahier)
// ────────────────────────────────────────────────────────────────────────

/** Normalise une unité pour comparaison (insensible casse/espaces/synonymes). */
export function normalizeUnit(u?: string): string {
  if (!u) return "";
  const k = u.trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
  const synonyms: Record<string, string> = {
    "m2": "m²", "m^2": "m²", "m²": "m²",
    "m3": "m³", "m^3": "m³", "m³": "m³",
    "ml": "ml", "mlin": "ml", "mètrelinéaire": "ml", "metrelineaire": "ml",
    "u": "u", "unité": "u", "unite": "u", "pièce": "u", "piece": "u", "p": "u",
    "ens": "ens", "ensemble": "ens",
    "kg": "kg", "t": "t", "tonne": "t",
    "ff": "forfait", "forfait": "forfait", "fft": "forfait",
  };
  return synonyms[k] ?? k;
}

/** Test §4 : changement d'unité non justifié (ex. ml → m², m² → m³). */
export function unitChanged(a?: string, b?: string): boolean {
  const na = normalizeUnit(a), nb = normalizeUnit(b);
  if (!na || !nb) return false;
  return na !== nb;
}

export interface QtyLike { quantity?: number; quantitySource?: string; status?: string; calculation?: string }

/**
 * Test §1 : toute quantité > 0 doit avoir une source contractuelle OU une
 * formule. Sinon la ligne DOIT être en statut to_measure. Renvoie true si la
 * ligne est CONFORME à cette règle.
 */
export function quantityHasJustification(line: QtyLike): boolean {
  const q = Number(line.quantity) || 0;
  if (q <= 0) return line.status === "to_measure" || line.status === "missing" || q === 0;
  const sourced = isContractualSource(line.quantitySource);
  const hasFormula = !!line.calculation && line.calculation.trim().length > 0;
  return sourced || hasFormula;
}

export interface PriceLike { unitPrice?: number; priceSource?: string; explicitZero?: boolean }

/**
 * Test §2 : un prix unitaire à 0 n'est légitime QUE si la source l'indique
 * explicitement. Renvoie true si le prix 0 est INVENTÉ (interdit).
 */
export function priceZeroInvented(line: PriceLike): boolean {
  const p = Number(line.unitPrice);
  if (p !== 0) return false;
  return !line.explicitZero; // 0 non confirmé par la source = interdit
}

/** Test §3 : devise = celle du DPGF officiel, sinon « À confirmer ». */
export function resolveCurrency(officialCurrency?: string | null): string {
  const c = officialCurrency?.trim();
  return c && c.length > 0 ? c : "À confirmer";
}

/**
 * Test §5 / §14 : placeholders interdits dans le CORPS contractuel
 * (TEST, exemple, lorem, à compléter, xxx, placeholder, nom générique…).
 */
// Bornes Unicode (\b ASCII ne fonctionne pas avant « à »). Le séparateur
// non-lettre évite les faux positifs (« test » dans « contestation »).
const PLACEHOLDER_RE = /(?:^|[^\p{L}])(test|exemple|example|lorem ipsum|placeholder|à compléter|a completer|à remplir|a remplir|tbd|dummy|sample|nom du client|votre société|votre societe|xxx+)(?:[^\p{L}]|$)/iu;
export function hasPlaceholder(text?: string): boolean {
  return !!text && PLACEHOLDER_RE.test(text);
}

/** Valeurs acceptables quand une donnée d'identité est absente. */
export const NOT_FOUND_LABELS = {
  identity: "Non renseigné dans les pièces fournies",
  quantity: "À métrer",
  price: "À renseigner",
  unit: "Unité à confirmer",
  prescription: "Non trouvé dans les pièces fournies",
  plans: "Plans insuffisants pour métré fiable",
  scale: "Échelle non fiable — métré à confirmer",
  cote: "Cote illisible — à confirmer",
} as const;

/**
 * Test §10 : interdiction de métrer depuis une image si l'échelle est absente,
 * illisible ou incohérente. Renvoie true si l'échelle est FIABLE pour métré.
 */
export function scaleReliable(scale?: string | null): boolean {
  if (!scale) return false;
  const k = scale.trim().toLowerCase();
  if (!k || /(non|illisible|absente|inconnue|incohérente|incoherente|\?)/.test(k)) return false;
  // Échelle plausible : 1/50, 1:100, 1/2000…
  return /1\s*[/:]\s*\d{1,5}/.test(k);
}

/** Test §13 : ouvrages CCTP sans ligne DPGF correspondante (omissions). */
export function findOmissions(cctpItems: string[], dpgfDesignations: string[]): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-zà-ÿ0-9]+/gi, " ").trim();
  const dpgf = dpgfDesignations.map(norm).filter(Boolean);
  const tokensOf = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 3));
  const covered = (item: string) => {
    const it = tokensOf(item);
    if (it.size === 0) return true;
    return dpgf.some((d) => {
      const dt = new Set(d.split(" ").filter((w) => w.length > 3));
      let common = 0;
      for (const w of it) if (dt.has(w)) common++;
      return common >= Math.max(1, Math.ceil(it.size * 0.5));
    });
  };
  return cctpItems.filter((c) => c.trim() && !covered(c));
}

export interface StructureLine { code?: string; designation: string }

/**
 * Test §6 : quand un CDPGF officiel est fourni, le DPGF produit doit en
 * respecter la structure. Renvoie les lignes officielles SANS correspondance
 * (manquantes) et les lignes produites EN TROP (hors cadre).
 */
export function cdpgfStructureDiff(official: StructureLine[], produced: StructureLine[]): { missing: StructureLine[]; extra: StructureLine[] } {
  const norm = (l: StructureLine) => `${(l.code ?? "").toLowerCase().trim()}|${l.designation.toLowerCase().replace(/\s+/g, " ").trim()}`;
  const officialKeys = new Set(official.map(norm));
  const producedKeys = new Set(produced.map(norm));
  return {
    missing: official.filter((l) => !producedKeys.has(norm(l))),
    extra: produced.filter((l) => !officialKeys.has(norm(l))),
  };
}

/** Numéros de chapitre (1, 1.2, 3.4.1…) présents dans un texte. */
export function extractNumbering(text: string): string[] {
  const found = text.match(/(?:^|\s)(\d{1,2}(?:\.\d{1,2}){0,3})(?=[\s).:])/g) || [];
  return Array.from(new Set(found.map((s) => s.trim())));
}

/**
 * Test §7 : en mode fidèle, la numérotation du CCTP source doit être conservée.
 * Renvoie les numéros présents dans la source mais ABSENTS du document produit.
 */
export function numberingDropped(sourceText: string, producedText: string): string[] {
  const src = extractNumbering(sourceText);
  const produced = new Set(extractNumbering(producedText));
  return src.filter((n) => !produced.has(n));
}

/** Test §12 : doublons (même désignation normalisée dans le même lot). */
export function duplicateDesignations(lines: { lot?: string; designation: string }[]): number[] {
  const seen = new Map<string, number>();
  const dups: number[] = [];
  lines.forEach((l, i) => {
    const d = (l.designation ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!d) return;
    const key = `${(l.lot ?? "").toLowerCase().trim()}|${d}`;
    if (seen.has(key)) dups.push(i);
    else seen.set(key, i);
  });
  return dups;
}

/** Test §9 : deux valeurs de sources différentes pour une même grandeur. */
export function detectConflict(values: { value: string; source?: string }[]): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const distinct = new Set(values.map((v) => norm(v.value)).filter(Boolean));
  return distinct.size > 1;
}

/**
 * Test §8 : un ajout (norme/prescription/exigence) hors source doit être tagué
 * [COMPLÉMENT METRIKA]. Renvoie true si l'ajout est CONFORME (tagué) ou sourcé.
 */
export function additionProperlyTagged(line: string, sourced: boolean): boolean {
  if (sourced) return true;
  return /\[COMPL[ÉE]MENT METRIKA/i.test(line) || /\[NON CONTRACTUEL\]/i.test(line);
}

/**
 * Test §11 : marque OCR douteux en low_confidence. Heuristique : forte densité
 * de caractères de remplacement / symboles improbables dans du texte FR.
 */
export function ocrLooksUnreliable(text: string): boolean {
  if (!text) return false;
  const suspicious = (text.match(/[�¤¬|°·…]{1,}|[A-Za-zÀ-ÿ]\d[A-Za-zÀ-ÿ]/g) || []).length;
  const letters = (text.match(/[A-Za-zÀ-ÿ]/g) || []).length || 1;
  return suspicious / letters > 0.06;
}

// ────────────────────────────────────────────────────────────────────────
// 7. BILAN DE FIABILITÉ (pour affichage + tests d'intégration)
// ────────────────────────────────────────────────────────────────────────

export interface FidelityScore {
  /** Score de traçabilité 0-100 : part de lignes avec source/statut explicite. */
  traceability: number;
  /** Part de lignes contractuelles (confirmed/calculated). */
  contractual: number;
  /** Au moins une alerte (conflict/doublon/placeholder) ? */
  hasAlerts: boolean;
}

export function fidelityScore(lines: { status?: string; quantitySource?: string; designation?: string; lot?: string }[]): FidelityScore {
  const total = lines.length || 1;
  const traced = lines.filter((l) => isValidStatus(l.status) || isContractualSource(l.quantitySource)).length;
  const contractual = lines.filter((l) => l.status === "confirmed" || l.status === "calculated").length;
  const dups = duplicateDesignations(lines.map((l) => ({ lot: l.lot, designation: l.designation ?? "" })));
  const conflicts = lines.filter((l) => l.status === "conflict").length;
  return {
    traceability: Math.round((traced / total) * 100),
    contractual: Math.round((contractual / total) * 100),
    hasAlerts: dups.length > 0 || conflicts > 0,
  };
}
