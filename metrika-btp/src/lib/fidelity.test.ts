import { describe, it, expect } from "vitest";
import {
  sourceLevel, isContractualSource,
  quantityHasJustification, priceZeroInvented, resolveCurrency,
  unitChanged, normalizeUnit, hasPlaceholder, additionProperlyTagged,
  detectConflict, scaleReliable, ocrLooksUnreliable, duplicateDesignations,
  findOmissions, detectActorRole, cdpgfStructureDiff, numberingDropped,
  isValidStatus, ALL_STATUSES, fidelityScore,
} from "./fidelity";

// ── Hiérarchie des sources (§2) ───────────────────────────────────
describe("hiérarchie des sources", () => {
  it("classe les sources du plus fort (1) au plus faible (5)", () => {
    expect(sourceLevel("cdpgf")).toBe(1);
    expect(sourceLevel("CCTP")).toBe(2);
    expect(sourceLevel("plan structure")).toBe(3);
    expect(sourceLevel("rapport géotechnique")).toBe(4);
    expect(sourceLevel("règle métier")).toBe(5);
    expect(sourceLevel("inconnu")).toBe(99);
  });
  it("seules les sources niveaux 1-4 justifient une donnée contractuelle", () => {
    expect(isContractualSource("plan")).toBe(true);
    expect(isContractualSource("metier")).toBe(false);
    expect(isContractualSource("estimation")).toBe(false);
    expect(isContractualSource(undefined)).toBe(false);
  });
});

// ── Statuts (§4) ──────────────────────────────────────────────────
describe("statuts de donnée", () => {
  it("reconnaît les 8 statuts officiels", () => {
    expect(ALL_STATUSES).toHaveLength(8);
    for (const s of ALL_STATUSES) expect(isValidStatus(s)).toBe(true);
    expect(isValidStatus("bogus")).toBe(false);
  });
});

// ── §1 Test quantité ──────────────────────────────────────────────
describe("§1 quantité : source ou formule obligatoire", () => {
  it("quantité > 0 sourcée (plan) = conforme", () => {
    expect(quantityHasJustification({ quantity: 55, quantitySource: "plan" })).toBe(true);
  });
  it("quantité > 0 avec formule mais sans source directe = conforme", () => {
    expect(quantityHasJustification({ quantity: 675, calculation: "65.6 x 10.3" })).toBe(true);
  });
  it("quantité > 0 NON sourcée et sans formule = NON conforme", () => {
    expect(quantityHasJustification({ quantity: 1350, quantitySource: "none" })).toBe(false);
    expect(quantityHasJustification({ quantity: 1350, quantitySource: "estimation" })).toBe(false);
  });
  it("quantité 0 en to_measure = conforme", () => {
    expect(quantityHasJustification({ quantity: 0, status: "to_measure" })).toBe(true);
  });
});

// ── §2 Test prix ──────────────────────────────────────────────────
describe("§2 prix : pas de 0 inventé", () => {
  it("PU = 0 sans confirmation source = invention interdite", () => {
    expect(priceZeroInvented({ unitPrice: 0 })).toBe(true);
  });
  it("PU = 0 explicitement confirmé par la source = autorisé", () => {
    expect(priceZeroInvented({ unitPrice: 0, explicitZero: true })).toBe(false);
  });
  it("PU > 0 = hors sujet (pas une invention de 0)", () => {
    expect(priceZeroInvented({ unitPrice: 120 })).toBe(false);
  });
});

// ── §3 Test devise ────────────────────────────────────────────────
describe("§3 devise", () => {
  it("reprend la devise officielle si fournie", () => {
    expect(resolveCurrency("MAD")).toBe("MAD");
    expect(resolveCurrency("EUR")).toBe("EUR");
  });
  it("sinon « À confirmer »", () => {
    expect(resolveCurrency(undefined)).toBe("À confirmer");
    expect(resolveCurrency("")).toBe("À confirmer");
  });
});

// ── §4 Test unité ─────────────────────────────────────────────────
describe("§4 unité : pas de changement non justifié", () => {
  it("détecte ml → m² et m² → m³", () => {
    expect(unitChanged("ml", "m²")).toBe(true);
    expect(unitChanged("m²", "m³")).toBe(true);
  });
  it("normalise les synonymes (m2 = m², U = unité)", () => {
    expect(normalizeUnit("m2")).toBe("m²");
    expect(unitChanged("m2", "m²")).toBe(false);
    expect(unitChanged("U", "unité")).toBe(false);
  });
});

// ── §5 / §14 Identité projet : pas de placeholder ─────────────────
describe("§5 identité : placeholders interdits dans le corps", () => {
  it("repère TEST / exemple / à compléter / xxx", () => {
    expect(hasPlaceholder("Maître d'ouvrage : TEST")).toBe(true);
    expect(hasPlaceholder("Architecte : exemple")).toBe(true);
    expect(hasPlaceholder("BET : à compléter")).toBe(true);
    expect(hasPlaceholder("Localisation : xxxxx")).toBe(true);
  });
  it("laisse passer une vraie valeur", () => {
    expect(hasPlaceholder("Maître d'ouvrage : OPH de l'Ariège")).toBe(false);
  });
});

