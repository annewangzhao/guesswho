import { test, expect } from "@playwright/test";

// The core security property: only the host may read round/targetCharacterId.
// We use two separate browser contexts = two separate anonymous users (a host and
// a guesser) and confirm the host can read the answer while the guesser is denied.

test("only the host can read the target; guessers are denied", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const hostPage = await hostCtx.newPage();
  const guestPage = await guestCtx.newPage();
  await hostPage.goto("/index.html");
  await guestPage.goto("/index.html");

  const roomCode = `_SEC_${Date.now()}`;

  // Host creates the room, sets the target, and reads it back (should succeed).
  const host = await hostPage.evaluate(async (roomCode) => {
    const { db, authReady, ref, set, get } = await import("/src/firebase.js");
    const user = await authReady;
    await set(ref(db, `rooms/${roomCode}/meta`), {
      code: "_SEC_", hostId: user.uid, phase: "guessing",
    });
    await set(ref(db, `rooms/${roomCode}/round/targetCharacterId`), "char_secret");
    const snap = await get(ref(db, `rooms/${roomCode}/round/targetCharacterId`));
    return { uid: user.uid, hostRead: snap.val() };
  }, roomCode);

  // A different anonymous user (guesser) tries to read the answer (should be denied).
  const guest = await guestPage.evaluate(async (roomCode) => {
    const { db, authReady, ref, get } = await import("/src/firebase.js");
    const user = await authReady;
    let denied = false, value = null;
    try {
      const snap = await get(ref(db, `rooms/${roomCode}/round/targetCharacterId`));
      value = snap.val();
    } catch (e) {
      denied = /permission_denied|permission denied/i.test(String(e && e.message));
    }
    return { uid: user.uid, denied, value };
  }, roomCode);

  // Sanity: the guesser CAN still read a shared part of the room (proves it's not
  // just blanket-denied everything, i.e. the host-only scoping is precise).
  const guestSharedRead = await guestPage.evaluate(async (roomCode) => {
    const { db, ref, get } = await import("/src/firebase.js");
    const snap = await get(ref(db, `rooms/${roomCode}/meta/phase`));
    return snap.val();
  }, roomCode);

  // Cleanup (order matters: remove the target while meta/hostId still proves we're
  // the host, THEN remove meta).
  await hostPage.evaluate(async (roomCode) => {
    const { db, ref, remove } = await import("/src/firebase.js");
    await remove(ref(db, `rooms/${roomCode}/round/targetCharacterId`));
    await remove(ref(db, `rooms/${roomCode}/meta`));
  }, roomCode);

  await hostCtx.close();
  await guestCtx.close();

  expect(host.hostRead).toBe("char_secret");   // host CAN read the answer
  expect(guest.uid).not.toBe(host.uid);         // genuinely two different users
  expect(guest.denied).toBe(true);              // guesser read was DENIED
  expect(guest.value).toBeNull();               // ...and got nothing
  expect(guestSharedRead).toBe("guessing");     // but shared room data still readable
});
