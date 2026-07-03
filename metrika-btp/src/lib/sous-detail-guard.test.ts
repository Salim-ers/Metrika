import { describe, it, expect } from "vitest";
import { sanitizeGeneratedComponents, componentCostKnown } from "./sous-detail-guard";

describe("sanitizeGeneratedComponents (non-invention des coûts)", () => {
  it("NEUTRALISE tout coût renvoyé par le modèle (unitCost → 0, costSource → null)", () => {
    const out = sanitizeGeneratedComponents([
      { type: "MAIN_OEUVRE", designation: "Maçon", unit: "h", quantity: 0.5, unitCost: 45 },
      { type: "MATERIAUX", designation: "Ciment", unit: "kg", quantity: 12, unitCost: 1.2 },
    ]);
    expect(out).toHaveLength(2);
    for (const c of out) {
      expect(c.unitCost).toBe(0);
      expect(c.costSource).toBeNull();
    }
  });

  it("conserve la structure (types, coefficients-hypothèses, unités)", () => {
    const out = sanitizeGeneratedComponents([
      { type: "TRANSPORT", designation: "Amenée-repli", unit: "forfait", quantity: 1, unitCost: 999 },
    ]);
    expect(out[0]).toEqual({
      type: "TRANSPORT", designation: "Amenée-repli", unit: "forfait",
      quantity: 1, unitCost: 0, costSource: null,
    });
  });

  it("normalise un type inconnu en MATERIAUX et une quantité invalide en 0", () => {
    const out = sanitizeGeneratedComponents([
      { type: "SOUS_TRAITANCE", designation: "Poste exotique", unit: "u", quantity: Number.NaN, unitCost: 10 },
    ]);
    expect(out[0].type).toBe("MATERIAUX");
    expect(out[0].quantity).toBe(0);
    expect(out[0].unitCost).toBe(0);
  });

  it("écarte les composants sans désignation et les entrées invalides", () => {
    const out = sanitizeGeneratedComponents([
      { type: "MATERIAUX", designation: "  ", unit: "kg", quantity: 1, unitCost: 5 },
      null as never,
      { type: "MATERIEL", designation: "Bétonnière", unit: "j", quantity: 0.2, unitCost: 3 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].designation).toBe("Bétonnière");
  });

  it("entrée absente → structure vide (jamais d'exception)", () => {
    expect(sanitizeGeneratedComponents(undefined)).toEqual([]);
    expect(sanitizeGeneratedComponents(null)).toEqual([]);
  });
});

describe("componentCostKnown (gate de validation)", () => {
  it("coût > 0 = connu", () => {
    expect(componentCostKnown({ unitCost: 12.5 })).toBe(true);
  });
  it("coût 0 sans provenance = À renseigner (validation impossible)", () => {
    expect(componentCostKnown({ unitCost: 0 })).toBe(false);
    expect(componentCostKnown({ unitCost: 0, costSource: null })).toBe(false);
  });
  it("coût 0 avec provenance explicite = zéro assumé", () => {
    expect(componentCostKnown({ unitCost: 0, costSource: "bibliotheque" })).toBe(true);
    expect(componentCostKnown({ unitCost: 0, costSource: "manuel" })).toBe(true);
  });
});
