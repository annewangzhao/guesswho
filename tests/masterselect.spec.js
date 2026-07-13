import { test, expect } from "@playwright/test";

// Issue #26 (PR2): once everyone is done uploading, a random character master
// is selected (from the rotation) and everyone advances to the pick screen —
// the master sees the gallery, the others wait.

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

test("done gate -> random master selected -> master picks, others wait", async ({ browser }) => {
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
  const byUid = {
    [await uid(host)]: host,
    [await uid(g1)]: g1,
    [await uid(g2)]: g2,
  };

  await host.click("#start-btn");
  await expect(host.locator("#screen-deck")).toHaveAttribute("data-active", "true");
  await host.evaluate(
    async ({ code, img }) => {
      const { addCharacter } = await import("@/game/deck.js");
      for (const n of ["A", "B", "C"]) await addCharacter(code, n, img);
    },
    { code, img: TINY_JPEG }
  );
  await expect(host.locator("#board-grid .tile")).toHaveCount(3);

  // Everyone marks done -> master-select for all.
  await g1.click("#deck-done-btn");
  await g2.click("#deck-done-btn");
  await host.click("#deck-done-btn");

  for (const pg of [host, g1, g2]) {
    await expect(pg.locator("#screen-masterselect")).toHaveAttribute("data-active", "true");
  }

  // A master was chosen from the players.
  const masterId = await host.evaluate(async (code) => {
    const { db, ref, get } = await import("@/firebase.js");
    const snap = await get(ref(db, `rooms/${code}/round/masterId`));
    return snap.val();
  }, code);
  expect(Object.keys(byUid)).toContain(masterId);

  // After the shuffle animation, everyone advances to the pick screen.
  for (const pg of [host, g1, g2]) {
    await expect(pg.locator("#screen-hostpick")).toHaveAttribute("data-active", "true", {
      timeout: 8000,
    });
  }

  // The chosen master sees the gallery; a non-master sees the waiting view.
  const masterPage = byUid[masterId];
  const nonMaster = [host, g1, g2].find((p) => p !== masterPage);
  await expect(masterPage.locator("#pick-host")).toBeVisible();
  await expect(nonMaster.locator("#pick-waiting")).toBeVisible();

  // Cleanup.
  for (const [pg, ctx] of [[g1, g1Ctx], [g2, g2Ctx]]) {
    await pg.evaluate(async (code) => {
      const { db, authReady, ref, remove } = await import("@/firebase.js");
      const u = await authReady;
      await remove(ref(db, `rooms/${code}/players/${u.uid}`));
    }, code);
    await ctx.close();
  }
  await host.evaluate(async (code) => {
    const { db, authReady, ref, remove } = await import("@/firebase.js");
    const u = await authReady;
    await remove(ref(db, `rooms/${code}/round/masterId`));
    await remove(ref(db, `rooms/${code}/rotation`));
    await remove(ref(db, `rooms/${code}/deck`));
    await remove(ref(db, `rooms/${code}/players/${u.uid}`));
    await remove(ref(db, `rooms/${code}/meta`));
  }, code);
  await hostCtx.close();
});