// ── §8 Ajout non sourcé doit être tagué ───────────────────────────
describe("§8 ajout : tag [COMPLÉMENT METRIKA] obligatoire si non sourcé", () => {
  it("ajout non sourcé sans tag = non conforme", () => {
    expect(additionProperlyTagged("Prévoir un drainage périphérique.", false)).toBe(false);
  });
  it("ajout non sourcé tagué = conforme", () => {
    expect(additionProperlyTagged("[COMPLÉMENT METRIKA — NON CONTRACTUEL — À VALIDER] Drainage.", false)).toBe(true);
  });
  it("élément sourcé = conforme sans tag", () => {
    expect(additionProperlyTagged("Voiles BA ep. 20 cm.", true)).toBe(true);
  });
});

// ── §9 Contradiction ──────────────────────────────────────────────
describe("§9 contradiction entre sources", () => {
  it("détecte des valeurs divergentes", () => {
    expect(detectConflict([
      { value: "semelles filantes", source: "cctp" },
      { value: "radier général", source: "plan" },
    ])).toBe(true);
  });
  it("valeurs identiques = pas de conflit", () => {
    expect(detectConflict([
      { value: "radier général", source: "cctp" },
      { value: "Radier  général", source: "plan" },
    ])).toBe(false);
  });
});

// ── §10 Plans : pas de métré sans échelle fiable ──────────────────
describe("§10 échelle : métré interdit si échelle non fiable", () => {
  it("échelle explicite plausible = fiable", () => {
    expect(scaleReliable("1/50")).toBe(true);
    expect(scaleReliable("1:100")).toBe(true);
  });
  it("échelle absente / illisible = non fiable", () => {
    expect(scaleReliable(undefined)).toBe(false);
    expect(scaleReliable("illisible")).toBe(false);
    expect(scaleReliable("échelle non précisée")).toBe(false);
  });
});

// ── §11 OCR douteux ───────────────────────────────────────────────
describe("§11 OCR : texte douteux → peu fiable", () => {
  it("texte propre = fiable", () => {
    expect(ocrLooksUnreliable("Le présent lot comprend les travaux de gros œuvre.")).toBe(false);
  });
  it("texte bruité = peu fiable", () => {
    expect(ocrLooksUnreliable("L� pr�s�nt l�t c�mpr�nd l�s tr�v�ux ���")).toBe(true);
  });
});

// ── §12 Doublons ──────────────────────────────────────────────────
describe("§12 doublons", () => {
  it("détecte un poste répété dans le même lot", () => {
    const dups = duplicateDesignations([
      { lot: "Gros Œuvre", designation: "Béton C25/30" },
      { lot: "Gros Œuvre", designation: "béton c25/30" },
      { lot: "Étanchéité", designation: "Béton C25/30" },
    ]);
    expect(dups).toEqual([1]);
  });
});

// ── §13 Omissions ─────────────────────────────────────────────────
describe("§13 omissions : ouvrages CCTP sans ligne DPGF", () => {
  it("signale un ouvrage non repris dans le DPGF", () => {
    const omissions = findOmissions(
      ["Voiles en béton armé", "Escaliers béton armé", "Étanchéité toiture terrasse"],
      ["Voiles béton armé épaisseur 20", "Escalier en béton armé"],
    );
    expect(omissions).toContain("Étanchéité toiture terrasse");
    expect(omissions).not.toContain("Voiles en béton armé");
  });
});

// ── §14 Rôles d'intervenants ──────────────────────────────────────
describe("§14 rôles : ne pas confondre archi / MOE / BET / OPC / CT", () => {
  it("distingue chaque rôle", () => {
    expect(detectActorRole("Cabinet d'architecture Dupont")).toBe("ARCHITECTE");
    expect(detectActorRole("BET structure SARL")).toBe("BET_STRUCTURE");
    expect(detectActorRole("Bureau de contrôle Veritas")).toBe("CONTROLE");
    expect(detectActorRole("OPC coordination")).toBe("OPC");
    expect(detectActorRole("Maître d'ouvrage : commune")).toBe("MOA");
  });
});

// ── §6 Structure CDPGF ────────────────────────────────────────────
describe("§6 structure CDPGF : correspondance ligne par ligne", () => {
  it("repère lignes manquantes et lignes en trop", () => {
    const diff = cdpgfStructureDiff(
      [{ code: "1.1", designation: "Béton de propreté" }, { code: "1.2", designation: "Semelles filantes" }],
      [{ code: "1.1", designation: "Béton de propreté" }, { code: "1.3", designation: "Poste inventé" }],
    );
    expect(diff.missing.map((l) => l.code)).toEqual(["1.2"]);
    expect(diff.extra.map((l) => l.code)).toEqual(["1.3"]);
  });
});

// ── §7 Numérotation CCTP conservée ────────────────────────────────
describe("§7 CCTP fidèle : numérotation conservée", () => {
  it("signale les numéros de la source absents du document produit", () => {
    const source = "1. Généralités\n1.1 Objet\n1.2 Normes\n2. Gros œuvre";
    const produced = "1. Généralités\n1.1 Objet\n2. Gros œuvre";
    expect(numberingDropped(source, produced)).toContain("1.2");
  });
});

// ── Bilan de fiabilité ────────────────────────────────────────────
describe("fidelityScore", () => {
  it("calcule traçabilité, part contractuelle et alertes", () => {
    const s = fidelityScore([
      { status: "confirmed", quantitySource: "plan", designation: "A", lot: "GO" },
      { status: "to_measure", quantitySource: "none", designation: "B", lot: "GO" },
      { status: "conflict", quantitySource: "cctp", designation: "C", lot: "GO" },
    ]);
    expect(s.traceability).toBeGreaterThan(0);
    expect(s.hasAlerts).toBe(true);
  });
});
