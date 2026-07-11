# Guess Who — Design Doc (EDD)

> Status: **draft v0.2** — brain-dump structured, key v1 questions resolved.
> Sections marked ⚠️ **OPEN** still need a decision before we build that part.

## 1. Goal & Non-Goals

**Goal.** A web-based, multiplayer party game inspired by Guess Who, but built
around *our own friend group*: the "characters" are real people in our
periphery, uploaded as photos. One player (the **host**) secretly picks a
target person from the board; the other players (**guessers**) each try to
figure out who it is. Played live while everyone is on FaceTime together.

**Non-goals (explicitly out of scope).**
- No built-in voice/video chat — **we use FaceTime for all live communication.**
  The app never needs to transmit audio/video or handle "asking a question" as a
  networked action; questions are asked out loud.
- Not a faithful clone of classic 2-player Guess Who rules.
- Not a public/matchmaking game — it's for a known group sharing a room code.

## 2. Core Concept & How It Differs From Classic Guess Who

| | Classic Guess Who | Our version |
|---|---|---|
| Players | 2 | **3+** (1 host + 2+ guessers) |
| Secret | Each player has their own secret | **One shared target** the host picks |
| Who guesses | Both players guess each other | **All guessers guess the host's target** |
| Characters | Fixed cartoon set | **Uploaded photos of real friends** |
| Questions | Structured yes/no attributes | **Freeform (verbal) + curated question cards** |
| Board layout | Same for both | **Randomized per player** (anti-cheat) |

## 3. Players & Roles

- **Host** — picks the target character; answers guessers' questions (verbally,
  over FaceTime). In future modes, can also earn points (back-guessing, betting).
- **Guessers** — 2 or more. Each works their own board, eliminates faces, and
  locks in a final guess.
- **MVP:** exactly **3 players** (1 host + 2 guessers). Design the data model for
  N, but only test/support 3 first.

## 4. Key Design Principle: Anti-Inference Randomized Boards

Every player sees the **same set of characters** but in a **randomized position
on their own board**. This is a core requirement, not a nice-to-have: it prevents
a guesser from inferring another guesser's eliminations by glancing at where cards
are flipped. Board position carries **no shared meaning** between players.

**Resolved:** The **host has no board of their own.** The host picks the target
from a full-screen character gallery (§5, §6.1), then during the round watches the
guessers' boards **from behind** (see §5.6). Randomization still matters between
guessers, and the "from behind" view means the host sees *that* a tile flipped but
not *which character* it was.

## 5. Game Flow — Basic Mode (v1)

1. **Lobby.** Host creates a room → gets a room code. Others join with the code
   and a display name. Host starts the game when everyone's in.
2. **Collaborative deck building (Kahoot-style).** When the game commences,
   *everyone* sees a **blank board** with an "add character" option. Any player
   can add a character (name + photo); because each real-life acquaintance is
   close to one specific player, that player adds them. Added characters
   **populate onto every player's board in real time** as they're submitted.
   (See §7.)
3. **Board deal.** Each player's board shows the full character set in a
   **randomized layout** (positions differ per player — §4). The layout is
   **responsive/dynamic**: tiles fit the screen, stay centered and legibly sized,
   with blank space allowed rather than forcing a fixed grid (§7).
4. **Host picks target.** The host does *not* see a board. Instead a **full-screen
   character gallery** opens (like a video-game weapon/loadout or card-reveal
   screen). The host selects one character as the target; it **minimizes to a
   small card at the bottom of the host's screen** for the rest of the round.
5. **Guessing phase.** Guessers ask questions out loud (FaceTime) and on their
   own board **flip down** eliminated characters. Each guesser eventually
   **locks in one final guess.**
6. **Host watches from behind.** During guessing, the host sees the guessers'
   boards rendered **from behind** — as tiles get flipped down, the host sees the
   flips happen **in real time**, but *not which character* each represents
   (backs + randomized layouts hide identity). Pure spectator tension.
7. **Reveal.** When **all guessers** have hit "Reveal," the app shows every
   guesser's board **side by side**, each marked correct/incorrect against the
   host's target.
8. **Score / next round.** Correct guessers score. Rotate host, play again.
   - ⚠️ **OPEN:** Is score tracked across rounds in v1, or is v1 single-round and
     scoring comes with the betting mode? (Leaning: simple round-win display in
     v1, persistent score later.)

**Simplification worth calling out:** because Q&A happens verbally over FaceTime,
v1 boards do **not** need structured attributes (hair color, glasses, etc.). A
character is just a **photo + name**, and elimination is a manual toggle. This
makes v1 dramatically simpler than classic Guess Who. (Question cards in §8 add
structure back, optionally.)

## 6. Game Modes

### 6.1 Basic mode — **v1**
As above: collaborative deck-build → host picks target from a full-screen gallery
→ guessers guess on their randomized boards while the host watches the boards from
behind → reveal side-by-side.

### 6.2 Host back-guessing mode — **future**
After all guessers lock in, the host guesses **which guesser(s) got it right.**
If correct, the host earns a point too. Adds a meta-layer and keeps the host
engaged.

### 6.3 Betting flavor — **future**
- Each guesser starts with a pot of money.
- When locking a guess, a guesser **bets** an amount reflecting confidence.
- Correct → win the bet amount; incorrect → lose it from their pot.
- Host can bet on **which guesser they think is correct** (ties into 6.2).
- ⚠️ **OPEN:** Where does won money come from — a shared pot, the bank, or
  the host? Needs rules before building.

