// Reveal screen: shows the answer and every guesser's board side by side, each
// marked correct/incorrect against the revealed target.

import { watchDeck } from "@/game/deck.js";
import { watchPlayers, watchRevealedTarget } from "@/game/room.js";
import { watchBoard } from "@/game/board.js";

export function mountReveal(code, myUid) {
  const answerPhoto = document.getElementById("reveal-answer-photo");
  const answerName = document.getElementById("reveal-answer-name");
  const summary = document.getElementById("reveal-summary");
  const boardsEl = document.getElementById("reveal-boards");
  const newGameBtn = document.getElementById("reveal-newgame-btn");

  let deckMap = {};
  let targetId = null;
  let guessers = []; // [{ id, name }]
  const boards = {}; // guesserId -> board data
  const boardUnsubs = {};

  function render() {
    // Answer banner
    const target = deckMap[targetId];
    if (target) {
      answerPhoto.src = target.imageUrl;
      answerName.textContent = target.name;
    }

    // Per-guesser boards
    boardsEl.innerHTML = "";
    let correctCount = 0;
    const winners = [];
    for (const g of guessers) {
      const b = boards[g.id] || {};
      const layout = Array.isArray(b.layout) ? b.layout : [];
      const elim = b.eliminated || {};
      const guess = b.finalGuess || null;
      const correct = guess && targetId && guess === targetId;
      if (correct) {
        correctCount++;
        winners.push(g.name);
      }

      const card = document.createElement("div");
      card.className = "reveal-board";
      card.dataset.guesserId = g.id;

      const head = document.createElement("div");
      head.className = "reveal-board-head";
      const nm = document.createElement("span");
      nm.className = "reveal-board-name";
      nm.textContent = g.name;
      const badge = document.createElement("span");
      badge.className = "reveal-badge " + (correct ? "is-correct" : "is-wrong");
      badge.textContent = correct ? "Correct ✓" : "Wrong ✗";
      head.append(nm, badge);

      const grid = document.createElement("div");
      grid.className = "board-grid reveal-grid";
      for (const id of layout) {
        const c = deckMap[id];
        if (!c) continue;
        const tile = document.createElement("div");
        let cls = "tile reveal-tile";
        if (elim[id]) cls += " is-eliminated";
        if (id === targetId) cls += " is-answer";
        if (id === guess && guess !== targetId) cls += " is-wrong-guess";
        tile.className = cls;

        const img = document.createElement("img");
        img.className = "tile-photo";
        img.src = c.imageUrl;
        img.alt = c.name;

        const label = document.createElement("span");
        label.className = "tile-name";
        label.textContent = c.name;

        // Badge the answer and (if different) the guess.
        if (id === targetId) tile.append(makeFlag("🎯 Answer"));
        else if (id === guess) tile.append(makeFlag("Their guess"));

        tile.append(img, label);
        grid.append(tile);
      }

      card.append(head, grid);
      boardsEl.append(card);
    }

    // Round summary
    if (guessers.length) {
      if (winners.length) {
        summary.textContent =
          winners.length === guessers.length
            ? "Everyone got it! 🎉"
            : `${winners.join(" and ")} got it! 🎉`;
      } else {
        summary.textContent = "Nobody guessed it this time.";
      }
    }
  }

  function makeFlag(text) {
    const f = document.createElement("span");
    f.className = "reveal-flag";
    f.textContent = text;
    return f;
  }

  const unwatchDeck = watchDeck(code, (chars) => {
    deckMap = Object.fromEntries(chars.map((c) => [c.id, c]));
    render();
  });
  const unwatchTarget = watchRevealedTarget(code, (t) => {
    targetId = t;
    render();
  });
  const unwatchPlayers = watchPlayers(code, (players) => {
    guessers = players.filter((p) => p.role === "guesser").map((p) => ({ id: p.id, name: p.name }));
    for (const g of guessers) {
      if (!boardUnsubs[g.id]) {
        boardUnsubs[g.id] = watchBoard(code, g.id, (b) => {
          boards[g.id] = b;
          render();
        });
      }
    }
    render();
  });

  newGameBtn.onclick = () => {
    location.assign(location.pathname); // back to a fresh home screen
  };

  return function cleanup() {
    unwatchDeck();
    unwatchTarget();
    unwatchPlayers();
    for (const unsub of Object.values(boardUnsubs)) unsub();
    newGameBtn.onclick = null;
    boardsEl.innerHTML = "";
  };
}
