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
  const { currency, setCurrency } = useCurrency();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
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
  );
}
