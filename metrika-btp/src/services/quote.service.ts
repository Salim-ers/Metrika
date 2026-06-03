import type { QuoteLineInput } from "@/types";

/** Totaux HT / TVA / TTC d'un devis. */
export function computeQuoteTotals(lines: QuoteLineInput[], vatRate: number) {
  const totalHT = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const totalVAT = totalHT * (vatRate / 100);
  return {
    totalHT: round(totalHT),
    totalVAT: round(totalVAT),
    totalTTC: round(totalHT + totalVAT),
  };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
