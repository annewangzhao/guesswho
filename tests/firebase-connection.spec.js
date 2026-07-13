import { test, expect } from "@playwright/test";

// Verifies a live round-trip to the real Realtime Database, driven in a browser:
// sign in anonymously -> write to a room path -> read it back -> clean up.
// Proves the CDN SDK loads, the config is correct, anonymous auth works, and
// the security rules allow the operation.

test("firebase anonymous auth + read/write round-trip", async ({ page }) => {
  await page.goto("/index.html");

  const result = await page.evaluate(async () => {
    const { db, authReady, ref, set, get, remove } = await import("@/firebase.js");

    const user = await authReady; // resolves once anonymous sign-in completes
    const roomCode = `_TEST_${Date.now()}`;
    const metaPath = `rooms/${roomCode}/meta`;
    const meta = { code: "_TEST_", hostId: user.uid, phase: "lobby" };

    const node = ref(db, metaPath);
    await set(node, meta);
    const snap = await get(node);
    const readBack = snap.val();
    await remove(node); // clean up

    return { uid: user.uid, readBack };
  });

  expect(result.uid).toBeTruthy();
  expect(result.readBack).toEqual({ code: "_TEST_", hostId: result.uid, phase: "lobby" });
});
