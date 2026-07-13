# guesswho

A web version of Guess Who for me and my friends to play!

**Live:** https://annewangzhao.github.io/guesswho/

See [DESIGN.md](DESIGN.md) for the design doc (features, rules, roadmap).

## Development

The game itself is plain static HTML/CSS/JS — no build step. Just open
`index.html` through a local server (ES modules don't load over `file://`):

```bash
npm run serve   # serves at http://127.0.0.1:8791
```

### Cache-busting (no hard-refresh needed)

Modules are imported via an import map in `index.html` where each URL carries a
content-hash version (`?v=…`). `scripts/stamp.mjs` regenerates it, and a
pre-commit hook (`.githooks/pre-commit`) runs it automatically, so every deploy
that changes code makes browsers fetch fresh files — no hard-refresh. Enable the
hook once per clone:

```bash
git config core.hooksPath .githooks
```

### Testing (Playwright)

Playwright is a **dev-only** dependency (never shipped to players) used to drive
the app in a real browser — essential for verifying the real-time multiplayer
flows. One-time setup after cloning:

```bash
npm install                     # install dev dependencies
npx playwright install chromium # download the browser (~93 MB, one-time)
```

Then run the tests (they auto-start a local server):

```bash
npm test           # headless
npm run test:headed # watch it drive a real browser window
```
