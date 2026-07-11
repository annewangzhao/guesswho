// Lobby rendering: room code, live player list, and host-only start control.

import { watchPlayers, watchMeta, setPhase } from "../game/room.js";

// Renders the lobby for a room and keeps it live. Returns a cleanup function.
export function mountLobby(code, myUid) {
  const codeDisplay = document.getElementById("code-display");
  const playerList = document.getElementById("player-list");
  const startBtn = document.getElementById("start-btn");
  const waitingNote = document.getElementById("waiting-note");
  const copyBtn = document.getElementById("copy-link-btn");

  codeDisplay.textContent = code;

  // Copy invite link to clipboard.
  const inviteUrl = `${location.origin}${location.pathname}?room=${code}`;
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      copyBtn.textContent = "Copied ✓";
      setTimeout(() => (copyBtn.textContent = "Copy invite link"), 1500);
    } catch {
      copyBtn.textContent = inviteUrl; // fallback: show it so they can copy manually
    }
  };

  const unwatchPlayers = watchPlayers(code, (players) => {
    playerList.innerHTML = "";
    for (const p of players) {
      const li = document.createElement("li");
      li.className = "player-item" + (p.connected ? "" : " is-offline");
      li.dataset.playerId = p.id;

      const dot = document.createElement("span");
      dot.className = "player-dot";

      const nameEl = document.createElement("span");
      nameEl.className = "player-name";
      nameEl.textContent = p.name + (p.id === myUid ? " (you)" : "");

      li.append(dot, nameEl);

      if (p.role === "host") {
        const tag = document.createElement("span");
        tag.className = "player-tag";
        tag.textContent = "host";
        li.append(tag);
      }
      playerList.append(li);
    }
  });

  const unwatchMeta = watchMeta(code, (meta) => {
    if (!meta) return;
    const isHost = meta.hostId === myUid;
    startBtn.hidden = !isHost;
    waitingNote.hidden = isHost;
  });

  startBtn.onclick = async () => {
    startBtn.disabled = true;
    try {
      await setPhase(code, "deckBuilding"); // issue #4 picks up from here
    } finally {
      startBtn.disabled = false;
    }
  };

  return function cleanup() {
    unwatchPlayers();
    unwatchMeta();
    startBtn.onclick = null;
    copyBtn.onclick = null;
  };
}
