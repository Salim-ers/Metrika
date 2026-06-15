import { describe, it, expect } from "vitest";
import { dpgfBlockingErrors, intervenantBlockingErrors } from "./blocking-errors";
import { normalizeActorTable, type ActorEntry } from "./fidelity";

describe("dpgfBlockingErrors (R6 — contrôles mécaniques DPGF)", () => {
  it("quantité > 0 sans source ni formule = bloquant", () => {
    const errs = dpgfBlockingErrors([{ designation: "Voiles BA", unit: "m²", quantity: 1350, quantitySource: "none" }]);
    expect(errs.some((e) => e.code === "qty_no_source")).toBe(true);
  });

  it("quantité sourcée (plan) = pas d'erreur de source", () => {
    const errs = dpgfBlockingErrors([{ designation: "Béton", unit: "m³", quantity: 55, quantitySource: "plan" }]);
    expect(errs.some((e) => e.code === "qty_no_source")).toBe(false);
  });

  it("unité absente sur une quantité = bloquant", () => {
    const errs = dpgfBlockingErrors([{ designation: "Dalle", unit: "", quantity: 80, quantitySource: "plan" }]);
    expect(errs.some((e) => e.code === "unit_missing")).toBe(true);
  });

  it("placeholder dans la désignation = bloquant", () => {
    const errs = dpgfBlockingErrors([{ designation: "Poste TEST", unit: "U", quantity: 0 }]);
    expect(errs.some((e) => e.code === "placeholder")).toBe(true);
  });

  it("prix 0 bloquant UNIQUEMENT en export chiffré (priced)", () => {
    const line = [{ designation: "Béton", unit: "m³", quantity: 55, quantitySource: "plan", unitPrice: 0 }];
    expect(dpgfBlockingErrors(line, { priced: false }).some((e) => e.code === "price_zero")).toBe(false);
    expect(dpgfBlockingErrors(line, { priced: true }).some((e) => e.code === "price_zero")).toBe(true);
  });

  it("ligne saine (sourcée + prix) = aucune erreur", () => {
    const errs = dpgfBlockingErrors([{ designation: "Béton C25/30", unit: "m³", quantity: 55, quantitySource: "cdpgf", unitPrice: 1200 }], { priced: true });
    expect(errs).toHaveLength(0);
  });
});

describe("intervenantBlockingErrors (R6 — rôles)", () => {
  const base: ActorEntry[] = normalizeActorTable([
    { role: "MOA", value: "OPH Ariège", status: "confirmed" },
    { role: "ARCHITECTE", value: "Cabinet Vidal", status: "confirmed" },
  ]);

  it("rôle déduit (inferred) SANS source = bloquant", () => {
    const table = normalizeActorTable([{ role: "BET_STRUCTURE", value: "BET déduit", status: "inferred" }]);
    expect(intervenantBlockingErrors(table).some((e) => e.code === "actor_inferred")).toBe(true);
  });

  it("rôle « déduit » AVEC source = non bloquant (extrait, à confirmer)", () => {
    const table = normalizeActorTable([{ role: "BET_STRUCTURE", value: "ESI Varilhes", status: "inferred", source_file: "PLAN.pdf", source_page: "Cartouche" }]);
    expect(intervenantBlockingErrors(table).some((e) => e.code === "actor_inferred")).toBe(false);
  });

  it("intervenant ambigu (même nom, rôles INCOMPATIBLES) = bloquant", () => {
    const table = normalizeActorTable([
      { role: "ARCHITECTE", value: "Cabinet Vidal", status: "confirmed" },
      { role: "CONTROLE", value: "Cabinet Vidal", status: "confirmed" },
    ]);
    expect(intervenantBlockingErrors(table).some((e) => e.code === "actor_ambiguous")).toBe(true);
  });

  it("MOE = Architecte (même société) = NON bloquant", () => {
    const table = normalizeActorTable([
      { role: "MOE", value: "Cabinet Vidal", status: "confirmed" },
      { role: "ARCHITECTE", value: "Cabinet Vidal", status: "confirmed" },
    ]);
    expect(intervenantBlockingErrors(table).some((e) => e.code === "actor_ambiguous")).toBe(false);
  });

  it("rôles manquants (Non renseigné) = pas d'erreur bloquante", () => {
    expect(intervenantBlockingErrors(base).length).toBe(0);
  });
});
