// Entry point: home (join-with-code OR create) -> name step -> lobby.

import { showScreen } from "./ui/screens.js";
import { createRoom, joinRoom, normalizeCode, watchMeta } from "./game/room.js";
import { mountLobby } from "./ui/lobby.js";
import { mountDeckBuilding } from "./ui/deck.js";

let intent = null; // "create" | "join"
let pendingCode = ""; // room code when joining

// Room routing: once in a room, watch the phase and mount the matching screen.
let roomUnwatch = null;
let screenCleanup = null;
let currentPhase = null;

function setError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg || "";
  el.hidden = !msg;
}

// Move to the name step, tailored to the chosen intent.
function goToNameStep(kind, code = "") {
  intent = kind;
  pendingCode = code;

  const context = document.getElementById("name-context");
  const confirm = document.getElementById("confirm-btn");
  if (kind === "create") {
    context.textContent = "Create a room";
    confirm.textContent = "Create room";
  } else {
    context.textContent = `Joining room ${code}`;
    confirm.textContent = "Join room";
  }

  setError("name-error", "");
  showScreen("name");
  document.getElementById("name-input").focus();
}

function onJoinFromHome() {
  const code = normalizeCode(document.getElementById("code-input").value);
  if (!code) return setError("landing-error", "Enter a room code to join.");
  setError("landing-error", "");
  goToNameStep("join", code);
}

function onCreateFromHome() {
  setError("landing-error", "");
  goToNameStep("create");
}

// Mount the screen for a given phase. Unknown/unbuilt phases leave the current
// screen up (so the app doesn't blank out on phases we haven't built yet).
function routeToPhase(phase, code, uid) {
  const mounts = {
    lobby: () => {
      showScreen("lobby");
      return mountLobby(code, uid);
    },
    deckBuilding: () => {
      showScreen("deck");
      return mountDeckBuilding(code, uid);
    },
  };
  const mount = mounts[phase];
  if (!mount) return;
  if (screenCleanup) screenCleanup();
  screenCleanup = mount();
}

function enterRoom(code, uid) {
  // Reflect the room in the URL so it's a shareable/back-navigable link.
  history.replaceState(null, "", `?room=${code}`);
  currentPhase = null;
  if (roomUnwatch) roomUnwatch();
  roomUnwatch = watchMeta(code, (meta) => {
    if (!meta || meta.phase === currentPhase) return;
    currentPhase = meta.phase;
    routeToPhase(meta.phase, code, uid);
  });
}

async function onConfirm() {
  const name = document.getElementById("name-input").value.trim();
  if (!name) return setError("name-error", "Enter your name.");
  setError("name-error", "");

  const btn = document.getElementById("confirm-btn");
  btn.disabled = true;
  try {
    const res =
      intent === "create"
        ? await createRoom(name)
        : await joinRoom(pendingCode, name);
    enterRoom(res.code, res.uid);
  } catch (e) {
    setError("name-error", e.message || "Something went wrong.");
  } finally {
    btn.disabled = false;
  }
}

function boot() {
  document.getElementById("join-btn").addEventListener("click", onJoinFromHome);
  document.getElementById("create-btn").addEventListener("click", onCreateFromHome);
  document.getElementById("confirm-btn").addEventListener("click", onConfirm);
  document.getElementById("name-back").addEventListener("click", () => {
    setError("name-error", "");
    showScreen("landing");
  });

  // Enter-to-submit conveniences.
  document.getElementById("code-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") onJoinFromHome();
  });
  document.getElementById("name-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") onConfirm();
  });

  // Invite link (?room=CODE): skip home, go straight to the name step for that room.
  const roomParam = new URLSearchParams(location.search).get("room");
  if (roomParam) {
    goToNameStep("join", normalizeCode(roomParam).slice(0, 4));
  } else {
    showScreen("landing");
  }
}

document.addEventListener("DOMContentLoaded", boot);
