import { test, expect } from "@playwright/test";

// The core of issue #3: three players (host + 2 guessers) in separate browser
// contexts join one room and all see the same live, synced player list.

async function removeSelf(page, code) {
  await page.evaluate(async (code) => {
    const { db, authReady, ref, remove } = await import("/src/firebase.js");
    const u = await authReady;
    await remove(ref(db, `rooms/${code}/players/${u.uid}`));
  }, code);
}

test("three players join one room with a live, synced roster", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const g1Ctx = await browser.newContext();
  const g2Ctx = await browser.newContext();
  const host = await hostCtx.newPage();
  const g1 = await g1Ctx.newPage();
  const g2 = await g2Ctx.newPage();

  // --- Host creates a room (home -> Create -> name step -> lobby) ---
  await host.goto("/index.html");
  await host.click("#create-btn");
  await host.fill("#name-input", "Anne");
  await host.click("#confirm-btn");
  await expect(host.locator("#screen-lobby")).toHaveAttribute("data-active", "true");

  const code = (await host.locator("#code-display").textContent()).trim();
  expect(code).toMatch(/^[A-Z0-9]{4}$/);

  await expect(host.locator("#start-btn")).toBeVisible();      // host control
  await expect(host.locator(".player-item")).toHaveCount(1);   // just the host so far

  // --- Two guessers join via the invite link (lands on the name step) ---
  await g1.goto(`/index.html?room=${code}`);
  await g1.fill("#name-input", "Bo");
  await g1.click("#confirm-btn");
  await expect(g1.locator("#screen-lobby")).toHaveAttribute("data-active", "true");

  await g2.goto(`/index.html?room=${code}`);
  await g2.fill("#name-input", "Cai");
  await g2.click("#confirm-btn");
  await expect(g2.locator("#screen-lobby")).toHaveAttribute("data-active", "true");

  // --- All three see the full roster, live ---
  for (const pg of [host, g1, g2]) {
    await expect(pg.locator(".player-item")).toHaveCount(3);
  }
  for (const name of ["Anne", "Bo", "Cai"]) {
    await expect(host.locator("#player-list")).toContainText(name);
  }

  // Exactly one host; only the host sees Start, guessers see the waiting note.
  await expect(host.locator(".player-tag")).toHaveCount(1);
  await expect(g1.locator("#start-btn")).toBeHidden();
  await expect(g1.locator("#waiting-note")).toBeVisible();

  // --- Presence: a guesser leaving shows as offline for the others ---
  await removeSelf(g2, code); // clean removal (also exercises the own-player write rule)
  await g2Ctx.close();
  await expect(host.locator(".player-item")).toHaveCount(2);

  // --- Host starts the game -> phase advances for everyone ---
  await host.click("#start-btn");
  // Poll from the guesser's context until the phase write propagates.
  await expect
    .poll(
      () =>
        g1.evaluate(async (code) => {
          const { db, ref, get } = await import("/src/firebase.js");
          const snap = await get(ref(db, `rooms/${code}/meta/phase`));
          return snap.val();
        }, code),
      { timeout: 5000 }
    )
    .toBe("deckBuilding");

  // --- Cleanup ---
  await removeSelf(g1, code);
  await host.evaluate(async (code) => {
    const { db, authReady, ref, remove } = await import("/src/firebase.js");
    const u = await authReady;
    await remove(ref(db, `rooms/${code}/players/${u.uid}`));
    await remove(ref(db, `rooms/${code}/meta`));
  }, code);

  await hostCtx.close();
  await g1Ctx.close();
});
