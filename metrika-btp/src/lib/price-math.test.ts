import { describe, it, expect } from "vitest";
import {
  computeDpgfTotals, computeSousDetail, quantityKnown, priceKnown, MISSING_LABELS,
} from "./price-math";

describe("quantityKnown / priceKnown (doctrine « à renseigner »)", () => {
  it("quantité > 0 = connue", () => {
    expect(quantityKnown({ quantity: 12.5 })).toBe(true);
  });
  it("quantité 0 sans statut = À métrer (inconnue)", () => {
    expect(quantityKnown({ quantity: 0 })).toBe(false);
    expect(quantityKnown({ quantity: 0, status: "to_measure" })).toBe(false);
  });
  it("quantité 0 confirmée par une source = connue (vrai zéro)", () => {
    expect(quantityKnown({ quantity: 0, status: "confirmed" })).toBe(true);
    expect(quantityKnown({ quantity: 0, status: "calculated" })).toBe(true);
  });
  it("prix 0 sans provenance = Prix à renseigner (inconnu)", () => {
    expect(priceKnown({ unitPrice: 0 })).toBe(false);
    expect(priceKnown({ unitPrice: 0, priceSource: null })).toBe(false);
  });
  it("prix 0 avec provenance explicite = connu (zéro assumé)", () => {
    expect(priceKnown({ unitPrice: 0, priceSource: "cdpgf" })).toBe(true);
  });
  it("prix > 0 = connu", () => {
    expect(priceKnown({ unitPrice: 45.5, priceSource: "manuel" })).toBe(true);
  });
});

describe("computeDpgfTotals (HT / TVA / TTC + sous-totaux par lot)", () => {
  const lines = [
    { lot: "Gros Œuvre", quantity: 10, unitPrice: 100, priceSource: "manuel" },       // 1000
    { lot: "Gros Œuvre", quantity: 2, unitPrice: 250, priceSource: "bibliotheque" },  // 500
    { lot: "Peinture", quantity: 50, unitPrice: 35, priceSource: "manuel" },          // 1750
  ];

  it("totaux exacts HT / TVA / TTC (TVA 20 %)", () => {
    const t = computeDpgfTotals(lines, 20);
    expect(t.totalHT).toBe(3250);
    expect(t.totalVAT).toBe(650);
    expect(t.totalTTC).toBe(3900);
    expect(t.complete).toBe(true);
  });

  it("sous-totaux par lot dans l'ordre d'apparition", () => {
    const t = computeDpgfTotals(lines, 20);
    expect(t.byLot).toEqual([
      { lot: "Gros Œuvre", totalHT: 1500, lines: 2 },
      { lot: "Peinture", totalHT: 1750, lines: 1 },
    ]);
  });

  it("TVA à taux différent (10 %)", () => {
    const t = computeDpgfTotals(lines, 10);
    expect(t.totalVAT).toBe(325);
    expect(t.totalTTC).toBe(3575);
  });

  it("une quantité manquante N'entre PAS dans le total (jamais de faux 0)", () => {
    const t = computeDpgfTotals([
      ...lines,
      { lot: "Peinture", quantity: 0, unitPrice: 99, priceSource: "manuel", status: "to_measure" },
    ], 20);
    expect(t.totalHT).toBe(3250);         // inchangé
    expect(t.missingQuantities).toBe(1);
    expect(t.complete).toBe(false);
  });

  it("un prix manquant est compté et exclu du total", () => {
    const t = computeDpgfTotals([
      ...lines,
      { lot: "Gros Œuvre", quantity: 5, unitPrice: 0 },
    ], 20);
    expect(t.totalHT).toBe(3250);
    expect(t.missingPrices).toBe(1);
    expect(t.complete).toBe(false);
  });

  it("arrondis monétaires à 2 décimales", () => {
    const t = computeDpgfTotals([{ lot: "A", quantity: 3, unitPrice: 33.333, priceSource: "manuel" }], 20);
    expect(t.totalHT).toBe(100);
    expect(t.totalVAT).toBe(20);
    expect(t.totalTTC).toBe(120);
  });
});

describe("computeSousDetail (déboursé sec → FG → marge → PV → écart)", () => {
  const components = [
    { type: "MATERIAUX", quantity: 10, unitCost: 12, costSource: "bibliotheque" },   // 120
    { type: "MAIN_OEUVRE", quantity: 2, unitCost: 45, costSource: "manuel" },        // 90
    { type: "MATERIEL", quantity: 0.5, unitCost: 60, costSource: "manuel" },         // 30
  ];

  it("cascade complète : pertes sur matériaux, FG sur DS, marge sur DS+FG", () => {
    const c = computeSousDetail({
      components, wasteRate: 0.05, generalFeesRate: 0.10, profitRate: 0.10, targetPrice: 300,
    });
    expect(c.byType.MATERIAUX).toBe(120);
    expect(c.wasteAmount).toBe(6);           // 5 % de 120
    expect(c.debourseSec).toBe(246);         // 120+90+30+6
    expect(c.generalFees).toBe(24.6);        // 10 % de 246
    expect(c.profit).toBe(27.06);            // 10 % de (246+24.6)
    expect(c.sellingPrice).toBe(297.66);
    expect(c.ecart).toBe(-2.34);             // 297.66 − 300
    expect(c.ecartPct).toBe(-0.78);
    expect(c.complete).toBe(true);
  });

  it("sans pertes ni cible : PV = DS × 1.1 × 1.1, écart null", () => {
    const c = computeSousDetail({ components, generalFeesRate: 0.10, profitRate: 0.10 });
    expect(c.debourseSec).toBe(240);
    expect(c.sellingPrice).toBe(290.4);
    expect(c.ecart).toBeNull();
    expect(c.ecartPct).toBeNull();
  });

  it("un coût à 0 SANS provenance = manquant → PV partiel signalé", () => {
    const c = computeSousDetail({
      components: [...components, { type: "TRANSPORT", quantity: 1, unitCost: 0 }],
    });
    expect(c.missingCosts).toBe(1);
    expect(c.complete).toBe(false);
  });

  it("un coût à 0 AVEC provenance explicite n'est pas un manquant", () => {
    const c = computeSousDetail({
      components: [{ type: "MATERIAUX", quantity: 1, unitCost: 0, costSource: "bibliotheque" }],
    });
    expect(c.missingCosts).toBe(0);
    expect(c.complete).toBe(true);
  });

  it("le transport entre dans le déboursé sec", () => {
    const c = computeSousDetail({
      components: [
        { type: "MATERIAUX", quantity: 1, unitCost: 100, costSource: "manuel" },
        { type: "TRANSPORT", quantity: 1, unitCost: 20, costSource: "manuel" },
      ],
    });
    expect(c.debourseSec).toBe(120);
  });

  it("les pertes ne s'appliquent QU'AUX matériaux", () => {
    const c = computeSousDetail({
      components: [
        { type: "MAIN_OEUVRE", quantity: 1, unitCost: 100, costSource: "manuel" },
      ],
      wasteRate: 0.10,
    });
    expect(c.wasteAmount).toBe(0);
    expect(c.debourseSec).toBe(100);
  });
});

describe("MISSING_LABELS (libellés jamais chiffrés)", () => {
  it("libellés attendus", () => {
    expect(MISSING_LABELS.quantity).toBe("Q à renseigner");
    expect(MISSING_LABELS.price).toBe("Prix à renseigner");
    expect(MISSING_LABELS.cost).toBe("Coût à renseigner");
  });
});
