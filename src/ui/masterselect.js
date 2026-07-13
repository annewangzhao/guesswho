// Character-master selection: a slot-machine-style shuffle through everyone's
// names that lands on the round's master (read from round/masterId), then
// advances to the pick screen.

import { watchPlayers, watchMaster, setPhase } from "@/game/room.js";

const SHUFFLE_MS = 1500; // cycle names for this long
const HOLD_MS = 1200; // hold on the winner before advancing

export function mountMasterSelect(code, myUid) {
  const nameEl = document.getElementById("master-name");
  const restEl = document.getElementById("master-rest");

  let players = [];
  let masterId = null;
  let iAmHost = null;
  let landed = false;
  const startedAt = Date.now();

  nameEl.classList.remove("is-landed");
  restEl.textContent = "";

  const cycle = setInterval(() => {
    if (landed) return;
    if (players.length) {
      const n = players[Math.floor(Math.random() * players.length)];
      nameEl.textContent = n.name;
    }
    tryLand();
  }, 90);

  function tryLand() {
    if (landed) return;
    if (Date.now() - startedAt < SHUFFLE_MS) return;
    const master = players.find((p) => p.id === masterId);
    if (!master) return; // wait until the master id has arrived
    landed = true;
    clearInterval(cycle);
    nameEl.textContent = master.name;
    nameEl.classList.add("is-landed");
    restEl.textContent = " is the character master!";
    // The host coordinates the advance to the pick screen.
    if (iAmHost) setTimeout(() => setPhase(code, "hostPick"), HOLD_MS);
  }

  const unwatchPlayers = watchPlayers(code, (ps) => {
    players = ps;
    const me = ps.find((p) => p.id === myUid);
    iAmHost = me?.role === "host";
    tryLand();
  });
  const unwatchMaster = watchMaster(code, (m) => {
    masterId = m;
    tryLand();
  });

  return function cleanup() {
    clearInterval(cycle);
    unwatchPlayers();
    unwatchMaster();
    nameEl.classList.remove("is-landed");
  };
}
