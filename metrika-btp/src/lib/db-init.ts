import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { SCHEMA_SQL } from "@/lib/db-schema-sql";

/**
 * Auto-initialisation de la base en production (Vercel + Neon).
 *
 * Au lieu de lancer `prisma db push` + `seed` pendant le build Vercel
 * (étape fragile qui dépend de la connexion directe), on crée le schéma
 * et les données de départ au PREMIER accès serveur, via la connexion
 * runtime déjà fonctionnelle. Idempotent et mis en cache par instance.
 *
 * En local (SQLite), les tables existent déjà : le SELECT réussit et
 * cette fonction ne fait rien (le DDL Postgres n'est jamais exécuté).
 */
let ready = false;
let initPromise: Promise<void> | null = null;

function statements(): string[] {
  return SCHEMA_SQL.split(";")
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter((s) => s.length > 0);
}

async function createSchema() {
  for (const stmt of statements()) {
    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (e) {
      // Idempotence : on ignore "already exists" sur ré-exécution partielle.
      console.warn("[db-init] statement ignoré:", (e as Error).message?.slice(0, 120));
    }
  }
}

async function seed() {
  const email = process.env.ADMIN_EMAIL ?? "admin@metrika.ma";
  const password = process.env.ADMIN_PASSWORD ?? "MetrikaMaroc2026!";

  // Le hachage bcrypt (~100 ms CPU) ne doit PAS être payé à chaque démarrage
  // d'instance : on (re)synchronise le mot de passe seulement si l'admin est
  // absent, ou si RESEED_ADMIN=1 est explicitement demandé (changement de MDP).
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!existing || process.env.RESEED_ADMIN === "1") {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, name: "Administrateur Metrika", passwordHash, role: "ADMIN" },
    });
  }

  if (!(await prisma.company.findFirst())) {
    await prisma.company.create({
      data: {
        name: "Metrika Métrage BTP",
        legalForm: "SARL",
        city: "Casablanca",
        email: "contact@metrika.ma",
        vatRate: 20,
        quotePrefix: "DEV",
        paymentTerms:
          "Paiement à 30 jours. Devis valable 30 jours. TVA 20% applicable.",
      },
    });
  }

  if ((await prisma.priceItem.count()) === 0) {
    const seedPrices = [
      { designation: "Béton armé dosé à 350 kg/m³", unit: "m³", unitPrice: 1100, lot: "Gros Œuvre", category: "Béton" },
      { designation: "Maçonnerie agglos creux 20 cm", unit: "m²", unitPrice: 120, lot: "Gros Œuvre", category: "Maçonnerie" },
      { designation: "Enduit ciment sur murs", unit: "m²", unitPrice: 65, lot: "Revêtements", category: "Enduit" },
      { designation: "Carrelage grès cérame 60x60", unit: "m²", unitPrice: 180, lot: "Revêtements", category: "Sol" },
      { designation: "Peinture vinylique 2 couches", unit: "m²", unitPrice: 35, lot: "Peinture", category: "Mur" },
    ];
    for (const p of seedPrices) {
      await prisma.priceItem.create({ data: { ...p, sellingPrice: Math.round(p.unitPrice * 1.21) } });
    }
  }
}

/**
 * Évolutions de schéma idempotentes (PostgreSQL only). Ajoute les colonnes
 * récentes aux bases déjà créées, sans migration manuelle. En local (SQLite)
 * ces évolutions passent par `prisma db push`.
 */
