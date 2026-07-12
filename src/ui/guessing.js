// Guessing screen. Each guesser sees their own board with the deck in a
// per-player randomized order (#6). Flipping/eliminating + locking a guess is #8.

import { watchDeck } from "../game/deck.js";
import { watchMeta } from "../game/room.js";
import { ensureBoardLayout } from "../game/board.js";

export function mountGuessing(code, myUid) {
  const guesserView = document.getElementById("guess-guesser");
  const hostView = document.getElementById("guess-host");
  const grid = document.getElementById("guess-grid");
  document.getElementById("guess-code").textContent = code;

  let isHost = null;
  let deckMap = {}; // id -> character
  let deckIds = [];
  let layout = [];

  function renderBoard() {
    grid.innerHTML = "";
    for (const id of layout) {
      const c = deckMap[id];
      if (!c) continue;
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.charId = id;

      const img = document.createElement("img");
      img.className = "tile-photo";
      img.src = c.imageUrl;
      img.alt = c.name;

      const label = document.createElement("span");
      label.className = "tile-name";
      label.textContent = c.name;

      tile.append(img, label);
      grid.append(tile);
    }
  }

  // Create/read this guesser's randomized layout once role + deck are known.
  async function maybeSetupBoard() {
    if (isHost !== false) return; // guessers only
    if (!deckIds.length) return;
    layout = await ensureBoardLayout(code, deckIds);
    renderBoard();
  }

  const unwatchMeta = watchMeta(code, (meta) => {
    if (!meta) return;
    const host = meta.hostId === myUid;
    if (host !== isHost) {
      isHost = host;
      hostView.hidden = !host;
      guesserView.hidden = host;
      maybeSetupBoard();
    }
  });

  const unwatchDeck = watchDeck(code, (chars) => {
    deckMap = Object.fromEntries(chars.map((c) => [c.id, c]));
    deckIds = chars.map((c) => c.id);
    maybeSetupBoard();
  });

  return function cleanup() {
    unwatchMeta();
    unwatchDeck();
    grid.innerHTML = "";
  };
}
