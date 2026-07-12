// Deck operations: collaboratively add characters (name + thumbnail) and watch
// the shared deck live. Characters live at rooms/{code}/deck/{characterId}.

import {
  db,
  authReady,
  ref,
  push,
  set,
  remove,
  onValue,
  serverTimestamp,
} from "../firebase.js";

// Add a character to the room's shared deck. `imageDataUrl` is a small JPEG
// thumbnail (see image.js). Returns the new character id.
export async function addCharacter(code, name, imageDataUrl) {
  const user = await authReady;
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Give the character a name.");
  if (!imageDataUrl) throw new Error("Add a photo.");

  const deckRef = ref(db, `rooms/${code}/deck`);
  const charRef = push(deckRef);
  await set(charRef, {
    name: trimmed.slice(0, 40),
    imageUrl: imageDataUrl,
    addedBy: user.uid,
    addedAt: serverTimestamp(),
  });
  return charRef.key;
}

export async function removeCharacter(code, characterId) {
  await remove(ref(db, `rooms/${code}/deck/${characterId}`));
}

// Subscribe to the shared deck. onDeck receives an array of
// { id, name, imageUrl, addedBy } ordered by add time. Returns unsubscribe.
export function watchDeck(code, onDeck) {
  return onValue(ref(db, `rooms/${code}/deck`), (snap) => {
    const val = snap.val() || {};
    const chars = Object.entries(val).map(([id, c]) => ({ id, ...c }));
    chars.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
    onDeck(chars);
  });
}
