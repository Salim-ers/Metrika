# Exemple complet — Système de fiabilité Metrika

> Règle directrice : **FIABILITÉ > COMPLÉTUDE**.
> _Ne jamais remplir pour faire complet. Remplir uniquement pour faire vrai._
>
> Démonstration d'un livrable montrant les quatre natures de donnée :
> **réelle (sourcée)**, **calculée**, **à métrer (manquante)**, **contradiction**,
> ainsi qu'un **complément Metrika** clairement séparé.

Projet fictif : *Immeuble R+3, 11 logements* — Lot **Gros Œuvre**.
Pièces fournies : CCTP (officiel), plans A‑101 et S‑201, rapport G2 partiel.
Pièce **absente** : CDPGF officiel, plan VRD.

---

## 0. Chaîne CCTP durcie (R1–R7)

1. **Hiérarchie des sources** : *CDPGF officiel > CCTP officiel > plans > rapports
   annexes > compléments Metrika*. Un **CCTP officiel** fourni **pilote** le
   contenu généré ; plans/rapports ne servent qu'à compléter/vérifier, jamais à
   contredire.
2. **Table unique des intervenants** (7 rôles : MOA, MOE, architecte, BET
   structure, BE fluides, OPC, bureau de contrôle), chacun avec **source / page /
   confiance / statut**. Aucun rôle n'est réinterprété dans le corps du document.
3. **Tags plan détaillés** :
   `[SOURCE PLAN — fichier — p.X — nom du plan/coupe/façade — cote/annotation — confiance]`.
   Une donnée plan sans localisation est inexploitable.
4. **Séparation stricte** : contractuel / calculé / à confirmer / complément Metrika.
5. **Compléments Metrika** en annexe ou marqués
   `[COMPLÉMENT METRIKA — NON CONTRACTUEL — À VALIDER BET/MOE]`.
6. **Erreurs bloquantes** (export désactivé), appliquées CÔTÉ CODE :
   - DPGF : quantité sans source, unité absente, prix remplacé par 0, placeholder.
   - CCTP (post-génération, `cctp-validate`) : tag plan incomplet, placeholder,
     norme ajoutée non taguée (mode enrichi). Intervenant ambigu / rôle déduit
     **bloquent la génération** (table intervenants éditable pour corriger).
   - Contradiction sémantique avec le CCTP officiel = relevée par le pré-audit IA.
7. **Pré-audit obligatoire** avant la génération : pièces utilisées / manquantes,
   données confirmées / à confirmer, contradictions, compléments Metrika. La
   génération est **verrouillée** tant que cet audit n'a pas été produit ; si
   l'audit conclut « non prêt », la génération est bloquée (override explicite
   « sous ma responsabilité » possible).

---

## 1. Identité du projet (corps contractuel)

| Donnée | Valeur | Statut | Source |
|---|---|---|---|
| Maître d'ouvrage | OPH de l'Ariège | confirmed | CCTP p.1 |
| Architecte / MOE | Cabinet Vidal Architecture | confirmed | CCTP p.1 |
| BET structure | **Non renseigné dans les pièces fournies** | missing | — |
| OPC | **Non renseigné dans les pièces fournies** | missing | — |
| Localisation | Foix (09) | confirmed | CCTP p.1 |
| Date du document | 12/03/2024 | confirmed | cartouche CCTP |

> ⚠️ Les rôles ne sont **jamais** confondus (architecte ≠ MOE ≠ BET ≠ OPC ≠
> bureau de contrôle). Une donnée absente reste « Non renseigné… » — **jamais**
> remplacée par TEST/exemple/nom générique.

---

## 2. DPGF — deux modes (§8)

**Mode structure maître** — si un **CDPGF/DPGF officiel** est fourni, son cadre
devient la référence : lots, numéros, désignations et unités repris **à
l'identique** (ni agrégation, ni éclatement, ni ajout). L'application recompare
le cadre lu au DPGF produit et **signale toute ligne omise ou hors cadre**
(`structureDiff`). Les quantités ne sont renseignées que si elles figurent dans
le cadre officiel ; sinon « À métrer ». La devise est celle du cadre, sinon
« À confirmer ».

**Mode provisoire** — sans CDPGF officiel, bandeau **« DPGF provisoire généré à
partir des pièces fournies — non contractuel »** (écran + exports PDF/Excel/DOCX).

> Extrait ci-dessous : mode provisoire (aucun CDPGF officiel fourni).

