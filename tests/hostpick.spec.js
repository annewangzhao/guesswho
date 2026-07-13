import { test, expect } from "@playwright/test";

// Issue #7: the host secretly picks the target. The pick is stored host-only
// (guessers can't read it), and guessers see a waiting view.

// Seed the deck directly (a tiny valid JPEG data URL) to keep the test focused.
const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////" +
  "////////////////////////////////////////////////////////////////////wAA" +
  "LCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8AH//Z";

async function seedDeck(page, code, names) {
  await page.evaluate(
    async ({ code, names, img }) => {
      const { addCharacter } = await import("@/game/deck.js");
      for (const n of names) await addCharacter(code, n, img);
    },
    { code, names, img: TINY_JPEG }
  );
}

test("host picks a target that guessers cannot see", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const g1Ctx = await browser.newContext();
  const host = await hostCtx.newPage();
  const g1 = await g1Ctx.newPage();

  // Set up a room with a host + guesser.
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

  // Deck + advance to deckBuilding then hostPick.
  await host.click("#start-btn");
  await expect(host.locator("#screen-deck")).toHaveAttribute("data-active", "true");
  await seedDeck(host, code, ["Zed", "Mona", "Cy"]);
  await expect(host.locator("#board-grid .tile")).toHaveCount(3);
  // Everyone marks done uploading -> auto-advance.
  await g1.click("#deck-done-btn");
  await host.click("#deck-done-btn");

  // Host sees the gallery; guesser sees the waiting view.
  await expect(host.locator("#pick-host")).toBeVisible();
  await expect(host.locator("#pick-grid .pick-tile")).toHaveCount(3);
  await expect(g1.locator("#pick-waiting")).toBeVisible();
  await expect(g1.locator("#pick-host")).toBeHidden();
  await expect(g1.locator("#pick-host-name")).toHaveText("Anne");

  // Host picks the second character.
  const secondName = await host.locator("#pick-grid .pick-tile .tile-name").nth(1).textContent();
  await host.locator("#pick-grid .pick-tile").nth(1).click();

  // The pick minimizes to the bottom bar with the right name, and is marked selected.
  await expect(host.locator("#pick-bar")).toBeVisible();
  await expect(host.locator("#pick-target-name")).toHaveText(secondName);
  await expect(host.locator("#pick-grid .pick-tile.is-selected")).toHaveCount(1);

  // The target is actually stored and the HOST can read it back.
  const stored = await host.evaluate(async (code) => {
    const { db, ref, get } = await import("@/firebase.js");
    const snap = await get(ref(db, `rooms/${code}/round/targetCharacterId`));
    return snap.val();
  }, code);
  expect(stored).toBeTruthy();

  // The GUESSER cannot read the target (rules deny it).
  const guesserRead = await g1.evaluate(async (code) => {
    const { db, ref, get } = await import("@/firebase.js");
    try {
      const snap = await get(ref(db, `rooms/${code}/round/targetCharacterId`));
      return { denied: false, value: snap.val() };
    } catch (e) {
      return { denied: /permission/i.test(String(e && e.message)), value: null };
    }
  }, code);
  expect(guesserRead.denied).toBe(true);
  expect(guesserRead.value).toBeNull();

  // Host starts the round -> phase advances for everyone.
  await host.click("#pick-start-btn");
  await expect
    .poll(
      () =>
        g1.evaluate(async (code) => {
          const { db, ref, get } = await import("@/firebase.js");
          const snap = await get(ref(db, `rooms/${code}/meta/phase`));
          return snap.val();
        }, code),
      { timeout: 5000 }
    )
    .toBe("guessing");

  // Cleanup.
  await host.evaluate(async (code) => {
    const { db, authReady, ref, remove } = await import("@/firebase.js");
    const u = await authReady;
    await remove(ref(db, `rooms/${code}/round/targetCharacterId`));
    await remove(ref(db, `rooms/${code}/deck`));
    await remove(ref(db, `rooms/${code}/players/${u.uid}`));
    await remove(ref(db, `rooms/${code}/meta`));
  }, code);
  await g1.evaluate(async (code) => {
    const { db, authReady, ref, remove } = await import("@/firebase.js");
    const u = await authReady;
    await remove(ref(db, `rooms/${code}/players/${u.uid}`));
  }, code);

  await hostCtx.close();
  await g1Ctx.close();
});
