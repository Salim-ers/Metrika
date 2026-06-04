import { test, expect } from "@playwright/test";

/**
 * Scénarios critiques Metrika. Nécessite un serveur lancé (webServer auto) et
 * un compte admin renseigné via E2E_EMAIL / E2E_PASSWORD.
 *
 *   E2E_EMAIL=admin@metrika.ma E2E_PASSWORD=... npm run test:e2e
 */
const EMAIL = process.env.E2E_EMAIL ?? "admin@metrika.ma";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

test.describe("Authentification & navigation", () => {
  test("redirige les visiteurs non connectés vers /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /Connexion sécurisée/i })).toBeVisible();
  });

  test("refuse des identifiants invalides", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", "faux@exemple.com");
    await page.fill("#password", "mauvais-mot-de-passe");
    await page.getByRole("button", { name: /Se connecter/i }).click();
    await expect(page.getByText(/Accès refusé/i)).toBeVisible();
  });

  // Les scénarios authentifiés ne tournent que si un mot de passe de test est fourni.
  test.describe("Session authentifiée", () => {
    test.skip(!PASSWORD, "Définir E2E_PASSWORD pour exécuter les scénarios connectés.");

    test.beforeEach(async ({ page }) => {
      await page.goto("/login");
      await page.fill("#email", EMAIL);
      await page.fill("#password", PASSWORD);
      await page.getByRole("button", { name: /Se connecter/i }).click();
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test("navigue vers les agents documentaires", async ({ page }) => {
      for (const [href, heading] of [
        ["/agents/cctp", /CCTP/i],
        ["/agents/dpgf", /DPGF/i],
        ["/agents/traduction", /Traduction/i],
        ["/devis", /Devis/i],
      ] as const) {
        await page.goto(href);
        await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      }
    });

    test("bascule la devise globale MAD ↔ €", async ({ page }) => {
      await page.goto("/devis");
      // Le toggle de devise est dans la barre supérieure.
      await page.getByRole("button", { name: "€" }).click();
      await expect(page.getByText(/P\.U\. \(€\)/).first()).toBeVisible();
      await page.getByRole("button", { name: "MAD" }).click();
      await expect(page.getByText(/P\.U\. \(MAD\)/).first()).toBeVisible();
    });

    test("ajoute une ligne DPGF manuelle", async ({ page }) => {
      await page.goto("/agents/dpgf");
      await page.getByRole("button", { name: /Saisir manuellement|Ajouter une ligne manuelle/i }).first().click();
      await expect(page.getByPlaceholder(/Désignation de l’ouvrage/i).first()).toBeVisible();
    });
  });
});
