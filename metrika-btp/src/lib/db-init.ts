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
  const passwordHash = await bcrypt.hash(password, 12);

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

  // Seed seulement si aucun utilisateur (évite le travail à chaque démarrage).
  let userCount = 0;
  try {
    userCount = await prisma.user.count();
  } catch {
    userCount = 0;
  }
  if (userCount === 0) {
    console.log("[db-init] seed des données de départ…");
    await seed();
  }

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
