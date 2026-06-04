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
