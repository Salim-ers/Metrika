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
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, name: "Administrateur Metrika", passwordHash, role: "ADMIN" },
  });

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
