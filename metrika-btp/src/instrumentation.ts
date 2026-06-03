/**
 * Hook d'instrumentation Next.js : exécuté une fois au démarrage du
 * serveur (runtime Node). On y déclenche l'auto-initialisation de la base
 * (création du schéma + seed) pour que l'app soit opérationnelle dès le
 * 1er déploiement, sans étape DB pendant le build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureDb } = await import("@/lib/db-init");
    await ensureDb();
  }
}
