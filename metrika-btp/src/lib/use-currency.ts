"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Currency = "MAD" | "EUR";

interface CurrencyState {
  currency: Currency;
  /** Taux de change : nombre de MAD pour 1 EUR. */
  rate: number;
  setCurrency: (c: Currency) => void;
  setRate: (r: number) => void;
}

/**
 * Devise globale de l'application (MAD ⇄ EUR), persistée localement.
 * Source de vérité unique pour l'affichage ET l'export des documents :
 * le switch de la topbar la pilote, et chaque agent l'utilise.
 * `rate` = MAD pour 1 EUR (modifiable), utilisé pour convertir les montants
 * lors du changement de devise.
 */
export const useCurrency = create<CurrencyState>()(
  persist(
    (set) => ({
      currency: "MAD",
      rate: 10.8,
      setCurrency: (currency) => set({ currency }),
      setRate: (rate) => set({ rate: rate > 0 ? rate : 1 }),
    }),
    { name: "metrika-currency" },
  ),
);

/** Convertit un montant d'une devise vers une autre (rate = MAD pour 1 EUR). */
export function convertAmount(amount: number, from: Currency, to: Currency, rate: number): number {
  if (from === to || !amount) return amount;
  const r = rate > 0 ? rate : 1;
  // On passe par le MAD comme pivot.
  const inMad = from === "EUR" ? amount * r : amount;
  const out = to === "EUR" ? inMad / r : inMad;
  return Math.round(out * 100) / 100;
}
