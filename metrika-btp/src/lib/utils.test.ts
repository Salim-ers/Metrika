import { describe, it, expect } from "vitest";
import { formatMoney, formatMAD, buildQuoteNumber } from "./utils";

describe("formatMoney", () => {
  it("formate en MAD par défaut", () => {
    const s = formatMoney(1234.5);
    expect(s).toContain("MAD");
    expect(s).toContain("234"); // séparateur de milliers indifférent
  });

  it("formate en euros quand currency=EUR", () => {
    const s = formatMoney(1000, "EUR");
    expect(s).toContain("€");
  });

  it("traite les valeurs invalides comme 0", () => {
    expect(formatMoney(NaN)).toContain("0");
  });

  it("retombe sur MAD pour une devise inconnue", () => {
    expect(formatMoney(10, "USD")).toContain("MAD");
  });
});

describe("formatMAD", () => {
  it("contient la devise MAD", () => {
    expect(formatMAD(42)).toContain("MAD");
  });
});

describe("buildQuoteNumber", () => {
  it("génère un numéro paddé avec l'année courante", () => {
    const year = new Date().getFullYear();
    expect(buildQuoteNumber("DEV", 1)).toBe(`DEV-${year}-0001`);
    expect(buildQuoteNumber("DEV", 123)).toBe(`DEV-${year}-0123`);
    expect(buildQuoteNumber("FAC", 10000)).toBe(`FAC-${year}-10000`);
  });
});
