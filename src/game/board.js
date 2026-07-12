// Per-player board layout. Each player sees the same characters in an
// independently randomized order (anti-inference — DESIGN.md §4). The layout is
// persisted at rooms/{code}/boards/{playerId}/layout so it's stable for the round.

import { db, authReady, ref, get, set, remove, onValue } from "../firebase.js";

// Cryptographically-seeded Fisher–Yates shuffle (returns a new array).
function shuffle(ids) {
  const a = ids.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Ensure the current player has a persisted randomized layout of the given deck
// ids. Created once (idempotent) and reused for the round. Returns the layout.
export async function ensureBoardLayout(code, deckIds) {
  const user = await authReady;
  const layoutRef = ref(db, `rooms/${code}/boards/${user.uid}/layout`);

  const snap = await get(layoutRef);
  const existing = snap.val();
  // Reuse an existing layout only if it still matches the deck exactly.
  if (Array.isArray(existing) && sameSet(existing, deckIds)) {
    return existing;
  }

  const layout = shuffle(deckIds);
  await set(layoutRef, layout);
  return layout;
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

// Flip a character down (eliminate) or back up on the current player's board.
export async function setEliminated(code, characterId, on) {
  const user = await authReady;
  const r = ref(db, `rooms/${code}/boards/${user.uid}/eliminated/${characterId}`);
  if (on) await set(r, true);
  else await remove(r);
}

// Lock in the current player's single final guess.
export async function lockGuess(code, characterId) {
  const user = await authReady;
  await set(ref(db, `rooms/${code}/boards/${user.uid}/finalGuess`), characterId);
}

// Watch a player's board (layout + eliminated + finalGuess). Returns unsubscribe.
export function watchBoard(code, playerId, cb) {
  return onValue(ref(db, `rooms/${code}/boards/${playerId}`), (snap) =>
    cb(snap.val() || {})
  );
}
