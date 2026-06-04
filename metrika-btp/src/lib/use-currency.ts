"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Currency = "MAD" | "EUR";

interface CurrencyState {
  currency: Currency;
  setCurrency: (c: Currency) => void;
}

/**
 * Devise globale de l'application (MAD ⇄ EUR), persistée localement.
 * Source de vérité unique pour l'affichage ET l'export des documents :
 * le switch de la topbar la pilote, et chaque agent l'utilise.
 */
export const useCurrency = create<CurrencyState>()(
  persist(
    (set) => ({
      currency: "MAD",
      setCurrency: (currency) => set({ currency }),
    }),
    { name: "metrika-currency" },
  ),
);
