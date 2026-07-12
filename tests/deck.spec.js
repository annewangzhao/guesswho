import { test, expect } from "@playwright/test";

// Issue #4 core: characters added by any player appear live on everyone's board.

// Inject a generated image into the file input and wait for it to compress.
async function pickGeneratedPhoto(page, seed) {
  await page.evaluate(async (seed) => {
    const c = document.createElement("canvas");
    c.width = 300;
    c.height = 300;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 300, 300);
    let s = (seed * 2654435761) >>> 0;
    const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `hsl(${Math.floor(rnd() * 360)},70%,50%)`;
      ctx.fillRect(rnd() * 300, rnd() * 300, rnd() * 120 + 20, rnd() * 120 + 20);
    }
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const file = new File([blob], "p.png", { type: "image/png" });
    const input = document.getElementById("char-photo");
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, seed);
  await page.waitForSelector("#photo-preview:not([hidden])");
}

async function addCharacter(page, seed, name) {
  await pickGeneratedPhoto(page, seed);
  await page.fill("#char-name", name);
  await page.click("#add-char-btn");
}

test("characters added by one player appear live on everyone's board", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const g1Ctx = await browser.newContext();
  const host = await hostCtx.newPage();
  const g1 = await g1Ctx.newPage();

  // Host creates + guesser joins.
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

  // Host starts -> BOTH route to deck building via the phase change.
  await host.click("#start-btn");
  await expect(host.locator("#screen-deck")).toHaveAttribute("data-active", "true");
  await expect(g1.locator("#screen-deck")).toHaveAttribute("data-active", "true");

  // Host adds a character -> appears on both boards, live.
  await addCharacter(host, 1, "Zed");
  await expect(host.locator(".tile")).toHaveCount(1);
  await expect(g1.locator(".tile")).toHaveCount(1);
  await expect(g1.locator(".tile-name")).toHaveText("Zed");
  // The photo actually rendered as a data-URL thumbnail.
  await expect(g1.locator(".tile-photo")).toHaveAttribute("src", /^data:image\/jpeg/);

  // Guesser adds one -> host sees it live.
  await addCharacter(g1, 2, "Mona");
  await expect(host.locator(".tile")).toHaveCount(2);
  await expect(host.locator(".tile-name").last()).toHaveText("Mona");

  // Cleanup.
  await host.evaluate(async (code) => {
    const { db, authReady, ref, remove } = await import("/src/firebase.js");
    const u = await authReady;
    await remove(ref(db, `rooms/${code}/deck`));
    await remove(ref(db, `rooms/${code}/players/${u.uid}`));
    await remove(ref(db, `rooms/${code}/meta`));
  }, code);
  await g1.evaluate(async (code) => {
    const { db, authReady, ref, remove } = await import("/src/firebase.js");
    const u = await authReady;
    await remove(ref(db, `rooms/${code}/players/${u.uid}`));
  }, code);

  await hostCtx.close();
  await g1Ctx.close();
});
