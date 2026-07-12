import { test, expect } from "@playwright/test";

// Issue #6: each guesser's board shows the same characters in an independently
// randomized, persisted order.

const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////" +
  "////////////////////////////////////////////////////////////////////wAA" +
  "LCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8AH//Z";

async function joinRoom(page, code, name) {
  await page.goto(`/index.html?room=${code}`);
  await page.fill("#name-input", name);
  await page.click("#confirm-btn");
  await expect(page.locator("#screen-lobby")).toHaveAttribute("data-active", "true");
}

test("each guesser gets the same characters in a different, persisted order", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const g1Ctx = await browser.newContext();
  const g2Ctx = await browser.newContext();
  const host = await hostCtx.newPage();
  const g1 = await g1Ctx.newPage();
  const g2 = await g2Ctx.newPage();

  // Room with a host + two guessers.
  await host.goto("/index.html");
  await host.click("#create-btn");
  await host.fill("#name-input", "Anne");
  await host.click("#confirm-btn");
  await expect(host.locator("#screen-lobby")).toHaveAttribute("data-active", "true");
  const code = (await host.locator("#code-display").textContent()).trim();

  await joinRoom(g1, code, "Bo");
  await joinRoom(g2, code, "Cai");

  // Start -> deck building, then seed a deck of 8 (bigger deck => negligible
  // chance two independent shuffles collide).
  await host.click("#start-btn");
  await expect(host.locator("#screen-deck")).toHaveAttribute("data-active", "true");
  const names = ["A", "B", "C", "D", "E", "F", "G", "H"];
  await host.evaluate(
    async ({ code, names, img }) => {
      const { addCharacter } = await import("/src/game/deck.js");
      for (const n of names) await addCharacter(code, n, img);
    },
    { code, names, img: TINY_JPEG }
  );
  await expect(host.locator("#board-grid .tile")).toHaveCount(8);

  // Jump straight to guessing (host-pick UI is covered by its own test).
  await host.evaluate(async (code) => {
    const { setPhase } = await import("/src/game/room.js");
    await setPhase(code, "guessing");
  }, code);

  // Both guessers land on their board with all 8 characters.
  await expect(g1.locator("#guess-grid .tile")).toHaveCount(8);
  await expect(g2.locator("#guess-grid .tile")).toHaveCount(8);

  const order1 = await g1.$$eval("#guess-grid .tile", (els) => els.map((e) => e.dataset.charId));
  const order2 = await g2.$$eval("#guess-grid .tile", (els) => els.map((e) => e.dataset.charId));

  // Same set of characters...
  expect([...order1].sort()).toEqual([...order2].sort());
  // ...but a different order (the anti-inference property).
  expect(order1).not.toEqual(order2);

  // The order is persisted: g1's stored layout matches what it rendered.
  const stored1 = await g1.evaluate(async (code) => {
    const { db, authReady, ref, get } = await import("/src/firebase.js");
    const u = await authReady;
    const snap = await get(ref(db, `rooms/${code}/boards/${u.uid}/layout`));
    return snap.val();
  }, code);
  expect(stored1).toEqual(order1);

  // Cleanup.
  for (const [pg, ctx] of [[g1, g1Ctx], [g2, g2Ctx]]) {
    await pg.evaluate(async (code) => {
      const { db, authReady, ref, remove } = await import("/src/firebase.js");
      const u = await authReady;
      await remove(ref(db, `rooms/${code}/boards/${u.uid}`));
      await remove(ref(db, `rooms/${code}/players/${u.uid}`));
    }, code);
    await ctx.close();
  }
  await host.evaluate(async (code) => {
    const { db, authReady, ref, remove } = await import("/src/firebase.js");
    const u = await authReady;
    await remove(ref(db, `rooms/${code}/deck`));
    await remove(ref(db, `rooms/${code}/players/${u.uid}`));
    await remove(ref(db, `rooms/${code}/meta`));
  }, code);
  await hostCtx.close();
});
