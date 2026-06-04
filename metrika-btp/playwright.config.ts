import { defineConfig, devices } from "@playwright/test";

/**
 * Tests end-to-end Metrika. Démarre l'app en local et exécute les scénarios
 * critiques (connexion, navigation, agents). Identifiants pris depuis l'env :
 *   E2E_BASE_URL  (def. http://localhost:3000)
 *   E2E_EMAIL / E2E_PASSWORD  (compte admin de test)
 *
 * Lancement : npx playwright install && npm run test:e2e
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Démarre le serveur si aucun n'écoute déjà (réutilise un dev server existant).
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
