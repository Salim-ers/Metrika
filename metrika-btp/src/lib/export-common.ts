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

export function fmtMad(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  ].filter(Boolean);
  const bank = [
    c.bankName && `Banque : ${c.bankName}`, c.rib && `RIB : ${c.rib}`,
    c.iban && `IBAN : ${c.iban}`, c.swift && `SWIFT : ${c.swift}`,
  ].filter(Boolean);
  const contact = [c.address, c.city, c.phone, c.email, c.website].filter(Boolean);
  const out: string[] = [];
  if (contact.length) out.push(contact.join(" · "));
  if (ids.length) out.push(ids.join(" · "));
  if (bank.length) out.push(bank.join(" · "));
  return out as string[];
}
