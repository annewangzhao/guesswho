import { test, expect } from "@playwright/test";

// Issue #9: the host watches the guessers' boards "from behind" — live flips,
// but no character identities are revealed.

const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////" +
  "////////////////////////////////////////////////////////////////////wAA" +
  "LCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8AH//Z";

async function uid(page) {
  return page.evaluate(async () => {
    const { authReady } = await import("/src/firebase.js");
    return (await authReady).uid;
  });
}
async function join(page, code, name) {
  await page.goto(`/index.html?room=${code}`);
  await page.fill("#name-input", name);
  await page.click("#confirm-btn");
  await expect(page.locator("#screen-lobby")).toHaveAttribute("data-active", "true");
}

test("host watches guessers' boards from behind: live flips, identities hidden", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const g1Ctx = await browser.newContext();
  const g2Ctx = await browser.newContext();
  const host = await hostCtx.newPage();
  const g1 = await g1Ctx.newPage();
  const g2 = await g2Ctx.newPage();

  await host.goto("/index.html");
  await host.click("#create-btn");
  await host.fill("#name-input", "Anne");
  await host.click("#confirm-btn");
  await expect(host.locator("#screen-lobby")).toHaveAttribute("data-active", "true");
  const code = (await host.locator("#code-display").textContent()).trim();

  await join(g1, code, "Bo");
  await join(g2, code, "Cai");
  const g1Uid = await uid(g1);
  const g2Uid = await uid(g2);

  // Seed a deck of 6 and jump to guessing.
  await host.click("#start-btn");
  await expect(host.locator("#screen-deck")).toHaveAttribute("data-active", "true");
  await host.evaluate(
    async ({ code, img }) => {
      const { addCharacter } = await import("/src/game/deck.js");
      for (const n of ["A", "B", "C", "D", "E", "F"]) await addCharacter(code, n, img);
    },
    { code, img: TINY_JPEG }
  );
  await expect(host.locator("#board-grid .tile")).toHaveCount(6);
  await host.evaluate(async (code) => {
    const { setPhase } = await import("/src/game/room.js");
    await setPhase(code, "guessing");
  }, code);

  // Host sees a back-board per guesser.
  await expect(host.locator("#watch-boards .watch-board")).toHaveCount(2);
  const g1board = host.locator(`.watch-board[data-guesser-id="${g1Uid}"]`);
  const g2board = host.locator(`.watch-board[data-guesser-id="${g2Uid}"]`);
  await expect(g1board.locator(".back-tile")).toHaveCount(6);

  // Identities are hidden: no photos, no names anywhere in the watch view.
  await expect(host.locator("#watch-boards img")).toHaveCount(0);
  await expect(host.locator("#watch-boards .tile-name")).toHaveCount(0);

  // Guessers flip tiles -> host sees the flips live (as face-down backs).
  await g1.locator("#guess-grid .guess-tile").nth(0).click();
  await g1.locator("#guess-grid .guess-tile").nth(1).click();
  await g2.locator("#guess-grid .guess-tile").nth(3).click();
  await expect(g1board.locator(".back-tile.is-down")).toHaveCount(2);
  await expect(g2board.locator(".back-tile.is-down")).toHaveCount(1);

  // A guesser locking in shows a badge on the host's view (but not who).
  await g1.click("#guess-lock-btn");
  await g1.locator("#guess-grid .guess-tile").nth(4).click();
  await g1.click("#guess-confirm-btn");
  await expect(g1board.locator(".watch-badge")).toBeVisible();
  // Still no identity leak after locking.
  await expect(host.locator("#watch-boards img")).toHaveCount(0);

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
