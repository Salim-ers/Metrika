"use client";

export interface CompanyExport {
  name?: string;
  legalForm?: string;
  logoUrl?: string | null;
  stampUrl?: string | null;
  ice?: string | null;
  rc?: string | null;
  ifNumber?: string | null;
  cnss?: string | null;
  patente?: string | null;
  capital?: string | null;
  country?: string | null;
  currency?: string | null;
  siret?: string | null;
  vatNumber?: string | null;
  ape?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  bankName?: string | null;
  rib?: string | null;
  iban?: string | null;
  swift?: string | null;
  paymentTerms?: string | null;
  vatRate?: number;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// Caractères typographiques hors Latin-1 mais supportés par WinAnsi (pdf-lib).
const WINANSI_EXTRA = new Set([
  0x20ac, 0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x2022, 0x2026,
  0x2122, 0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0192,
]);
const SPACE_LIKE = new Set([0x202f, 0x2009, 0x00a0, 0x2007, 0x2060, 0x200b, 0x3000, 0x2002, 0x2003]);

/**
 * Rend une chaîne encodable par la police WinAnsi de pdf-lib. Le format fr-FR
 * insère une espace fine insécable (U+202F) comme séparateur de milliers, que
 * pdf-lib ne sait pas encoder → sans ce nettoyage, l'export PDF plante.
 */
export function winAnsiSafe(s: string): string {
  if (!s) return "";
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (SPACE_LIKE.has(code)) { out += " "; continue; }
    if (code === 0x2011) { out += "-"; continue; } // tiret insécable
    if (code >= 0x20 && code <= 0xff) { out += ch; continue; } // Latin-1
    if (WINANSI_EXTRA.has(code)) { out += ch; continue; }
    // Caractère non encodable : on le neutralise plutôt que de planter.
  }
  return out;
}

export function fmtMad(n: number): string {
  return winAnsiSafe(n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

/** Suffixe monétaire selon la devise de l'entreprise (EUR → €, sinon MAD). */
export function moneyUnit(c?: CompanyExport | null): string {
  return (c?.currency ?? "MAD") === "EUR" ? "€" : "MAD";
}

/** Décode une data URL en octets + type MIME. */
export function dataUrlToBytes(dataUrl?: string | null): { bytes: Uint8Array; mime: string } | null {
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return null;
  const mime = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

/** Récupère la fiche entreprise (logo, mentions légales…) depuis l'API. */
export async function fetchCompany(): Promise<CompanyExport | null> {
  try {
    const r = await fetch("/api/company");
    if (!r.ok) return null;
    const d = await r.json();
    return d.company ?? null;
  } catch {
    return null;
  }
}

/** Lignes de mentions légales pour pied de document. */
export function legalLines(c?: CompanyExport | null): string[] {
  if (!c) return [];
  const ids = [
    c.ice && `ICE : ${c.ice}`, c.rc && `RC : ${c.rc}`, c.ifNumber && `IF : ${c.ifNumber}`,
    c.cnss && `CNSS : ${c.cnss}`, c.patente && `Patente : ${c.patente}`,
    c.siret && `SIRET : ${c.siret}`, c.vatNumber && `TVA : ${c.vatNumber}`, c.ape && `APE : ${c.ape}`,
  ].filter(Boolean);
  const bank = [
    c.bankName && `Banque : ${c.bankName}`, c.rib && `RIB : ${c.rib}`,
    c.iban && `IBAN : ${c.iban}`, c.swift && `SWIFT : ${c.swift}`,
  ].filter(Boolean);
  const contact = [c.address, c.city, c.phone, c.email, c.website].filter(Boolean);
  const out: string[] = [];
  if (contact.length) out.push(contact.join(" - "));
  if (ids.length) out.push(ids.join(" - "));
  if (bank.length) out.push(bank.join(" - "));
  return out;
}
