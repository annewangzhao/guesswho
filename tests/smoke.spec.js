import { test, expect } from "@playwright/test";

// Smoke test: the landing screen renders with its create/join controls.

test("landing screen renders with create/join controls", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page.locator("h1.title")).toHaveText("Guess Who");
  await expect(page.locator(".tagline")).toContainText("party game");

  // Core controls are present and enabled (no longer disabled placeholders).
  await expect(page.locator("#name-input")).toBeVisible();
  await expect(page.locator("#create-btn")).toBeEnabled();
  await expect(page.locator("#join-btn")).toBeEnabled();

  await expect(page.locator("#screen-landing")).toHaveAttribute("data-active", "true");
});

test("invite link prefills the room code", async ({ page }) => {
  await page.goto("/index.html?room=wxyz");
  await expect(page.locator("#code-input")).toHaveValue("WXYZ");
});
