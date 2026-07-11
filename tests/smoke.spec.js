import { test, expect } from "@playwright/test";

// Smoke test: the landing screen renders and the ES module chain boots.
// This is our baseline; interactive/multiplayer tests arrive with later features.

test("landing screen renders and app boots", async ({ page }) => {
  await page.goto("/index.html");

  // Title + tagline present
  await expect(page.locator("h1.title")).toHaveText("Guess Who");
  await expect(page.locator(".tagline")).toContainText("party game");

  // Proves main.js -> screens.js executed (it sets this text after import)
  await expect(page.locator("#build-note")).toHaveText("App loaded ✓");

  // The landing screen is the active one
  await expect(page.locator("#screen-landing")).toHaveAttribute("data-active", "true");
});
