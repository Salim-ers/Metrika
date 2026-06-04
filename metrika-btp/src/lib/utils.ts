import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formate un montant en dirhams marocains. */
export function formatMAD(value: number): string {
  return new Intl.NumberFormat("fr-MA", {
    style: "currency",
    currency: "MAD",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

/** Formate un montant dans la devise choisie (MAD ou EUR). */
export function formatMoney(value: number, currency: string = "MAD"): string {
  const cur = currency === "EUR" ? "EUR" : "MAD";
  return new Intl.NumberFormat(cur === "EUR" ? "fr-FR" : "fr-MA", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function formatDate(d: Date | string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(d));
}

/** Numéro de devis incrémental : DEV-2026-0001 */
export function buildQuoteNumber(prefix: string, counter: number): string {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(counter).padStart(4, "0")}`;
}
