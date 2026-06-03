# Metrika Métrage BTP Maroc

Plateforme SaaS privée et premium pour piloter des **agents IA spécialisés dans les documents BTP** au Maroc : traitement PDF, génération de CCTP, conversion en DPGF, sous-détails de prix, bibliothèque de prix et génération de devis.

Application mono-utilisateur, sécurisée, en français, aux couleurs de la marque Metrika (bleu marine + doré).

---

## 1. Stack technique

| Domaine            | Technologie                                          |
|--------------------|------------------------------------------------------|
| Framework          | Next.js 15 (App Router) + TypeScript                 |
| UI                 | Tailwind CSS + shadcn/ui (style new-york)            |
| Base de données    | PostgreSQL via Prisma                                |
| Authentification   | Auth.js (NextAuth 5) — Credentials + bcrypt          |
| IA                 | Anthropic SDK (Claude)                               |
| PDF                | pdf-lib + sharp                                      |
| Exports            | docx, ExcelJS (à finaliser)                          |
| Graphiques         | Recharts                                            |

---

## 2. Démarrage rapide

### Prérequis
- Node.js 18.18+ (recommandé : 20+)
- Une base PostgreSQL accessible
- Une clé API Anthropic

### Installation

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer l'environnement
cp .env.example .env
#   puis éditer .env (voir section 3)

# 3. Initialiser la base de données
npm run db:push      # crée les tables à partir du schéma Prisma
npm run db:seed      # crée l'utilisateur admin + société + prix de démarrage

# 4. Lancer en développement
npm run dev
```

L'application est disponible sur `http://localhost:3000`.
La page de connexion redirige automatiquement ; toute l'application est verrouillée derrière l'authentification.

### Scripts disponibles
- `npm run dev` — serveur de développement
- `npm run build` / `npm run start` — production
- `npm run db:push` — applique le schéma Prisma à la base
- `npm run db:seed` — données initiales (admin, société, prix)
- `npm run db:studio` — interface Prisma Studio

---

## 3. Variables d'environnement (`.env`)

```
DATABASE_URL="postgresql://user:password@localhost:5432/metrika"
AUTH_SECRET="<générer avec: openssl rand -base64 32>"
ADMIN_EMAIL="admin@metrika.ma"
ADMIN_PASSWORD="MetrikaMaroc2026!"
ANTHROPIC_API_KEY="sk-ant-..."
ANTHROPIC_MODEL="claude-sonnet-4-6"
STORAGE_DRIVER="local"
```

> Les identifiants admin par défaut sont créés au `db:seed`. **Changez le mot de passe** après la première connexion (et idéalement avant, dans `.env`).

---

## 4. Architecture

```
src/
├── app/
│   ├── (auth)/login/          # Connexion sécurisée
│   ├── (app)/                 # Espace authentifié (sidebar + topbar)
│   │   ├── dashboard/         # Vue d'ensemble : KPI, activité, historique
│   │   ├── agents/            # Vue des agents + 4 agents IA
│   │   │   ├── pdf/           # Agent 1 : fusion / images→PDF / compression
│   │   │   ├── cctp/          # Agent 2 : génération de CCTP par lot
│   │   │   ├── dpgf/          # Agent 3 : conversion CCTP → DPGF
│   │   │   └── sous-detail/   # Agent 4 : sous-détail de prix
│   │   ├── bibliotheque-prix/ # Référentiel de prix + recherche + IA
│   │   ├── devis/             # Générateur de devis premium
│   │   └── parametres/        # Fiche entreprise (mentions légales Maroc)
│   └── api/                   # Routes API (auth, pdf, cctp, dpgf, sous-detail, pricing)
├── components/
│   ├── ui/                    # Composants shadcn (button, card, input…)
│   ├── layout/                # Logo, sidebar, topbar
│   └── dashboard/             # PageHeader, StatCard, ActivityChart
├── lib/
│   ├── auth.ts                # Configuration Auth.js
│   ├── prisma.ts              # Client Prisma
│   ├── constants.ts           # Lots BTP, unités, navigation
│   ├── utils.ts               # formatMAD, formatDate, numérotation devis
│   └── ai/
│       ├── client.ts          # Wrapper Claude (runClaude)
│       └── prompts/           # Prompts système des 4 agents
├── services/                  # Logique métier (pdf, cctp, dpgf, pricing, sous-detail, quote, storage)
├── types/                     # Types partagés
└── middleware.ts              # Verrou d'authentification global
prisma/
├── schema.prisma             # Schéma PostgreSQL complet
└── seed.ts                   # Données initiales
```

---

## 5. Les agents IA

1. **PDF & Images** — fusionner plusieurs PDF, réorganiser, convertir des images en PDF, compresser, ajouter logo/en-tête/pied de page. *(Fonctionnel)*
2. **Générateur de CCTP** — sélection multi-lots → CCTP structuré (clauses, prescriptions, normes, mise en œuvre, réception), éditable, validation par section avant export. *(Fonctionnel)*
3. **Conversion CCTP → DPGF** — extraction des ouvrages, proposition de quantités, tableau éditable avec totaux MAD, validation ligne par ligne. *(Fonctionnel)*
4. **Sous-détail de prix** — décomposition main-d'œuvre / matériaux / matériel, rendement, déboursé sec, frais généraux, bénéfice, prix de vente. *(Fonctionnel)*

Tous les agents respectent le principe de **validation humaine obligatoire** : aucun document officiel n'est exporté sans validation explicite (badges « À valider / Validé », exports verrouillés tant que la validation n'est pas faite).

---

## 6. État & prochaines étapes

**Opérationnel** : authentification, dashboard, agent PDF, agents CCTP/DPGF/sous-détail, bibliothèque de prix (recherche + proposition IA), générateur de devis (aperçu premium), paramètres entreprise.

**À finaliser (câblage)** :
- Exports DOCX / PDF / Excel des CCTP, DPGF, sous-détails et devis (services `docx` et `ExcelJS` à brancher sur les boutons d'export, qui affichent aujourd'hui un message).
- Persistance en base des résultats d'agents et de la fiche entreprise (routes API + Prisma).
- Import Excel de la bibliothèque de prix + historique des prix.
- Téléversement du logo et du cachet (service de stockage, local puis S3).
- 2FA (évolution prévue).

---

## 7. Sécurité

- Accès strictement privé : le `middleware` verrouille toutes les routes hors `/login` et `/api/auth`.
- Mots de passe hachés (bcrypt), session JWT.
- Aucun accès public, un seul utilisateur autorisé.

---

*Metrika Métrage BTP Maroc — application professionnelle pour le BTP au Maroc.*