## 7. Characters / Photo Upload

- Each character = **image + name** (+ optional attributes later).
- **Collaborative, real-time deck building (Kahoot-style).** When a game starts,
  all players see a blank board and can **add characters** (name + photo). Each
  addition appears on **everyone's board in real time**. Rationale: each character
  is a close acquaintance of one specific player, so that player adds them.
- **Dynamic board size — responsive, no fixed count.** Think of each character as
  a **tile** and each board as a **screen**: the board fits however many tiles
  exist, keeping them **centered and legibly sized**, allowing blank space rather
  than enforcing a rigid grid. No hard min/max; layout math must handle "few" and
  "many" gracefully.
  - Design implication: build the board as a **responsive auto-fitting grid**
    (e.g. CSS grid with `auto-fit`/`minmax`, tile size clamped for readability).
- Storage: **Firebase Storage** for images; character metadata in the DB.
- ⚠️ **OPEN (minor):** Any cap to protect layout/perf (e.g. soft max ~40)? Can
  decide during build.
- ⚠️ **OPEN:** Can characters be added/edited *after* the round starts, or is the
  deck frozen once the host begins picking? (Leaning: freeze at host-pick.)

## 8. Question Cards (Nice-to-have, high-flavor)

The signature feature. Because our friends have very distinctive lives, literal
questions ("do they work in aviation?") instantly give it away — only one person
fits. So instead we provide a **deck of curated question cards** that probe
**qualities, psychology, vibes, and unhinged hypotheticals** about how the host
feels about the person — evocative rather than factual.

**Tone target:** the intricate-understanding *synergy* of **Wavelength**, plus the
ridiculous humor of **"Go Fuck Yourself."** Cards should be funny, a little
unhinged, and reveal character through the host's reaction.

Example cards (from brain dump):
- "On a scale of 1–10, how ridiculous would you say this person is?"
- "If you had the choice to start over, would you still befriend them?"
- "If you had to sit next to one person on our board on an airplane, would this
  character have been your first choice?"
- "Does this character look like they'll die in *The White Lotus*?"

- ⚠️ **OPEN:** How are cards used mechanically? Drawn per turn? Shared pool vs.
  per-guesser hand? Limited count per round? Are answers just spoken aloud, or
  recorded/tracked in-app?
- ⚠️ **OPEN:** Card content — curated static deck to start; a way to add our own
  later?

## 9. Themes / Skins — **future**
Selectable visual themes ("skins") for the board.

## 10. 3D Board Rendering — **future**
Render the board as if physically looking at it (perspective/3D), rather than a
flat top-down "blueprint." Stretch/polish feature.

## 11. Screens (initial guess)
- **Landing / Create-or-Join room**
- **Lobby** (players list, host controls, start)
- **Collaborative deck build** — blank board + add-character (name/photo), tiles
  appear live for everyone (§7)
- **Host: pick target** — full-screen character gallery; picked card minimizes to
  bottom of screen (§5.4)
- **Host: watch** — guessers' boards seen *from behind*, live tile-flips (§5.6)
- **Guesser: board** (responsive auto-fit grid; flip cards, lock guess) +
  question-card area (later)
- **Reveal** (side-by-side boards, correctness)
- **Score / next round**

## 12. Tech & Hosting (decided)
- **Frontend:** static HTML/CSS/JS, hosted free on **GitHub Pages**
  (`annewangzhao.github.io/guesswho`).
- **Realtime backend:** **Firebase** (Realtime Database or Firestore) for shared
  game state; **Firebase Storage** for photos. No custom server.
- Friends join via link + room code; nothing to install.
- ⚠️ **OPEN:** Realtime Database vs Firestore — decide when we design the data model.

## 13. Data Model (sketch — to flesh out)
Rough shape, per room:
- `room`: code, hostId, mode, phase, createdAt
- `players[]`: id, name, role (host/guesser), score/pot
- `deck[]`: characterId, name, imageUrl
- `boards`: per-playerId → ordered list of characterIds (their randomized layout)
  + per-character eliminated flag + final guess
- `round`: targetCharacterId (host-only visibility), reveal flags per guesser

## 14. Open Questions (rollup)

**Resolved:** host board (no board — gallery + watch-from-behind, §4/§5); who
uploads photos & when (everyone, live, Kahoot-style, §7); board size (dynamic
responsive, §7).

**Still open:**
1. Score persistence in v1 vs later? (§5) — *leaning: round-win display in v1.*
2. Betting money source/rules? (§6.3) — *future.*
3. Question-card mechanics: draw rules, tracking? (§8) — *future.*
4. Firebase Realtime DB vs Firestore? (§12) — *decide at data-model step.*
5. Deck frozen at host-pick, or editable mid-round? (§7) — *leaning: freeze.*
6. Soft cap on character count for layout/perf? (§7) — *decide during build.*

## 15. Proposed v1 Scope (MVP)
Everything needed for **3 players to play one satisfying round**:
- Create/join room + lobby
- Collaborative live deck building (add character = name + photo, appears for all)
- Randomized per-player **responsive** boards
- Host picks target from full-screen gallery (minimized card during round)
- Host watches guessers' boards from behind (live flips)
- Guessers flip cards + lock one guess
- Reveal side-by-side with correctness

**Deferred to later:** back-guessing mode, betting, question-card deck, themes,
3D board, N>3 players, persistent scoring.
