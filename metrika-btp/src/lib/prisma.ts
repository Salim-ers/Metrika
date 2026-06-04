import { PrismaClient } from "@prisma/client";

/**
 * Construit l'URL de connexion. Pour les poolers serverless (Supabase Supavisor
 * port 6543, Neon -pooler), Prisma a besoin de `pgbouncer=true` (désactive les
 * prepared statements) sinon il plante avec « prepared statement already exists ».
 * On l'ajoute automatiquement s'il manque → fonctionne quel que soit le format
 * de DATABASE_URL collé dans Vercel.
 */
function resolveUrl(): string | undefined {
  let url = process.env.DATABASE_URL;
  if (!url || !/^postgres/i.test(url)) return url; // SQLite local : inchangé
  const isPooler = /pooler\.supabase\.com|-pooler\.|:6543/i.test(url);
  if (isPooler && !/[?&]pgbouncer=/i.test(url)) {
    url += (url.includes("?") ? "&" : "?") + "pgbouncer=true";
  }
  return url;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: resolveUrl(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