async function ensureColumns() {
  if (!/^postgres/i.test(process.env.DATABASE_URL ?? "")) return;
  const run = async (sql: string) => {
    try { await prisma.$executeRawUnsafe(sql); }
    catch (e) { console.warn("[db-init] migration ignorée:", (e as Error).message?.slice(0, 120)); }
  };

  // Une seule requête pour savoir si une migration est nécessaire → sinon on
  // sort immédiatement (cas normal en régime établi : démarrage rapide).
  let needCols = true;
  let roleIsText = false;
  try {
    const rows = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE (table_name = 'Company' AND column_name = 'currency')
          OR (table_name = 'User' AND column_name = 'role')`,
    );
    needCols = !rows.some((r) => r.column_name === "currency");
    const role = rows.find((r) => r.column_name === "role");
    roleIsText = !role || role.data_type === "text";
  } catch { /* en cas de doute, on tente les migrations */ }
  if (!needCols && roleIsText) return; // base à jour → rien à faire

  // Colonnes récentes (pays / devise / identifiants France).
  if (needCols) for (const a of [
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "country" TEXT NOT NULL DEFAULT 'Maroc'`,
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'MAD'`,
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "siret" TEXT`,
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "vatNumber" TEXT`,
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "ape" TEXT`,
  ]) await run(a);

  if (roleIsText) return; // colonnes ajoutées ; pas de conversion enum à faire

  console.log("[db-init] ancien schéma détecté (enum) → conversion en TEXT…");
  const toText = (tbl: string, col: string, def?: string) => [
    ...(def !== undefined ? [`ALTER TABLE "${tbl}" ALTER COLUMN "${col}" DROP DEFAULT`] : []),
    `ALTER TABLE "${tbl}" ALTER COLUMN "${col}" TYPE TEXT USING "${col}"::text`,
    ...(def !== undefined ? [`ALTER TABLE "${tbl}" ALTER COLUMN "${col}" SET DEFAULT '${def}'`] : []),
  ];
  const conversions = [
    ...toText("User", "role", "ADMIN"),
    ...toText("Document", "kind"),
    ...toText("Document", "status", "DRAFT"),
    ...toText("Treatment", "agent"),
    ...toText("Treatment", "status", "QUEUED"),
    ...toText("Treatment", "inputMeta"),
    ...toText("Treatment", "outputMeta"),
    ...toText("Cctp", "status", "DRAFT"),
    ...toText("Dpgf", "status", "PENDING_REVIEW"),
    ...toText("SousDetail", "status", "DRAFT"),
    ...toText("SousDetailComponent", "type"),
  ];
  for (const s of conversions) await run(s);
}

/**
 * Migration idempotente du module Clients/CRM (PostgreSQL). Ajoute les colonnes
 * récentes au modèle Client et crée la table ClientDocument sur les bases déjà
 * existantes. Une seule vérification (Client.type) pour sortir vite en régime établi.
 */
