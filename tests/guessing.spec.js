import { test, expect } from "@playwright/test";

// Issue #8: a guesser flips tiles down (synced) and locks in one final guess.

const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////" +
  "////////////////////////////////////////////////////////////////////wAA" +
  "LCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8AH//Z";

async function readBoard(page, code, key) {
  return page.evaluate(
    async ({ code, key }) => {
      const { db, authReady, ref, get } = await import("@/firebase.js");
      const u = await authReady;
      const snap = await get(ref(db, `rooms/${code}/boards/${u.uid}/${key}`));
      return snap.val();
    },
    { code, key }
  );
}

test("a guesser flips tiles and locks in one final guess", async ({ browser }) => {
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
  await host.evaluate(
    async ({ code, img }) => {
      const { addCharacter } = await import("@/game/deck.js");
      for (const n of ["A", "B", "C", "D", "E"]) await addCharacter(code, n, img);
    },
    { code, img: TINY_JPEG }
  );
  await expect(host.locator("#board-grid .tile")).toHaveCount(5);
  // Host is the master; the guesser (g1) is the one whose board we drive.
  await host.evaluate(async (code) => {
    const { db, authReady, ref, set } = await import("@/firebase.js");
    const u = await authReady;
    await set(ref(db, `rooms/${code}/round/masterId`), u.uid);
    const { setPhase } = await import("@/game/room.js");
    await setPhase(code, "guessing");
  }, code);

  // Guesser sees an interactive board.
  await expect(g1.locator("#guess-grid .guess-tile")).toHaveCount(5);

  // --- Flip a tile down (eliminate) ---
  const firstId = await g1.locator("#guess-grid .guess-tile").first().getAttribute("data-char-id");
  await g1.locator("#guess-grid .guess-tile").first().click();
  await expect(g1.locator("#guess-grid .guess-tile").first()).toHaveClass(/is-eliminated/);
  // ...synced to the DB.
  await expect.poll(() => readBoard(g1, code, "eliminated")).toEqual({ [firstId]: true });

  // Flip it back up.
  await g1.locator("#guess-grid .guess-tile").first().click();
  await expect(g1.locator("#guess-grid .guess-tile").first()).not.toHaveClass(/is-eliminated/);
  await expect.poll(() => readBoard(g1, code, "eliminated")).toBeNull();

  // --- Lock in a final guess ---
  await g1.click("#guess-lock-btn");
  await expect(g1.locator("#guess-confirm-btn")).toBeVisible();
  await expect(g1.locator("#guess-confirm-btn")).toBeDisabled(); // nothing selected yet

  const guessTile = g1.locator("#guess-grid .guess-tile").nth(2);
  const guessId = await guessTile.getAttribute("data-char-id");
  await guessTile.click();
  await expect(guessTile).toHaveClass(/is-pending/);
  await expect(g1.locator("#guess-confirm-btn")).toBeEnabled();

  await g1.click("#guess-confirm-btn");

  // Board locks: the pick is marked, controls disappear, a Reveal button
  // appears, and the guess is persisted.
  await expect(g1.locator("#guess-grid .guess-tile.is-guess")).toHaveCount(1);
  await expect(g1.locator(`#guess-grid .guess-tile[data-char-id="${guessId}"]`)).toHaveClass(/is-guess/);
  await expect(g1.locator("#guess-lock-btn")).toBeHidden();
  await expect(g1.locator("#guess-reveal-btn")).toBeVisible();
  await expect(g1.locator("#guess-grid .guess-tile").first()).toBeDisabled();
  await expect.poll(() => readBoard(g1, code, "finalGuess")).toBe(guessId);

  // Cleanup.
  await g1.evaluate(async (code) => {
    const { db, authReady, ref, remove } = await import("@/firebase.js");
    const u = await authReady;
    await remove(ref(db, `rooms/${code}/boards/${u.uid}`));
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
