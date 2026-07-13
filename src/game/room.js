// Room lifecycle: create, join, and watch a room + its players.
// All game state lives under rooms/{code} (see DESIGN.md §13).

import {
  db,
  authReady,
  ref,
  get,
  set,
  update,
  onValue,
  onDisconnect,
  serverTimestamp,
} from "@/firebase.js";

// Room codes: 4 chars, uppercase, no confusable letters/digits (no O/0, I/1).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;

export function generateRoomCode() {
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export function normalizeCode(raw) {
  return (raw || "").trim().toUpperCase();
}

async function roomExists(code) {
  const snap = await get(ref(db, `rooms/${code}/meta`));
  return snap.exists();
}

// Create a new room; caller becomes the host. Returns { code, uid }.
export async function createRoom(name) {
  const user = await authReady;

  // Retry a few times in the (very unlikely) event of a code collision.
  let code;
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generateRoomCode();
    if (!(await roomExists(code))) break;
    code = null;
  }
  if (!code) throw new Error("Could not allocate a room code, try again.");

  await set(ref(db, `rooms/${code}/meta`), {
    code,
    hostId: user.uid,
    mode: "basic",
    phase: "lobby",
    createdAt: serverTimestamp(),
  });

  await joinAsPlayer(code, user.uid, name, "host");
  return { code, uid: user.uid };
}

// Join an existing room as a guesser. Returns { code, uid }.
export async function joinRoom(rawCode, name) {
  const user = await authReady;
  const code = normalizeCode(rawCode);
  if (!code) throw new Error("Enter a room code.");
  if (!(await roomExists(code))) throw new Error(`Room "${code}" not found.`);

  await joinAsPlayer(code, user.uid, name, "guesser");
  return { code, uid: user.uid };
}

// Write the player entry and set up presence so they drop off on disconnect.
async function joinAsPlayer(code, uid, name, role) {
  const playerRef = ref(db, `rooms/${code}/players/${uid}`);
  await set(playerRef, {
    name: (name || "Player").trim().slice(0, 40),
    role,
    connected: true,
    score: 0,
    joinedAt: serverTimestamp(),
  });

  // When this client disconnects, mark them offline (keeps the entry so the host
  // roster is stable, but the lobby can grey them out / drop them).
  onDisconnect(ref(db, `rooms/${code}/players/${uid}/connected`)).set(false);
}

// Subscribe to the players map. onPlayers receives an array of
// { id, name, role, connected, score }. Returns an unsubscribe function.
export function watchPlayers(code, onPlayers) {
  const playersRef = ref(db, `rooms/${code}/players`);
  return onValue(playersRef, (snap) => {
    const val = snap.val() || {};
    const players = Object.entries(val).map(([id, p]) => ({ id, ...p }));
    // Stable order: host first, then by join time.
    players.sort((a, b) => {
      if (a.role === "host" && b.role !== "host") return -1;
      if (b.role === "host" && a.role !== "host") return 1;
      return (a.joinedAt || 0) - (b.joinedAt || 0);
    });
    onPlayers(players);
  });
}

// Subscribe to room meta (phase, hostId, ...). Returns an unsubscribe function.
export function watchMeta(code, onMeta) {
  return onValue(ref(db, `rooms/${code}/meta`), (snap) => onMeta(snap.val()));
}

// Advance the room to the next phase.
export async function setPhase(code, phase) {
  await update(ref(db, `rooms/${code}/meta`), { phase });
}

// Mark the current player done (or not) uploading characters.
export async function setDeckReady(code, ready) {
  const user = await authReady;
  await set(ref(db, `rooms/${code}/players/${user.uid}/deckReady`), !!ready);
}

// Master-only (enforced by rules): set the target character for the round.
export async function setTarget(code, characterId) {
  await set(ref(db, `rooms/${code}/round/targetCharacterId`), characterId);
}

// --- Character master rotation ---------------------------------------------
// A fixed, randomly-ordered rotation established once. Each round advances one
// step and wraps around, so everyone masters once before anyone repeats.

function shuffle(ids) {
  const a = ids.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Coordinator-only: ensure a rotation exists (shuffled from the given players)
// and set the current round's master to the rotation's current position.
export async function ensureRotationAndPickMaster(code, playerIds) {
  const rotationRef = ref(db, `rooms/${code}/rotation`);
  const snap = await get(rotationRef);
  let rot = snap.val();
  if (!rot || !Array.isArray(rot.order) || rot.order.length === 0) {
    rot = { order: shuffle(playerIds), index: 0 };
    await set(rotationRef, rot);
  }
  const masterId = rot.order[rot.index % rot.order.length];
  await set(ref(db, `rooms/${code}/round/masterId`), masterId);
  return masterId;
}

// Watch the current round's character master (playerId, or null). Unsubscribe.
export function watchMaster(code, cb) {
  return onValue(ref(db, `rooms/${code}/round/masterId`), (snap) =>
    cb(snap.val() || null)
  );
}

// A guesser signals they're ready to reveal.
export async function setReveal(code) {
  const user = await authReady;
  await set(ref(db, `rooms/${code}/round/revealFlags/${user.uid}`), true);
}

// Host-only: publish the secret target so everyone can see it, then move to the
// reveal phase. Called once all guessers have revealed.
export async function publishTargetAndReveal(code) {
  const snap = await get(ref(db, `rooms/${code}/round/targetCharacterId`));
  const target = snap.val();
  if (target) await set(ref(db, `rooms/${code}/round/revealedTarget`), target);
  await update(ref(db, `rooms/${code}/meta`), { phase: "reveal" });
}

// Watch the reveal flags map { playerId: true }. Returns unsubscribe.
export function watchRevealFlags(code, cb) {
  return onValue(ref(db, `rooms/${code}/round/revealFlags`), (snap) =>
    cb(snap.val() || {})
  );
}

// Watch the publicly-revealed target character id (null until reveal).
export function watchRevealedTarget(code, cb) {
  return onValue(ref(db, `rooms/${code}/round/revealedTarget`), (snap) =>
    cb(snap.val() || null)
  );
}
