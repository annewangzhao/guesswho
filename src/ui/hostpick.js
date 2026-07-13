// Master-pick screen: the round's character master secretly chooses the target
// from a gallery of the deck; the pick minimizes to a bottom bar. Everyone else
// sees a waiting view.

import { watchDeck } from "@/game/deck.js";
import { watchMaster, watchPlayers, setTarget, setPhase } from "@/game/room.js";

export function mountHostPick(code, myUid) {
  const hostView = document.getElementById("pick-host");
  const waitView = document.getElementById("pick-waiting");
  const grid = document.getElementById("pick-grid");
  const bar = document.getElementById("pick-bar");
  const targetPhoto = document.getElementById("pick-target-photo");
  const targetName = document.getElementById("pick-target-name");
  const startBtn = document.getElementById("pick-start-btn");
  const masterNameEl = document.getElementById("pick-host-name");
  document.getElementById("pick-code").textContent = code;

  let isMaster = null;
  let masterId = null;
  let players = [];
  let deck = [];
  let selectedId = null;

  function updateMasterName() {
    const master = players.find((p) => p.id === masterId);
    if (master) masterNameEl.textContent = master.name;
  }

  function renderGrid() {
    if (!isMaster) return;
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
    await setTarget(code, id); // master-only per rules
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

  const unwatchMaster = watchMaster(code, (m) => {
    masterId = m;
    const master = m === myUid;
    if (master !== isMaster) {
      isMaster = master;
      hostView.hidden = !master;
      waitView.hidden = master;
      if (master) renderGrid();
    }
    updateMasterName();
  });

  const unwatchDeck = watchDeck(code, (chars) => {
    deck = chars;
    renderGrid();
  });

  const unwatchPlayers = watchPlayers(code, (ps) => {
    players = ps;
    updateMasterName();
  });

  return function cleanup() {
    unwatchMaster();
    unwatchDeck();
    unwatchPlayers();
    startBtn.onclick = null;
    grid.innerHTML = "";
    bar.hidden = true;
    selectedId = null;
  };
}
