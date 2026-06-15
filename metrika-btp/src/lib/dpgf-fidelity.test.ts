import { describe, it, expect } from "vitest";
import { enforceSourcedQuantities, duplicateIndices, fidelityReport, type FidelityLine } from "./dpgf-fidelity";

describe("enforceSourcedQuantities (anti-hallucination)", () => {
  it("neutralise une quantité NON sourcée → 0 + À métrer", () => {
    const out = enforceSourcedQuantities([
      { designation: "Voiles BA", unit: "m²", quantity: 1350, quantitySource: "none" },
    ]);
    expect(out[0].quantity).toBe(0);
    expect(out[0].status).toBe("to_measure");
  });

  it("neutralise une quantité sans source du tout (estimation) → À métrer", () => {
    const out = enforceSourcedQuantities([
      { designation: "Dalle", unit: "m²", quantity: 380, quantitySource: "estimation" },
    ]);
    expect(out[0].quantity).toBe(0);
    expect(out[0].status).toBe("to_measure");
  });

  it("conserve une quantité sourcée (plan/cctp/metré) → Confirmé", () => {
    const out = enforceSourcedQuantities([
      { designation: "Béton C25/30", unit: "m³", quantity: 55, quantitySource: "plan" },
      { designation: "Coffrage", unit: "m²", quantity: 120, quantitySource: "cctp" },
      { designation: "Aciers", unit: "kg", quantity: 4200, quantitySource: "metre" },
    ]);
    expect(out.map((l) => l.status)).toEqual(["confirmed", "confirmed", "confirmed"]);
    expect(out.map((l) => l.quantity)).toEqual([55, 120, 4200]);
  });

  it("quantité 0 même sourcée → À métrer", () => {
    const out = enforceSourcedQuantities([
      { designation: "Fouilles", unit: "m³", quantity: 0, quantitySource: "cctp" },
    ]);
    expect(out[0].status).toBe("to_measure");
  });

  it("préserve un statut conflict explicite", () => {
    const out = enforceSourcedQuantities([
      { designation: "Semelles", unit: "m³", quantity: 18, quantitySource: "plan", status: "conflict" },
    ]);
    expect(out[0].status).toBe("conflict");
  });

  it("quantité « calculated » AVEC formule → conservée", () => {
    const out = enforceSourcedQuantities([
      { designation: "Dallage", unit: "m²", quantity: 675.68, quantitySource: "plan", status: "calculated", calculation: "65,60 × 10,30" },
    ]);
    expect(out[0].status).toBe("calculated");
    expect(out[0].quantity).toBe(675.68);
  });

  it("quantité « calculated » SANS formule → neutralisée (À métrer)", () => {
    const out = enforceSourcedQuantities([
      { designation: "Dallage", unit: "m²", quantity: 675.68, quantitySource: "plan", status: "calculated" },
    ]);
    expect(out[0].status).toBe("to_measure");
    expect(out[0].quantity).toBe(0);
  });

  it("quantité sourcée CDPGF officiel > 0 → confirmée", () => {
    const out = enforceSourcedQuantities([
      { designation: "Béton C25/30", unit: "m³", quantity: 42, quantitySource: "cdpgf" },
    ]);
    expect(out[0].status).toBe("confirmed");
  });

  it("garantit qu'aucune quantité inventée ne subsiste (noInvented)", () => {
    const lines: FidelityLine[] = [
      { designation: "A", unit: "m²", quantity: 100, quantitySource: "none" },
      { designation: "B", unit: "m³", quantity: 50, quantitySource: "plan" },
    ];
    const report = fidelityReport(enforceSourcedQuantities(lines));
    expect(report.noInvented).toBe(true);
    expect(report.toMeasure).toBe(1);
    expect(report.confirmed).toBe(1);
  });
});

describe("duplicateIndices", () => {
  it("détecte les doublons (même désignation + lot)", () => {
    const dups = duplicateIndices([
      { lot: "Gros Œuvre", designation: "Béton C25/30", unit: "m³", quantity: 1 },
      { lot: "Gros Œuvre", designation: "Béton C25/30", unit: "m³", quantity: 1 },
      { lot: "Étanchéité", designation: "Béton C25/30", unit: "m³", quantity: 1 },
    ]);
    expect(dups).toEqual([1]);
  });
});
