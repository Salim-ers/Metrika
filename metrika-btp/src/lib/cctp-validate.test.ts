import { describe, it, expect } from "vitest";
import { validateCctpContent, cctpBlockingIssues, extractVerifyRegister, VERIFY_KIND_LABELS } from "./cctp-validate";

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

describe("extractVerifyRegister (registre des points à vérifier)", () => {
  const sections = [
    {
      lot: "Gros Œuvre",
      content: [
        "## Description des ouvrages",
        "### Dallage",
        "Épaisseur du dallage [À CONFIRMER] selon étude béton.",
        "Surface : À métrer après implantation.",
        "## Localisation",
        "Localisation à compléter d'après plans [À CONFIRMER].",
        "## Points à compléter",
        "Écart entre plans : contradiction à arbitrer entre A-101 et S-201.",
      ].join("\n"),
    },
    {
      lot: "Peinture",
      content: [
        "## Intervenants",
        "Bureau de contrôle : Non renseigné dans les pièces fournies.",
        "[COMPLÉMENT METRIKA — NON CONTRACTUEL — À VALIDER BET/MOE] Prévoir une couche d'impression.",
      ].join("\n"),
    },
  ];

  it("collecte chaque marque d'incertitude avec lot + chapitre + extrait", () => {
    const reg = extractVerifyRegister(sections);
    expect(reg.length).toBeGreaterThanOrEqual(5);
    const kinds = reg.map((p) => p.kind);
    expect(kinds).toContain("a_confirmer");
    expect(kinds).toContain("a_metrer");
    expect(kinds).toContain("localisation");
    expect(kinds).toContain("conflit");
    expect(kinds).toContain("non_renseigne");
    expect(kinds).toContain("complement");
  });

  it("rattache l'entrée au bon lot et au chapitre courant", () => {
    const reg = extractVerifyRegister(sections);
    const dallage = reg.find((p) => p.excerpt.includes("Épaisseur du dallage"));
    expect(dallage?.lot).toBe("Gros Œuvre");
    expect(dallage?.chapter).toBe("Description des ouvrages");
  });

  it("le motif le plus grave prime sur une même ligne (conflit > à confirmer)", () => {
    const reg = extractVerifyRegister([{ lot: "L", content: "contradiction à arbitrer [À CONFIRMER]" }]);
    expect(reg).toHaveLength(1);
    expect(reg[0].kind).toBe("conflit");
  });

  it("document sans incertitude → registre vide", () => {
    const reg = extractVerifyRegister([{ lot: "L", content: "## Objet du lot\nTravaux définis et sourcés." }]);
    expect(reg).toHaveLength(0);
  });

  it("chaque type de point a un libellé d'affichage", () => {
    const reg = extractVerifyRegister(sections);
    for (const p of reg) expect(VERIFY_KIND_LABELS[p.kind]).toBeTruthy();
  });
});
