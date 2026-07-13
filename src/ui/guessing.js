// Guessing screen. A guesser flips tiles down (eliminate) as they narrow it
// down, then locks in exactly one final guess. State syncs to the DB so the
// host's watch view (#9) and the reveal (#10) can read it.

import { watchDeck } from "@/game/deck.js";
import { watchMeta, watchPlayers } from "@/game/room.js";
import {
  ensureBoardLayout,
  watchBoard,
  setEliminated,
  lockGuess,
} from "@/game/board.js";

export function mountGuessing(code, myUid) {
  const guesserView = document.getElementById("guess-guesser");
  const hostView = document.getElementById("guess-host");
  const grid = document.getElementById("guess-grid");
  const instruction = document.getElementById("guess-instruction");
  const statusEl = document.getElementById("guess-status");
  const lockBtn = document.getElementById("guess-lock-btn");
  const confirmBtn = document.getElementById("guess-confirm-btn");
  const cancelBtn = document.getElementById("guess-cancel-btn");
  document.getElementById("guess-code").textContent = code;

  let isHost = null;
  let deckMap = {};
  let deckIds = [];
  let layout = [];
  let eliminated = {}; // { charId: true }
  let finalGuess = null; // set once locked
  let mode = "eliminate"; // "eliminate" | "selecting"
  let pending = null; // candidate guess while selecting
  let boardUnsub = null;

  // Host-watch state
  const watchContainer = document.getElementById("watch-boards");
  let watchPlayersUnsub = null;
  const watchBoardUnsubs = {}; // guesserId -> unsub
  const watchBoards = {}; // guesserId -> board data
  let watchGuessers = []; // [{ id, name }]
  let watchSetup = false;

  const isLocked = () => !!finalGuess;

  function render() {
    grid.innerHTML = "";
    for (const id of layout) {
      const c = deckMap[id];
      if (!c) continue;

      const tile = document.createElement("button");
      tile.type = "button";
      tile.dataset.charId = id;
      let cls = "tile guess-tile";
      if (eliminated[id]) cls += " is-eliminated";
      if (isLocked() && id === finalGuess) cls += " is-guess";
      else if (mode === "selecting" && id === pending) cls += " is-pending";
      tile.className = cls;
      tile.disabled = isLocked();

      const img = document.createElement("img");
      img.className = "tile-photo";
      img.src = c.imageUrl;
      img.alt = c.name;

      const label = document.createElement("span");
      label.className = "tile-name";
      label.textContent = c.name;

      tile.append(img, label);
      tile.onclick = () => onTileClick(id);
      grid.append(tile);
    }
    renderControls();
  }

  function renderControls() {
    if (isLocked()) {
      const name = deckMap[finalGuess]?.name || "your pick";
      instruction.textContent = "Guess locked in.";
      statusEl.textContent = `You guessed ${name} — waiting for the reveal…`;
      lockBtn.hidden = true;
      confirmBtn.hidden = true;
      cancelBtn.hidden = true;
    } else if (mode === "selecting") {
      instruction.textContent = "Tap the character you're guessing.";
      statusEl.textContent = pending
        ? `Guessing: ${deckMap[pending]?.name || ""}`
        : "";
      lockBtn.hidden = true;
      confirmBtn.hidden = false;
      confirmBtn.disabled = !pending;
      cancelBtn.hidden = false;
    } else {
      instruction.textContent = "Tap to flip down the people you've ruled out.";
      const n = Object.keys(eliminated).length;
      statusEl.textContent = n ? `${n} ruled out` : "";
      lockBtn.hidden = false;
      confirmBtn.hidden = true;
      cancelBtn.hidden = true;
    }
  }

  function onTileClick(id) {
    if (isLocked()) return;
    if (mode === "selecting") {
      pending = id;
      render();
    } else {
      setEliminated(code, id, !eliminated[id]); // syncs; watchBoard re-renders
    }
  }

  lockBtn.onclick = () => {
    mode = "selecting";
    pending = null;
    render();
  };
  cancelBtn.onclick = () => {
    mode = "eliminate";
    pending = null;
    render();
  };
  confirmBtn.onclick = async () => {
    if (!pending) return;
    confirmBtn.disabled = true;
    await lockGuess(code, pending); // finalGuess arrives via watchBoard
  };

  // ----- Host watch: see each guesser's board from behind (backs only) -----
  function renderWatch() {
    watchContainer.innerHTML = "";
    for (const g of watchGuessers) {
      const b = watchBoards[g.id] || {};
      const layout = Array.isArray(b.layout) ? b.layout : [];
      const elim = b.eliminated || {};
      const locked = !!b.finalGuess;

      const card = document.createElement("div");
      card.className = "watch-board";
      card.dataset.guesserId = g.id;

      const nameRow = document.createElement("div");
      nameRow.className = "watch-name";
      nameRow.textContent = g.name;
      if (locked) {
        const badge = document.createElement("span");
        badge.className = "watch-badge";
        badge.textContent = "Locked in ✓";
        nameRow.append(badge);
      }

      const backGrid = document.createElement("div");
      backGrid.className = "back-grid";
      if (!layout.length) {
        const wait = document.createElement("p");
        wait.className = "watch-status";
        wait.textContent = "Getting ready…";
        card.append(nameRow, wait);
        watchContainer.append(card);
        continue;
      }
      let down = 0;
      for (const id of layout) {
        const cell = document.createElement("div");
        cell.className = "back-tile" + (elim[id] ? " is-down" : "");
        backGrid.append(cell);
        if (elim[id]) down++;
      }

      const status = document.createElement("p");
      status.className = "watch-status";
      status.textContent = locked ? "Locked in their guess" : `${down} ruled out`;

      card.append(nameRow, backGrid, status);
      watchContainer.append(card);
    }
  }

  function setupHostWatch() {
    if (watchSetup) return;
    watchSetup = true;
    document.getElementById("watch-code").textContent = code;
    watchPlayersUnsub = watchPlayers(code, (players) => {
      watchGuessers = players
        .filter((p) => p.role === "guesser")
        .map((p) => ({ id: p.id, name: p.name }));
      // Subscribe to any guesser boards we're not watching yet.
      for (const g of watchGuessers) {
        if (!watchBoardUnsubs[g.id]) {
          watchBoardUnsubs[g.id] = watchBoard(code, g.id, (b) => {
            watchBoards[g.id] = b;
            renderWatch();
          });
        }
      }
      renderWatch();
    });
  }

  // Once we know we're a guesser and have the deck, ensure a layout + subscribe.
  async function maybeSetupBoard() {
    if (isHost !== false || !deckIds.length || boardUnsub) return;
    layout = await ensureBoardLayout(code, deckIds);
    boardUnsub = watchBoard(code, myUid, (board) => {
      if (Array.isArray(board.layout)) layout = board.layout;
      eliminated = board.eliminated || {};
      finalGuess = board.finalGuess || null;
      if (finalGuess) mode = "eliminate";
      render();
    });
    render();
  }

  const unwatchMeta = watchMeta(code, (meta) => {
    if (!meta) return;
    const host = meta.hostId === myUid;
    if (host !== isHost) {
      isHost = host;
      hostView.hidden = !host;
      guesserView.hidden = host;
      if (host) setupHostWatch();
      else maybeSetupBoard();
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
    if (boardUnsub) boardUnsub();
    if (watchPlayersUnsub) watchPlayersUnsub();
    for (const unsub of Object.values(watchBoardUnsubs)) unsub();
    lockBtn.onclick = confirmBtn.onclick = cancelBtn.onclick = null;
    grid.innerHTML = "";
    watchContainer.innerHTML = "";
  };
}
