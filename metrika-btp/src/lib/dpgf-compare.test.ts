import { describe, it, expect } from "vitest";
import { extractCctpArticles, compareCctpDpgf } from "./dpgf-compare";

const GO_SECTION = {
  id: "sec-go",
  lot: "Gros Œuvre",
  content: `## Objet du lot
Le présent lot concerne les travaux de gros œuvre.

## Références réglementaires
- NF DTU 20.1

## Description des ouvrages
### Béton de propreté
Béton dosé selon étude.
### Voiles en béton armé
[SOURCE CCTP] Voiles porteurs.
### Dallage sur terre-plein
Épaisseur à confirmer.

## Localisation
Localisation à compléter d'après plans [À CONFIRMER].

## Points à compléter
- Épaisseur du dallage [À CONFIRMER]`,
};

describe("extractCctpArticles", () => {
  it("extrait les postes ### des chapitres descriptifs", () => {
    const arts = extractCctpArticles([GO_SECTION]);
    const headings = arts.map((a) => a.heading);
    expect(headings).toContain("Béton de propreté");
    expect(headings).toContain("Voiles en béton armé");
    expect(headings).toContain("Dallage sur terre-plein");
  });

  it("exclut les titres de chapitres-cadres (Objet, Références, Localisation…)", () => {
    const arts = extractCctpArticles([GO_SECTION]);
    const headings = arts.map((a) => a.heading.toLowerCase());
    expect(headings.some((h) => h.includes("objet du lot"))).toBe(false);
    expect(headings.some((h) => h.includes("références"))).toBe(false);
  });

  it("porte le lot et l'id de section (rattachement DPGF)", () => {
    const arts = extractCctpArticles([GO_SECTION]);
    expect(arts[0].lot).toBe("Gros Œuvre");
    expect(arts[0].sectionId).toBe("sec-go");
  });
});

describe("compareCctpDpgf", () => {
  const okLine = {
    lot: "Gros Œuvre", designation: "Voiles en béton armé ép. 20", unit: "m²",
    quantity: 120, unitPrice: 850, priceSource: "manuel", status: "confirmed",
  };

  it("repère les articles CCTP sans ligne DPGF (omissions)", () => {
    const r = compareCctpDpgf([GO_SECTION], [okLine], { priced: true });
    const omitted = r.omissions.map((o) => o.heading);
    expect(omitted).toContain("Béton de propreté");
    expect(omitted).toContain("Dallage sur terre-plein");
    expect(omitted).not.toContain("Voiles en béton armé");
  });

  it("repère les lignes DPGF sans article CCTP (hors cadre)", () => {
    const orphan = { lot: "Gros Œuvre", designation: "Fourniture de mobilier de bureau", unit: "U", quantity: 3, unitPrice: 100, priceSource: "manuel", status: "confirmed" };
    const r = compareCctpDpgf([GO_SECTION], [okLine, orphan]);
    expect(r.orphanLines).toContain(1);
    expect(r.orphanLines).not.toContain(0);
  });

  it("une ligne explicitement rattachée (cctpSectionId) n'est jamais orpheline", () => {
    const linked = { lot: "Gros Œuvre", designation: "Poste spécifique hors nomenclature", unit: "U", quantity: 1, unitPrice: 10, priceSource: "manuel", status: "confirmed", cctpSectionId: "sec-go" };
    const r = compareCctpDpgf([GO_SECTION], [linked]);
    expect(r.orphanLines).toHaveLength(0);
  });

  it("repère les doublons (même désignation, même lot)", () => {
    const r = compareCctpDpgf([GO_SECTION], [okLine, { ...okLine }]);
    expect(r.duplicates).toEqual([1]);
  });

  it("repère les unités inconnues ou vides", () => {
    const r = compareCctpDpgf([GO_SECTION], [
      okLine,
      { ...okLine, designation: "Autre voile", unit: "" },
      { ...okLine, designation: "Troisième voile", unit: "xyz" },
    ]);
    expect(r.unitIssues.map((u) => u.index)).toEqual([1, 2]);
  });

  it("compte quantités et prix manquants (mode chiffré)", () => {
    const r = compareCctpDpgf([GO_SECTION], [
      okLine,
      { lot: "Gros Œuvre", designation: "Voiles à métrer", unit: "m²", quantity: 0, unitPrice: 0, status: "to_measure" },
    ], { priced: true });
    expect(r.missingQuantities).toEqual([1]);
    expect(r.missingPrices).toEqual([1]);
  });

  it("hors mode chiffré, les prix ne sont pas contrôlés", () => {
    const r = compareCctpDpgf([GO_SECTION], [{ ...okLine, unitPrice: 0, priceSource: null }], { priced: false });
    expect(r.missingPrices).toHaveLength(0);
  });

  it("sans CCTP, le contrôle hors-cadre est sans objet", () => {
    const r = compareCctpDpgf([], [okLine]);
    expect(r.orphanLines).toHaveLength(0);
    expect(r.omissions).toHaveLength(0);
  });
});
