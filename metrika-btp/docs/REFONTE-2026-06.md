# Metrika BTP — Refonte haut de gamme (juin 2026)

Refonte « production-ready » sans régression fonctionnelle. Identité visuelle conservée
(bleu marine profond, doré premium, logo Metrika, univers BTP Maroc). Document de synthèse
pour validation.

---

## 1. Audit de l'existant

**Architecture (saine, conservée).** Next.js 15 (App Router, route groups `(app)`/`(auth)`),
couches claires `routes → src/services/* → lib/ai + lib/pdf-kit`, NextAuth v5 (JWT, middleware
Edge), Prisma double schéma (SQLite local / Postgres prod). Aucune réécriture nécessaire :
le travail a porté sur le **durcissement ciblé**, l'UX et 1 nouvel agent.

**Points corrigés**

| Symptôme | Cause | Correctif |
|---|---|---|
| Lenteur ressentie à la navigation | Pas d'état de chargement | Skeletons serveur (`loading.tsx`) + transition GSAP sobre |
| Assets parfois interceptés | Matcher middleware trop large | Matcher affiné (exclusion `_next`, images, polices, `brand/`) |
| « PDF trop volumineux » bloquant | Garde dure à 3,8 Mo, échec sec | Rastérisation **budgétée** : dégradation auto (qualité/résolution) puis troncature signalée |
| Devise figée (MAD) | Pas de source unique | Store global `useCurrency` (zustand persistant) + switch topbar |
| DPGF : pas de saisie manuelle | Génération IA uniquement | Mode manuel complet (ajout/édition/suppression, lot/unité/notes inline) |
| CCTP long illisible | Sections empilées | Accordéons (déplier/replier tout, 1ʳᵉ section ouverte) |
| Devis > 100 produits inutilisable | `<select>` natif unique | Bibliothèque recherchable/filtrable + ajout en masse + duplication |
| Uploads sans garde-fou | Pas de validation taille/MIME | `upload-guard` (nb/taille/type) + plafond payload images (413) |

---

## 2. Réalisations par phase

- **Phase 0 — Perf & navigation.** `loading.tsx` + `PageSkeleton`, middleware affiné, menu
  latéral clarifié (« Devis » au lieu de « Générateur de devis », ajout « Traduction PDF »,
  « Vue d'ensemble »).
- **Phase 1 — UI/UX + devise globale.** Switch MAD/€ (topbar) propagé aux devis, sous-détail,
  DPGF et à tous les exports (le switch prime sur la fiche société). Transition de route GSAP
  respectant `prefers-reduced-motion`.
- **Phase 2 — Documents.**
  - *CCTP* : accordéons, titre clarifié, rastérisation budgétée des plans.
  - *DPGF* : mode manuel + devise + tableau N°/Désignation/U/Qté/PU HT/Montant HT, export
    PDF paginé (kit existant).
  - *Devis* : panneau bibliothèque (recherche, filtre par catégorie, cases à cocher,
    « Ajouter la sélection »), duplication de ligne, import PDF budgété.
- **Phase 3 — Nouvel agent « Traduction PDF fidèle ».** Extraction texte page par page,
  détection de langue, FR↔EN, structure/nombres/unités préservés, chunking des grosses pages,
  aperçu côte à côte, exports PDF + DOCX. Route `/api/traduction` sous auth.
- **Phase 4 — Tests & sécurité.** Garde-fous uploads, tests Vitest (19) verts, e2e Playwright
  (smoke) prêts.

---

## 3. Fichiers ajoutés / modifiés

**Créés**
- `src/lib/use-currency.ts` — store devise global (persisté)
- `src/components/layout/currency-toggle.tsx` — switch MAD/€
- `src/components/layout/route-transition.tsx` — transition GSAP
- `src/components/ui/skeleton.tsx`, `src/app/(app)/loading.tsx` — états de chargement
- `src/lib/upload-guard.ts` — validation uploads + payload
- `src/services/translation.service.ts`, `src/app/api/traduction/route.ts`,
  `src/app/(app)/agents/traduction/page.tsx`, `src/lib/export-translation.ts` — agent traduction
- `vitest.config.ts`, `playwright.config.ts`, `tests/e2e/smoke.spec.ts`,
  `src/lib/utils.test.ts`, `src/lib/upload-guard.test.ts`

**Modifiés**
- `src/lib/constants.ts` (nav), `src/middleware.ts` (matcher)
- `src/app/(app)/layout.tsx`, `src/components/layout/topbar.tsx`
- `src/lib/pdf-render.ts` (`rasterizePdfBudgeted`, `extractPdfPages`)
- `src/app/(app)/devis/page.tsx`, `src/app/(app)/agents/{dpgf,cctp,sous-detail}/page.tsx`
- `src/app/api/{pdf/merge,pdf/images-to-pdf,cctp/generate,dpgf/convert,devis/extract}/route.ts`

---

## 4. Audit de sécurité — synthèse

- **Auth** : toutes les routes API vérifient `auth()` (401 sinon) ; middleware redirige les
  non connectés. App entièrement privée (aucune page publique).
- **Uploads** : `validateUploads` (≤ 30 fichiers, ≤ 15 Mo/fichier, ≤ 40 Mo total, MIME
  autorisé) ; `JSON.parse` défensif ; plafond payload images base64 → 413.
- **Secrets** : `.env` et `prisma/dev.db*` gitignorés (vérifié à chaque commit). **À faire côté
  utilisateur** : faire tourner la clé Supabase exposée en conversation.
- **Données** : Prisma (requêtes paramétrées, pas d'injection SQL) ; pas de `dangerouslySetInnerHTML`.
- **Pistes restantes** (non bloquantes) : rate-limiting des routes IA, en-têtes CSP, 2FA (déjà
  annoncée « prochainement »).

---

## 5. Commandes

```bash
# Développement
npm run dev

# Qualité
npx tsc --noEmit        # types (vert)
npm run test            # unitaires Vitest (19 tests)
npm run build           # build prod (régénère le client Prisma Postgres)
npx prisma generate     # ⚠ à relancer après un build local pour restaurer le client SQLite

# E2E (nécessite navigateurs + compte de test)
npx playwright install
E2E_EMAIL=admin@metrika.ma E2E_PASSWORD=*** npm run test:e2e
```

> Note build local : `npm run build` régénère le client Prisma vers **Postgres** (cible Vercel).
> En local SQLite, relancer `npx prisma generate` ensuite.

---

## 6. Points à valider manuellement

1. **Switch devise** MAD/€ depuis la topbar → vérifier libellés et exports (devis, DPGF,
   sous-détail) dans les deux devises.
2. **DPGF manuel** : ajouter/éditer/supprimer des lignes, valider, exporter Excel/DOCX/PDF.
3. **CCTP** : générer plusieurs lots, déplier/replier, éditer, valider, exporter.
4. **Devis > 100 produits** : recherche, filtre catégorie, ajout en masse, duplication.
5. **Traduction PDF** : importer un PDF *textuel* FR→EN et EN→FR, vérifier l'aperçu et les
   exports ; tester un PDF *scanné* (message clair attendu).
6. **Gros PDF** (CCTP/plans/import devis) : confirmer la dégradation propre + message « pages
   ignorées » au lieu d'un échec.
7. **Connexion** : identifiants invalides → message clair ; reconnexion sans « accès refusé ».
