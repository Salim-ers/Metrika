"use client";

import { useEffect, useState } from "react";
import { useCurrency, type Currency } from "@/lib/use-currency";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Currency; label: string }[] = [
  { value: "MAD", label: "MAD" },
  { value: "EUR", label: "€" },
];

/**
 * Switch de devise global (MAD / €). Affiché dans la topbar, il pilote
 * l'affichage et l'export de tous les documents. Évite le flash
 * d'hydratation en n'affichant la sélection qu'après montage client.
 */
export function CurrencyToggle() {
  const { currency, setCurrency, rate, setRate } = useCurrency();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex items-center gap-2">
      <div
        role="group"
        aria-label="Devise"
        className="flex items-center rounded-full border border-border bg-card p-0.5"
      >
        {OPTIONS.map((o) => {
          const active = mounted && currency === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setCurrency(o.value)}
              aria-pressed={active}
              className={cn(
                "min-w-[40px] rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                active
                  ? "bg-gold-500 text-navy-900 shadow-gold"
                  : "text-muted-foreground hover:text-navy-800",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {/* Taux de change modifiable : MAD pour 1 €. Sert à convertir au switch. */}
      <label
        title="Taux de change : nombre de dirhams pour 1 euro"
        className="hidden items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground sm:flex"
      >
        1€=
        <input
          type="number"
          step="0.1"
          min="0.1"
          value={mounted ? rate : 10.8}
          onChange={(e) => setRate(+e.target.value)}
          className="w-12 bg-transparent text-right font-semibold text-navy-800 outline-none"
        />
        <span>MAD</span>
      </label>
    </div>
  );
}