| N° | Désignation | U | Qté | P.U. | Source | Statut | Conf. | Commentaire |
|---|---|---|---|---|---|---|---|---|
| 1.1 | Béton de propreté ép. 5 cm | m³ | **À métrer** | À renseigner | — | to_measure | — | Surface fondations non cotée |
| 1.2 | Dallage sur terre-plein | m² | **675,68** | À renseigner | plan A‑101 | calculated | medium | 65,60 × 10,30 (cotes explicites) |
| 1.3 | Voiles BA ép. 20 cm | m² | **À métrer** | À renseigner | — | to_measure | — | Épaisseur au CCTP, surfaces non cotées |
| 1.4 | Fondations | — | — | — | CCTP / plan S‑201 | **conflict** | — | Voir §3 |
| 1.5 | Drainage périphérique | ml | **À métrer** | À renseigner | — | non_contractual | low | `[COMPLÉMENT METRIKA]` voir §4 |

Règles appliquées **côté code** (`enforceSourcedQuantities`) :
- Une quantité **non sourcée** est ramenée à 0 et passée en `to_measure` —
  même si le modèle proposait un nombre.
- Une quantité **calculée** conserve sa **formule** (ligne 1.2).
- Le **prix** absent reste « À renseigner » (jamais 0 inventé).
- La **devise** vient du DPGF officiel ; à défaut « À confirmer ».

---

## 3. Contradiction à arbitrer (jamais tranchée automatiquement)

> **Contradiction — fondations** (statut `conflict`) :
> - **CCTP** (niveau 2) : « semelles filantes et isolées » — _p.8_.
> - **Plan S‑201** (niveau 3) : « radier général ép. 30 cm ».
>
> Les **deux** sources sont citées, l'écart est classé _critique_ (impact
> direct sur le métré béton/acier). **Action** : faire arbitrer par le BET
> structure avant chiffrage. Aucune quantité de fondation n'est figée tant que
> l'arbitrage n'est pas rendu.

---

## 4. Compléments Metrika (non contractuels, séparés)

> ## ÉLÉMENTS AJOUTÉS PAR METRIKA (non contractuels)
>
> `[COMPLÉMENT METRIKA — NON CONTRACTUEL — À VALIDER]`
> - **Drainage périphérique** : usuel en présence d'un niveau enterré ; non
>   décrit dans les pièces fournies → à valider par la MOE.
> - **Joint de dilatation** : à confirmer selon longueur du bâtiment (plan de
>   coffrage non fourni).

Ces compléments **ne sont jamais mélangés** au corps contractuel : ils portent
un tag et figurent dans un chapitre dédié.

---

## 5. Registre des hypothèses (sortie d'audit)

| Hypothèse | Raison | Source partielle | Impact possible | Validation |
|---|---|---|---|---|
| Dallage rectangulaire | bâtiment supposé simple | plan A‑101 | sur/sous‑métré si redents | métré sur DWG coté |
| Béton C25/30 en voiles | classe usuelle | aucune (CCTP muet) | classe réelle ≠ | note de calcul BET |

---

## 6. Pièces manquantes pour fiabiliser

- **CDPGF officiel** — nécessaire pour le cadre de prix contractuel.
- **Plans structure (coffrage)** — nécessaires pour épaisseurs de voiles et métré béton/acier.
- **Plan VRD** — nécessaire pour les linéaires de réseaux enterrés.
- **Rapport géotechnique G2 complet** — nécessaire pour arbitrer le type de fondation (§3).

---

## 7. Le système échoue proprement (au lieu d'inventer)

| Situation | Comportement attendu | Au lieu de |
|---|---|---|
| Quantité non cotée | « À métrer » | un nombre plausible inventé |
| Prix non fourni | « À renseigner » | 0 (faux total) |
| Échelle illisible | « Échelle non fiable — métré à confirmer » | métré au pixel |
| Intervenant absent | « Non renseigné dans les pièces fournies » | « TEST » / nom générique |
| Sources divergentes | `conflict` + 2 sources citées | choix arbitraire silencieux |

Ces comportements sont **garantis par des tests automatiques**
(`src/lib/fidelity.test.ts`, `src/lib/dpgf-fidelity.test.ts`) couvrant les 14
contrôles du cahier des charges (quantité, prix, devise, unité, identité,
structure CDPGF/CCTP, ajout non sourcé, contradiction, plans/échelle, OCR,
doublons, omissions, rôles d'intervenants).
