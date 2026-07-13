import { test, expect } from "@playwright/test";

// Issue #26 (PR1): deck building advances only once every player marks "done
// uploading" — with a waiting state in between.

const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////" +
  "////////////////////////////////////////////////////////////////////wAA" +
  "LCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8AH//Z";

test("deck advances only after everyone marks done uploading", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const g1Ctx = await browser.newContext();
  const host = await hostCtx.newPage();
  const g1 = await g1Ctx.newPage();

  await host.goto("/index.html");
  await host.click("#create-btn");
  await host.fill("#name-input", "Anne");
  await host.click("#confirm-btn");
  await expect(host.locator("#screen-lobby")).toHaveAttribute("data-active", "true");
  const code = (await host.locator("#code-display").textContent()).trim();

  await g1.goto(`/index.html?room=${code}`);
  await g1.fill("#name-input", "Bo");
  await g1.click("#confirm-btn");
  await expect(g1.locator("#screen-lobby")).toHaveAttribute("data-active", "true");

  await host.click("#start-btn");
  await expect(host.locator("#screen-deck")).toHaveAttribute("data-active", "true");
  await expect(g1.locator("#screen-deck")).toHaveAttribute("data-active", "true");

  // Seed a couple of characters.
  await host.evaluate(
    async ({ code, img }) => {
      const { addCharacter } = await import("@/game/deck.js");
      for (const n of ["Zed", "Mona"]) await addCharacter(code, n, img);
    },
    { code, img: TINY_JPEG }
  );
  await expect(host.locator("#board-grid .tile")).toHaveCount(2);

  // One guesser marks done -> they wait; nobody advances yet.
  await g1.click("#deck-done-btn");
  await expect(g1.locator("#deck-done-btn")).toBeHidden();
  await expect(g1.locator("#deck-waiting")).toBeVisible();
  await expect(g1.locator("#deck-waiting")).toContainText("1/2");
  await expect(g1.locator("#screen-deck")).toHaveAttribute("data-active", "true");
  await expect(host.locator("#deck-done-btn")).toBeVisible(); // host not done yet

  // Host marks done too -> everyone advances.
  await host.click("#deck-done-btn");
  await expect(host.locator("#screen-deck")).toHaveAttribute("data-active", "false");
  await expect(g1.locator("#screen-deck")).toHaveAttribute("data-active", "false");

  // Cleanup.
  await g1.evaluate(async (code) => {
    const { db, authReady, ref, remove } = await import("@/firebase.js");
    const u = await authReady;
    await remove(ref(db, `rooms/${code}/players/${u.uid}`));
  }, code);
  await host.evaluate(async (code) => {
    const { db, authReady, ref, remove } = await import("@/firebase.js");
    const u = await authReady;
    await remove(ref(db, `rooms/${code}/deck`));
    await remove(ref(db, `rooms/${code}/players/${u.uid}`));
    await remove(ref(db, `rooms/${code}/meta`));
  }, code);
  await hostCtx.close();
  await g1Ctx.close();
});
