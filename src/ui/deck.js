// Deck-building screen: add characters (name + photo) and see the shared board
// update live for everyone.

import { addCharacter, watchDeck } from "@/game/deck.js";
import { fileToThumbnail } from "@/game/image.js";
import { watchMeta, setPhase } from "@/game/room.js";

export function mountDeckBuilding(code, myUid) {
  const nameInput = document.getElementById("char-name");
  const photoInput = document.getElementById("char-photo");
  const photoLabel = document.getElementById("photo-label");
  const photoPreview = document.getElementById("photo-preview");
  const addBtn = document.getElementById("add-char-btn");
  const form = document.getElementById("add-character-form");
  const grid = document.getElementById("board-grid");
  const emptyMsg = document.getElementById("board-empty");
  const continueBtn = document.getElementById("deck-continue-btn");

  document.getElementById("deck-code").textContent = code;

  let thumbnail = null; // compressed data URL of the chosen photo

  function setError(msg) {
    const el = document.getElementById("deck-error");
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  function resetForm() {
    nameInput.value = "";
    photoInput.value = "";
    thumbnail = null;
    photoPreview.hidden = true;
    photoPreview.removeAttribute("src");
    photoLabel.textContent = "📷 Photo";
  }

  // Compress the chosen photo as soon as it's picked, and show a preview.
  photoInput.onchange = async () => {
    const file = photoInput.files && photoInput.files[0];
    if (!file) return;
    setError("");
    photoLabel.textContent = "…";
    try {
      thumbnail = await fileToThumbnail(file);
      photoPreview.src = thumbnail;
      photoPreview.hidden = false;
      photoLabel.textContent = "Change";
    } catch (e) {
      setError(e.message);
      resetForm();
    }
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return setError("Give the character a name.");
    if (!thumbnail) return setError("Add a photo.");
    setError("");
    addBtn.disabled = true;
    try {
      await addCharacter(code, name, thumbnail);
      resetForm();
      nameInput.focus();
    } catch (err) {
      setError(err.message || "Could not add character.");
    } finally {
      addBtn.disabled = false;
    }
  };

  const unwatchDeck = watchDeck(code, (chars) => {
    grid.innerHTML = "";
    emptyMsg.hidden = chars.length > 0;
    for (const c of chars) {
      const tile = document.createElement("div");
      tile.className = "tile";

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
  });

  const unwatchMeta = watchMeta(code, (meta) => {
    if (!meta) return;
    continueBtn.hidden = meta.hostId !== myUid; // host-only
  });

  continueBtn.onclick = async () => {
    continueBtn.disabled = true;
    try {
      await setPhase(code, "hostPick"); // issue #7 picks up here
    } finally {
      continueBtn.disabled = false;
    }
  };

  return function cleanup() {
    unwatchDeck();
    unwatchMeta();
    photoInput.onchange = null;
    form.onsubmit = null;
    continueBtn.onclick = null;
    resetForm();
    setError("");
  };
}