async function ensureClientCrm() {
  if (!/^postgres/i.test(process.env.DATABASE_URL ?? "")) return;
  const run = async (sql: string) => {
    try { await prisma.$executeRawUnsafe(sql); }
    catch (e) { console.warn("[db-init] migration CRM ignorée:", (e as Error).message?.slice(0, 120)); }
  };
  let hasType = false;
  try {
    const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'Client' AND column_name = 'type'`,
    );
    hasType = rows.length > 0;
  } catch { /* en cas de doute, on tente la migration */ }
  if (hasType) return;

  for (const sql of [
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "type" TEXT`,
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PROSPECT'`,
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "company" TEXT`,
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "region" TEXT`,
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "website" TEXT`,
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "notes" TEXT`,
    `CREATE TABLE IF NOT EXISTS "ClientDocument" (
        "id" TEXT NOT NULL,
        "clientId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "category" TEXT,
        "mimeType" TEXT,
        "size" INTEGER,
        "dataUrl" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ClientDocument_pkey" PRIMARY KEY ("id")
     )`,
    `CREATE INDEX IF NOT EXISTS "ClientDocument_clientId_idx" ON "ClientDocument"("clientId")`,
    `ALTER TABLE "ClientDocument" ADD CONSTRAINT "ClientDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  ]) await run(sql);
}

/**
 * Migration idempotente « Refonte Document Intelligence » (PostgreSQL).
 * Ajoute les colonnes de traçabilité/versionnage et les nouvelles tables
 * (ProjectActor, ValidationIssue, DocumentVersion, ExportJob, PriceLibrary,
 * ReferenceDoc) aux bases déjà créées. Sentinelle : Cctp.jurisdiction.
 */
async function ensureRefonte2026() {
  if (!/^postgres/i.test(process.env.DATABASE_URL ?? "")) return;
  const run = async (sql: string) => {
    try { await prisma.$executeRawUnsafe(sql); }
    catch (e) { console.warn("[db-init] migration refonte ignorée:", (e as Error).message?.slice(0, 120)); }
  };
  try {
    const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'Cctp' AND column_name = 'jurisdiction'`,
    );
    if (rows.length > 0) return; // base à jour
  } catch { /* en cas de doute, on tente la migration */ }

  for (const sql of [
    // Project — pilotage / juridiction
    `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "description" TEXT`,
    `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'EN_COURS'`,
    `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "jurisdiction" TEXT NOT NULL DEFAULT 'Maroc'`,
    `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "currency" TEXT`,
    `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "vatRate" DOUBLE PRECISION`,
    // Document — pièces sources identifiées
    `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "category" TEXT`,
    `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "pages" INTEGER`,
    `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "extractedText" TEXT`,
    // Cctp — mode / juridiction / méta / version
    `ALTER TABLE "Cctp" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'fidele'`,
    `ALTER TABLE "Cctp" ADD COLUMN IF NOT EXISTS "jurisdiction" TEXT NOT NULL DEFAULT 'Maroc'`,
    `ALTER TABLE "Cctp" ADD COLUMN IF NOT EXISTS "meta" TEXT`,
    `ALTER TABLE "Cctp" ADD COLUMN IF NOT EXISTS "planContext" TEXT`,
    `ALTER TABLE "Cctp" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE "Cctp" ADD COLUMN IF NOT EXISTS "indice" TEXT NOT NULL DEFAULT 'A'`,
    `ALTER TABLE "CctpSection" ADD COLUMN IF NOT EXISTS "validated" BOOLEAN NOT NULL DEFAULT false`,
    // Dpgf — mode / provisoire / devise / version
    `ALTER TABLE "Dpgf" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'dpgf'`,
    `ALTER TABLE "Dpgf" ADD COLUMN IF NOT EXISTS "provisional" BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE "Dpgf" ADD COLUMN IF NOT EXISTS "currency" TEXT`,
    `ALTER TABLE "Dpgf" ADD COLUMN IF NOT EXISTS "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 20`,
    `ALTER TABLE "Dpgf" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE "Dpgf" ADD COLUMN IF NOT EXISTS "indice" TEXT NOT NULL DEFAULT 'A'`,
    // DpgfLine — traçabilité complète + lien article CCTP
    `ALTER TABLE "DpgfLine" ADD COLUMN IF NOT EXISTS "status" TEXT`,
    `ALTER TABLE "DpgfLine" ADD COLUMN IF NOT EXISTS "confidence" TEXT`,
    `ALTER TABLE "DpgfLine" ADD COLUMN IF NOT EXISTS "sourceExcerpt" TEXT`,
    `ALTER TABLE "DpgfLine" ADD COLUMN IF NOT EXISTS "calculation" TEXT`,
    `ALTER TABLE "DpgfLine" ADD COLUMN IF NOT EXISTS "priceSource" TEXT`,
    `ALTER TABLE "DpgfLine" ADD COLUMN IF NOT EXISTS "comment" TEXT`,
    `ALTER TABLE "DpgfLine" ADD COLUMN IF NOT EXISTS "cctpSectionId" TEXT`,
    `ALTER TABLE "DpgfLine" ADD COLUMN IF NOT EXISTS "cctpArticle" TEXT`,
    `ALTER TABLE "DpgfLine" ADD COLUMN IF NOT EXISTS "locked" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "DpgfLine" ADD CONSTRAINT "DpgfLine_cctpSectionId_fkey" FOREIGN KEY ("cctpSectionId") REFERENCES "CctpSection"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    // SousDetail — pertes / cible / traçabilité
    `ALTER TABLE "SousDetail" ADD COLUMN IF NOT EXISTS "lot" TEXT`,
    `ALTER TABLE "SousDetail" ADD COLUMN IF NOT EXISTS "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "SousDetail" ADD COLUMN IF NOT EXISTS "wasteRate" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "SousDetail" ADD COLUMN IF NOT EXISTS "targetPrice" DOUBLE PRECISION`,
    `ALTER TABLE "SousDetail" ADD COLUMN IF NOT EXISTS "hypotheses" TEXT`,
    `ALTER TABLE "SousDetail" ADD COLUMN IF NOT EXISTS "sources" TEXT`,
    `ALTER TABLE "SousDetail" ADD COLUMN IF NOT EXISTS "pointsToVerify" TEXT`,
    `ALTER TABLE "SousDetail" ADD COLUMN IF NOT EXISTS "validated" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "SousDetail" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "SousDetailComponent" ADD COLUMN IF NOT EXISTS "costSource" TEXT`,
    // PriceItem — rattachement bibliothèque
    `ALTER TABLE "PriceItem" ADD COLUMN IF NOT EXISTS "libraryId" TEXT`,
    // Nouvelles tables
    `CREATE TABLE IF NOT EXISTS "ProjectActor" (
        "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "role" TEXT NOT NULL,
        "value" TEXT NOT NULL, "sourceFile" TEXT, "sourcePage" TEXT,
        "confidence" TEXT NOT NULL DEFAULT 'medium', "status" TEXT NOT NULL DEFAULT 'missing',
        "notes" TEXT,
        CONSTRAINT "ProjectActor_pkey" PRIMARY KEY ("id")
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ProjectActor_projectId_role_key" ON "ProjectActor"("projectId", "role")`,
    `ALTER TABLE "ProjectActor" ADD CONSTRAINT "ProjectActor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `CREATE TABLE IF NOT EXISTS "PriceLibrary" (
        "id" TEXT NOT NULL, "name" TEXT NOT NULL,
        "jurisdiction" TEXT NOT NULL DEFAULT 'Maroc', "currency" TEXT NOT NULL DEFAULT 'MAD',
        "version" TEXT NOT NULL DEFAULT '1', "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PriceLibrary_pkey" PRIMARY KEY ("id")
     )`,
    `ALTER TABLE "PriceItem" ADD CONSTRAINT "PriceItem_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "PriceLibrary"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    `CREATE TABLE IF NOT EXISTS "ReferenceDoc" (
        "id" TEXT NOT NULL, "jurisdiction" TEXT NOT NULL, "lot" TEXT,
        "code" TEXT NOT NULL, "title" TEXT NOT NULL, "version" TEXT,
        "status" TEXT NOT NULL DEFAULT 'active',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ReferenceDoc_pkey" PRIMARY KEY ("id")
     )`,
    `CREATE INDEX IF NOT EXISTS "ReferenceDoc_jurisdiction_lot_idx" ON "ReferenceDoc"("jurisdiction", "lot")`,
    `CREATE TABLE IF NOT EXISTS "ValidationIssue" (
        "id" TEXT NOT NULL, "projectId" TEXT, "docType" TEXT NOT NULL, "docId" TEXT,
        "severity" TEXT NOT NULL DEFAULT 'info', "kind" TEXT NOT NULL, "message" TEXT NOT NULL,
        "context" TEXT, "resolved" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMP(3),
        CONSTRAINT "ValidationIssue_pkey" PRIMARY KEY ("id")
     )`,
    `CREATE INDEX IF NOT EXISTS "ValidationIssue_docType_docId_idx" ON "ValidationIssue"("docType", "docId")`,
    `CREATE INDEX IF NOT EXISTS "ValidationIssue_projectId_resolved_idx" ON "ValidationIssue"("projectId", "resolved")`,
    `ALTER TABLE "ValidationIssue" ADD CONSTRAINT "ValidationIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    `CREATE TABLE IF NOT EXISTS "DocumentVersion" (
        "id" TEXT NOT NULL, "docType" TEXT NOT NULL, "docId" TEXT NOT NULL,
        "version" INTEGER NOT NULL, "indice" TEXT, "trigger" TEXT NOT NULL,
        "payload" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
     )`,
    `CREATE INDEX IF NOT EXISTS "DocumentVersion_docType_docId_idx" ON "DocumentVersion"("docType", "docId")`,
    `CREATE TABLE IF NOT EXISTS "ExportJob" (
        "id" TEXT NOT NULL, "docType" TEXT NOT NULL, "docId" TEXT,
        "format" TEXT NOT NULL, "filename" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'DONE', "projectId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
     )`,
    `CREATE INDEX IF NOT EXISTS "ExportJob_projectId_idx" ON "ExportJob"("projectId")`,
    `ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  ]) await run(sql);
}

