// Host-pick screen: the host secretly chooses the target from a gallery of the
// deck; the pick minimizes to a bottom bar. Guessers see a waiting view.

import { watchDeck } from "@/game/deck.js";
import { watchMeta, watchPlayers, setTarget, setPhase } from "@/game/room.js";

export function mountHostPick(code, myUid) {
  const hostView = document.getElementById("pick-host");
  const waitView = document.getElementById("pick-waiting");
  const grid = document.getElementById("pick-grid");
  const bar = document.getElementById("pick-bar");
  const targetPhoto = document.getElementById("pick-target-photo");
  const targetName = document.getElementById("pick-target-name");
  const startBtn = document.getElementById("pick-start-btn");
  const hostNameEl = document.getElementById("pick-host-name");
  document.getElementById("pick-code").textContent = code;

  let isHost = null;
  let deck = [];
  let selectedId = null;

  function renderGrid() {
    if (!isHost) return;
    grid.innerHTML = "";
    for (const c of deck) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile pick-tile" + (c.id === selectedId ? " is-selected" : "");
      tile.dataset.charId = c.id;

      const img = document.createElement("img");
      img.className = "tile-photo";
      img.src = c.imageUrl;
      img.alt = c.name;

      const label = document.createElement("span");
      label.className = "tile-name";
      label.textContent = c.name;

      tile.append(img, label);
      tile.onclick = () => selectTarget(c.id);
      grid.append(tile);
    }
  }

  async function selectTarget(id) {
    selectedId = id;
    renderGrid();
    const c = deck.find((x) => x.id === id);
    if (c) {
      targetPhoto.src = c.imageUrl;
      targetName.textContent = c.name;
      bar.hidden = false;
    }
    await setTarget(code, id); // host-only per rules
  }

  startBtn.onclick = async () => {
    if (!selectedId) return;
    startBtn.disabled = true;
    try {
      await setPhase(code, "guessing"); // issue #8 picks up here
    } finally {
      startBtn.disabled = false;
    }
  };

  const unwatchMeta = watchMeta(code, (meta) => {
    if (!meta) return;
    const host = meta.hostId === myUid;
    if (host !== isHost) {
      isHost = host;
      hostView.hidden = !host;
      waitView.hidden = host;
      if (host) renderGrid();
    }
  });

  const unwatchDeck = watchDeck(code, (chars) => {
    deck = chars;
    renderGrid();
  });

  const unwatchPlayers = watchPlayers(code, (players) => {
    const host = players.find((p) => p.role === "host");
    if (host) hostNameEl.textContent = host.name;
  });

  return function cleanup() {
    unwatchMeta();
    unwatchDeck();
    unwatchPlayers();
    startBtn.onclick = null;
    grid.innerHTML = "";
    bar.hidden = true;
    selectedId = null;
  };
}
