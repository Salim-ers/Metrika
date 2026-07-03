import { describe, it, expect } from "vitest";
import { stripProvenanceTags, stripInternalChapters, cleanForExport } from "./cctp-clean";

describe("stripProvenanceTags (document client sans tags internes)", () => {
  it("retire les tags de provenance simples", () => {
    const s = stripProvenanceTags("[SOURCE CCTP] Les voiles seront en béton C25/30. [À CONFIRMER]");
    expect(s).not.toMatch(/\[SOURCE|\[À CONFIRMER/);
    expect(s.trim()).toBe("Les voiles seront en béton C25/30.");
  });

  it("convertit un tag plan détaillé en référence propre « (cf. fichier, p.X) »", () => {
    const s = stripProvenanceTags("Dallage de 675,68 m² [SOURCE PLAN — A-101.pdf — p.3 — Plan RDC — 65,60 × 10,30 — high].");
    expect(s).toContain("(cf. A-101.pdf, p.3)");
    expect(s).not.toContain("high");
    expect(s).not.toContain("[SOURCE PLAN");
  });

  it("supprime un tag plan sans fichier exploitable", () => {
    const s = stripProvenanceTags("Hauteur sous plafond [SOURCE PLAN — fichier ? — page ? — coupe ? — ? — ?].");
    expect(s).not.toContain("cf.");
    expect(s).not.toContain("[SOURCE PLAN");
  });

  it("préserve la distinction contractuelle des compléments Metrika", () => {
    const s = stripProvenanceTags("[COMPLÉMENT METRIKA — NON CONTRACTUEL — À VALIDER BET/MOE] Prévoir une couche d'impression.");
    expect(s).toContain("(complément Metrika — non contractuel)");
  });

  it("nettoie les espaces résiduels (pas de double espace ni d'espace avant ponctuation)", () => {
    const s = stripProvenanceTags("Les fondations [SOURCE CCTP] seront conformes [À CONFIRMER] .");
    expect(s).not.toMatch(/ {2,}/);
    expect(s).toContain("conformes.");
  });

  it("mentions « suivant plans architecte » (clauses prescriptives) conservées telles quelles", () => {
    const s = stripProvenanceTags("Localisation : suivant plans architecte. [À CONFIRMER]");
    expect(s.trim()).toBe("Localisation : suivant plans architecte.");
  });
});

describe("stripInternalChapters (chapitre interne jamais exporté)", () => {
  const content = [
    "## Description des ouvrages",
    "### Dallage",
    "Surface 675,68 m².",
    "## Points à compléter",
    "- Épaisseur du dallage à confirmer",
    "- Classe d'exposition à confirmer",
    "## Options / variantes",
    "Sans objet d'après les pièces du dossier.",
  ].join("\n");

  it("retire le chapitre « Points à compléter » et son contenu, conserve le reste", () => {
    const s = stripInternalChapters(content);
    expect(s).not.toMatch(/points à compléter/i);
    expect(s).not.toContain("Épaisseur du dallage");
    expect(s).toContain("### Dallage");
    expect(s).toContain("## Options / variantes");
    expect(s).toContain("Sans objet");
  });

  it("gère un chapitre numéroté (« ## 15. Points à compléter »)", () => {
    const s = stripInternalChapters("## 15. Points à compléter\n- item interne\n## Annexes\nContenu.");
    expect(s).not.toContain("item interne");
    expect(s).toContain("## Annexes");
  });

  it("chapitre en fin de document → retiré jusqu'à la fin", () => {
    const s = stripInternalChapters("## Mise en œuvre\nTexte.\n## Points à compléter\n- fin interne");
    expect(s.trimEnd().endsWith("Texte.")).toBe(true);
  });

  it("document sans chapitre interne → inchangé", () => {
    const src = "## Objet du lot\nTravaux de gros œuvre.";
    expect(stripInternalChapters(src)).toBe(src);
  });
});

describe("cleanForExport (pipeline complet)", () => {
  it("aucun « à compléter » ni tag ne survit sur le document exporté", () => {
    const s = cleanForExport([
      "## Localisation",
      "Voiles périphériques : niveaux R+1 et R+2 [SOURCE PLAN — S-201.pdf — p.2 — Plan étage — voiles ép. 20 — high].",
      "Menuiseries : suivant plans architecte. [À CONFIRMER]",
      "## Points à compléter",
      "- Localisation menuiseries à compléter d'après plans",
    ].join("\n"));
    expect(s).not.toMatch(/à compléter/i);
    expect(s).not.toMatch(/\[[A-ZÀ]/);
    expect(s).toContain("(cf. S-201.pdf, p.2)");
    expect(s).toContain("suivant plans architecte.");
  });
});
