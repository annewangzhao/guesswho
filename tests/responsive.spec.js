import { test, expect } from "@playwright/test";

// Issue #5: the board is a centered, auto-fitting grid that stays legible from
// a handful of characters up to many.

const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////" +
  "////////////////////////////////////////////////////////////////////wAA" +
  "LCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8AH//Z";

test("board grid is centered and renders many tiles legibly", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

  await page.goto("/index.html");
  await page.click("#create-btn");
  await page.fill("#name-input", "Anne");
  await page.click("#confirm-btn");
  await expect(page.locator("#screen-lobby")).toHaveAttribute("data-active", "true");
  const code = (await page.locator("#code-display").textContent()).trim();

  await page.click("#start-btn");
  await expect(page.locator("#screen-deck")).toHaveAttribute("data-active", "true");
  await page.evaluate(
    async ({ code, img }) => {
      const { addCharacter } = await import("@/game/deck.js");
      for (let i = 0; i < 24; i++) await addCharacter(code, "P" + (i + 1), img);
    },
    { code, img: TINY_JPEG }
  );

  // All 24 tiles render.
  await expect(page.locator("#board-grid .tile")).toHaveCount(24);

  // The grid is centered (blank space splits evenly rather than left-aligning).
  const justify = await page.evaluate(
    () => getComputedStyle(document.getElementById("board-grid")).justifyContent
  );
  expect(justify).toBe("center");

  // Tiles stay within a legible width band (not stretched huge, not tiny).
  const w = await page.locator("#board-grid .tile").first().evaluate((el) => el.getBoundingClientRect().width);
  expect(w).toBeGreaterThanOrEqual(100);
  expect(w).toBeLessThanOrEqual(160);

  await page.evaluate(async (code) => {
    const { db, authReady, ref, remove } = await import("@/firebase.js");
    await authReady;
    await remove(ref(db, `rooms/${code}/deck`));
    await remove(ref(db, `rooms/${code}/meta`));
  }, code);
});
