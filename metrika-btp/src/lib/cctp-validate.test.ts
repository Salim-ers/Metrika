import { describe, it, expect } from "vitest";
import { validateCctpContent, cctpBlockingIssues } from "./cctp-validate";

describe("validateCctpContent (garde-fou CCTP côté code)", () => {
  it("signale (sans bloquer) un tag plan peu localisé ([SOURCE PLAN] nu)", () => {
    const issues = validateCctpContent("[SOURCE PLAN] Voile d'épaisseur 20 cm.");
    expect(issues.some((i) => i.code === "plan_tag_incomplete")).toBe(true);
    expect(issues.every((i) => i.severity === "warning")).toBe(true);
  });

  it("accepte un tag plan localisé (≥ 3 champs, même sans cote explicite)", () => {
    const ok = "[SOURCE PLAN — A-101.pdf — p.3 — Plan RDC — high] Longueur du dallage.";
    expect(validateCctpContent(ok).some((i) => i.code === "plan_tag_incomplete")).toBe(false);
  });

  it("accepte un tag plan détaillé complet (6 champs)", () => {
    const ok = "[SOURCE PLAN — A-101.pdf — p.3 — Plan RDC — 65,60 m — high] Longueur du dallage.";
    expect(validateCctpContent(ok).some((i) => i.code === "plan_tag_incomplete")).toBe(false);
  });

  it("signale un placeholder dans le corps (non bloquant)", () => {
    const issues = validateCctpContent("Maître d'ouvrage : à compléter.");
    expect(issues.some((i) => i.code === "placeholder")).toBe(true);
  });

  it("ne flague pas « par exemple » (prose normale)", () => {
    expect(validateCctpContent("Les ouvrages, par exemple les voiles, seront conformes.").length).toBe(0);
  });

  it("ne flague pas les titres (##) contenant des mots-clés", () => {
    expect(validateCctpContent("## TESTS ET ESSAIS").length).toBe(0);
  });

  it("mode enrichi : norme ajoutée absente de l'officiel et non taguée = warning", () => {
    const issues = validateCctpContent("Les bétons seront conformes à la norme NF EN 206.", {
      mode: "enrichi", officialCctp: "Le présent CCTP décrit le lot gros œuvre.",
    });
    expect(issues.some((i) => i.code === "norm_added_untagged")).toBe(true);
  });

  it("mode enrichi : norme taguée complément = pas de warning", () => {
    const issues = validateCctpContent("[COMPLÉMENT METRIKA — NON CONTRACTUEL — À VALIDER BET/MOE] NF EN 206.", {
      mode: "enrichi", officialCctp: "lot gros œuvre",
    });
    expect(issues.some((i) => i.code === "norm_added_untagged")).toBe(false);
  });

  it("les contrôles CCTP ne sont jamais bloquants (export jamais verrouillé par eux)", () => {
    const all = validateCctpContent("[SOURCE PLAN] x\nNF EN 206 ajoutée.", { mode: "enrichi", officialCctp: "rien" });
    expect(all.length).toBeGreaterThan(0);
    expect(cctpBlockingIssues(all)).toEqual([]);
  });
});
