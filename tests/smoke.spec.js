import { test, expect } from "@playwright/test";

// Smoke test: home shows join + create; name step is its own screen.

test("home shows join-with-code and create controls", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page.locator("h1.title")).toHaveText("Guess Who");
  await expect(page.locator("#code-input")).toBeVisible();
  await expect(page.locator("#join-btn")).toBeEnabled();
  await expect(page.locator("#create-btn")).toBeEnabled();
  await expect(page.locator("#screen-landing")).toHaveAttribute("data-active", "true");
});

test("create goes to the name step", async ({ page }) => {
  await page.goto("/index.html");
  await page.click("#create-btn");
  await expect(page.locator("#screen-name")).toHaveAttribute("data-active", "true");
  await expect(page.locator("#name-context")).toHaveText("Create a room");
});

test("invite link jumps straight to the name step for that room", async ({ page }) => {
  await page.goto("/index.html?room=wxyz");
  await expect(page.locator("#screen-name")).toHaveAttribute("data-active", "true");
  await expect(page.locator("#name-context")).toContainText("WXYZ");
});
