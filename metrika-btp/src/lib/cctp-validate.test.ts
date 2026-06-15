import { describe, it, expect } from "vitest";
import { validateCctpContent, cctpBlockingIssues } from "./cctp-validate";

describe("validateCctpContent (garde-fou CCTP côté code)", () => {
  it("bloque un tag plan incomplet ([SOURCE PLAN] nu)", () => {
    const issues = validateCctpContent("[SOURCE PLAN] Voile d'épaisseur 20 cm.");
    expect(issues.some((i) => i.code === "plan_tag_incomplete")).toBe(true);
  });

  it("accepte un tag plan détaillé (6 parties)", () => {
    const ok = "[SOURCE PLAN — A-101.pdf — p.3 — Plan RDC — 65,60 m — high] Longueur du dallage.";
    expect(validateCctpContent(ok).some((i) => i.code === "plan_tag_incomplete")).toBe(false);
  });

  it("bloque un placeholder dans le corps", () => {
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

  it("cctpBlockingIssues ne renvoie que les bloquants", () => {
    const all = validateCctpContent("[SOURCE PLAN] x\nNF EN 206 ajoutée.", { mode: "enrichi", officialCctp: "rien" });
    expect(cctpBlockingIssues(all).every((i) => i.severity === "blocking")).toBe(true);
  });
});
