// Entry point. For now this just confirms the app booted and the deploy works.
// Real screen routing / game logic arrives in later issues.

import { showScreen } from "./ui/screens.js";

function boot() {
  showScreen("landing");

  // Prove the JS module actually loaded on the deployed site.
  const note = document.getElementById("build-note");
  if (note) {
    note.textContent = "App loaded ✓";
  }
}

document.addEventListener("DOMContentLoaded", boot);
