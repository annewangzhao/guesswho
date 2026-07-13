import { test, expect } from "@playwright/test";

// Issue #10: after all guessers reveal, everyone sees the answer and each
// guesser's board marked correct/incorrect.

const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////" +
  "////////////////////////////////////////////////////////////////////wAA" +
  "LCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8AH//Z";

async function uid(page) {
  return page.evaluate(async () => {
    const { authReady } = await import("@/firebase.js");
    return (await authReady).uid;
  });
}
async function join(page, code, name) {
  await page.goto(`/index.html?room=${code}`);
  await page.fill("#name-input", name);
  await page.click("#confirm-btn");
  await expect(page.locator("#screen-lobby")).toHaveAttribute("data-active", "true");
}
async function lockGuess(page, charId) {
  await page.click("#guess-lock-btn");
  await page.locator(`#guess-grid .guess-tile[data-char-id="${charId}"]`).click();
  await page.click("#guess-confirm-btn");
  await expect(page.locator("#guess-reveal-btn")).toBeVisible();
}

test("reveal shows the answer and marks each guesser correct/incorrect", async ({ browser }) => {
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

  // Deck of 5.
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

  // Host sets a known target, then starts guessing.
  const deckIds = await host.evaluate(async (code) => {
    const { db, ref, get } = await import("@/firebase.js");
    const snap = await get(ref(db, `rooms/${code}/deck`));
    return Object.keys(snap.val() || {});
  }, code);
  const targetId = deckIds[0];
  const wrongId = deckIds[1];
  const targetName = await host.evaluate(
    async ({ code, targetId }) => {
      const { db, ref, get } = await import("@/firebase.js");
      const snap = await get(ref(db, `rooms/${code}/deck/${targetId}/name`));
      return snap.val();
    },
    { code, targetId }
  );
  await host.evaluate(
    async ({ code, targetId }) => {
      // Host is the master this round: set masterId first so the target write
      // is allowed, then set the target and start guessing.
      const { db, authReady, ref, set } = await import("@/firebase.js");
      const u = await authReady;
      await set(ref(db, `rooms/${code}/round/masterId`), u.uid);
      const { setTarget, setPhase } = await import("@/game/room.js");
      await setTarget(code, targetId);
      await setPhase(code, "guessing");
    },
    { code, targetId }
  );

  // Bo guesses right, Cai guesses wrong.
  await expect(g1.locator("#guess-grid .guess-tile")).toHaveCount(5);
  await expect(g2.locator("#guess-grid .guess-tile")).toHaveCount(5);
  await lockGuess(g1, targetId);
  await lockGuess(g2, wrongId);

  // Both reveal -> host auto-publishes the answer -> everyone hits the reveal.
  await g1.click("#guess-reveal-btn");
  await g2.click("#guess-reveal-btn");

  for (const pg of [host, g1, g2]) {
    await expect(pg.locator("#screen-reveal")).toHaveAttribute("data-active", "true");
  }

  // Answer banner shows the target.
  await expect(g2.locator("#reveal-answer-name")).toHaveText(targetName);

  // Per-guesser correctness (checked on the guesser who was wrong, proving they
  // can see the answer they didn't have access to during play).
  const g1Board = g2.locator(`.reveal-board[data-guesser-id="${g1Uid}"]`);
  const g2Board = g2.locator(`.reveal-board[data-guesser-id="${g2Uid}"]`);
  await expect(g1Board.locator(".reveal-badge.is-correct")).toBeVisible();
  await expect(g2Board.locator(".reveal-badge.is-wrong")).toBeVisible();

  // The answer tile is marked on each board, and the summary names the winner.
  await expect(g1Board.locator(".reveal-tile.is-answer")).toHaveCount(1);
  await expect(g2Board.locator(".reveal-tile.is-answer")).toHaveCount(1);
  await expect(g2Board.locator(".reveal-tile.is-wrong-guess")).toHaveCount(1);
  await expect(g2.locator("#reveal-summary")).toContainText("Bo");

  // Cleanup.
  for (const [pg, ctx] of [[g1, g1Ctx], [g2, g2Ctx]]) {
    await pg.evaluate(async (code) => {
      const { db, authReady, ref, remove } = await import("@/firebase.js");
      const u = await authReady;
      await remove(ref(db, `rooms/${code}/boards/${u.uid}`));
      await remove(ref(db, `rooms/${code}/players/${u.uid}`));
    }, code);
    await ctx.close();
  }
  await host.evaluate(async (code) => {
    const { db, authReady, ref, remove } = await import("@/firebase.js");
    const u = await authReady;
    await remove(ref(db, `rooms/${code}/round/targetCharacterId`));
    await remove(ref(db, `rooms/${code}/round/revealedTarget`));
    await remove(ref(db, `rooms/${code}/deck`));
    await remove(ref(db, `rooms/${code}/players/${u.uid}`));
    await remove(ref(db, `rooms/${code}/meta`));
  }, code);
  await hostCtx.close();
});
