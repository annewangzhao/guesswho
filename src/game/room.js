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
} from "../firebase.js";

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

// Host-only: advance the room to the next phase.
export async function setPhase(code, phase) {
  await update(ref(db, `rooms/${code}/meta`), { phase });
}

// Host-only (enforced by rules): set the target character for the round.
export async function setTarget(code, characterId) {
  await set(ref(db, `rooms/${code}/round/targetCharacterId`), characterId);
}
