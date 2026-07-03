"use client";

/**
 * Cache mémoire (par session SPA) de la fiche entreprise et de la
 * bibliothèque de prix. Évite de refaire un aller-retour réseau à chaque
 * navigation entre agents → navigation nettement plus fluide.
 */
type Company = Record<string, unknown> | null;
type PriceItem = Record<string, unknown>;

let companyCache: Company | undefined;
let companyPromise: Promise<Company> | null = null;

export async function getCompany(force = false): Promise<Company> {
  if (!force && companyCache !== undefined) return companyCache;
  if (!companyPromise) {
    companyPromise = fetch("/api/company")
      .then((r) => (r.ok ? r.json() : { company: null }))
      .then((d) => { companyCache = (d.company ?? null) as Company; return companyCache; })
      .catch(() => { companyCache = null; return null; })
      .finally(() => { companyPromise = null; });
  }
  return companyPromise;
}

/** Met à jour le cache après enregistrement des paramètres. */
export function setCompanyCache(c: Company) { companyCache = c; }

let pricesCache: PriceItem[] | undefined;
let pricesPromise: Promise<PriceItem[]> | null = null;

export async function getPrices(force = false): Promise<PriceItem[]> {
  if (!force && pricesCache !== undefined) return pricesCache;
  if (!pricesPromise) {
    pricesPromise = fetch("/api/prices")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => { pricesCache = (d.items ?? []) as PriceItem[]; return pricesCache; })
      .catch(() => { pricesCache = []; return []; })
      .finally(() => { pricesPromise = null; });
  }
  return pricesPromise;
}

/** À appeler quand la bibliothèque de prix change. */
export function invalidatePrices() { pricesCache = undefined; }

/**
 * Journalise un export dans l'historique (fail-safe : ne bloque jamais
 * le téléchargement si l'appel échoue).
 */
export function recordExportClient(params: {
  docType: string;
  format: "PDF" | "DOCX" | "XLSX";
  filename: string;
  docId?: string | null;
  projectId?: string | null;
}): void {
  fetch("/api/exports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).catch(() => {});
}

/** Références réglementaires configurées, formatées pour le prompt CCTP. */
export async function getConfiguredRefs(jurisdiction: string, lots: string[]): Promise<string> {
  try {
    const all: { jurisdiction: string; lot?: string | null; code: string; title: string; version?: string | null }[] = [];
    const juris = jurisdiction === "Mixte" ? ["France", "Maroc"] : [jurisdiction];
    for (const j of juris) {
      const r = await fetch(`/api/references?jurisdiction=${encodeURIComponent(j)}`);
      if (r.ok) {
        const d = await r.json();
        all.push(...(d.references ?? []));
      }
    }
    const relevant = all.filter((r) => !r.lot || lots.some((l) => l.toLowerCase().includes((r.lot ?? "").toLowerCase()) || (r.lot ?? "").toLowerCase().includes(l.toLowerCase())));
    if (relevant.length === 0) return "";
    return relevant
      .map((r) => `- [${r.jurisdiction}${r.lot ? ` · ${r.lot}` : ""}] ${r.code} — ${r.title}${r.version ? ` (${r.version})` : ""}`)
      .join("\n");
  } catch {
    return "";
  }
}