async function doInit() {
  let tablesExist = true;
  try {
    await prisma.$queryRawUnsafe('SELECT 1 FROM "User" LIMIT 1');
  } catch {
    tablesExist = false;
  }

  if (!tablesExist) {
    console.log("[db-init] tables absentes → création du schéma…");
    await createSchema();
  }
  await ensureColumns();
  await ensureClientCrm();
  await ensureRefonte2026();

  // Seed à chaque démarrage d'instance (mis en cache par `ready`, donc au plus
  // une fois par instance) : l'admin est resynchronisé avec ADMIN_EMAIL /
  // ADMIN_PASSWORD via un upsert idempotent — indispensable pour que la
  // connexion reflète toujours les variables d'environnement actuelles.
  // La société et la bibliothèque de prix ne sont créées que si absentes.
  try { await seed(); } catch (e) { console.warn("[db-init] seed:", (e as Error).message?.slice(0, 160)); }

  ready = true;
}

/** À appeler avant tout accès base. Sûr à appeler plusieurs fois / en parallèle. */
export async function ensureDb(): Promise<void> {
  if (ready) return;
  if (!initPromise) {
    initPromise = doInit().catch((e) => {
      // On ne bloque pas l'instance : les requêtes remonteront leurs propres erreurs.
      initPromise = null;
      console.error("[db-init] échec:", (e as Error).message);
    });
  }
  await initPromise;
}
