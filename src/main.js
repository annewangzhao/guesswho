// Entry point: wires the landing screen (create/join) to the lobby.

import { showScreen } from "./ui/screens.js";
import { createRoom, joinRoom } from "./game/room.js";
import { mountLobby } from "./ui/lobby.js";

let lobbyCleanup = null;

function showError(msg) {
  const el = document.getElementById("landing-error");
  el.textContent = msg;
  el.hidden = !msg;
}

function currentName() {
  return document.getElementById("name-input").value.trim();
}

async function enterLobby(code, uid) {
  if (lobbyCleanup) lobbyCleanup();
  // Reflect the room in the URL so it's a shareable/back-navigable link.
  history.replaceState(null, "", `?room=${code}`);
  lobbyCleanup = mountLobby(code, uid);
  showScreen("lobby");
}

async function handleCreate() {
  const name = currentName();
  if (!name) return showError("Enter your name first.");
  showError("");
  const btn = document.getElementById("create-btn");
  btn.disabled = true;
  try {
    const { code, uid } = await createRoom(name);
    await enterLobby(code, uid);
  } catch (e) {
    showError(e.message || "Could not create room.");
  } finally {
    btn.disabled = false;
  }
}

async function handleJoin() {
  const name = currentName();
  if (!name) return showError("Enter your name first.");
  const code = document.getElementById("code-input").value;
  if (!code.trim()) return showError("Enter a room code to join.");
  showError("");
  const btn = document.getElementById("join-btn");
  btn.disabled = true;
  try {
    const res = await joinRoom(code, name);
    await enterLobby(res.code, res.uid);
  } catch (e) {
    showError(e.message || "Could not join room.");
  } finally {
    btn.disabled = false;
  }
}

function boot() {
  showScreen("landing");

  document.getElementById("create-btn").addEventListener("click", handleCreate);
  document.getElementById("join-btn").addEventListener("click", handleJoin);

  // If arriving via an invite link (?room=CODE), prefill the code and focus name.
  const params = new URLSearchParams(location.search);
  const roomParam = params.get("room");
  if (roomParam) {
    document.getElementById("code-input").value = roomParam.toUpperCase().slice(0, 4);
    document.getElementById("name-input").focus();
  }
}

document.addEventListener("DOMContentLoaded", boot);
