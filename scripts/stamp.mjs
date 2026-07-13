#!/usr/bin/env node
// Cache-busting stamp. Computes a content hash of the app's JS + CSS and writes
// a versioned import map into index.html (plus a ?v= on the stylesheet). Every
// module URL then carries the version, so a deploy that changes any code makes
// browsers fetch fresh files — no hard-refresh needed.
//
// Runs automatically via the pre-commit hook (.githooks/pre-commit).

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SRC = join(ROOT, "src");
const CSS = join(ROOT, "styles", "main.css");
const HTML = join(ROOT, "index.html");

function walkJs(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkJs(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

const jsFiles = walkJs(SRC).sort();

const hash = createHash("sha1");
for (const f of jsFiles) hash.update(readFileSync(f));
hash.update(readFileSync(CSS));
const version = hash.digest("hex").slice(0, 10);

// Build the import map: "@/<rel>" -> "./src/<rel>?v=<version>"
const imports = {};
for (const f of jsFiles) {
  const rel = relative(SRC, f).split(sep).join("/");
  imports[`@/${rel}`] = `./src/${rel}?v=${version}`;
}
const mapJson = JSON.stringify({ imports }, null, 2)
  .split("\n")
  .map((line) => "    " + line)
  .join("\n");

const block =
  `<!--IMPORTMAP-->\n` +
  `  <script type="importmap">\n${mapJson}\n  </script>\n` +
  `  <!--/IMPORTMAP-->`;

let html = readFileSync(HTML, "utf8");
html = html.replace(/<!--IMPORTMAP-->[\s\S]*?<!--\/IMPORTMAP-->/, block);
html = html.replace(
  /href="\.\/styles\/main\.css(\?v=[^"]*)?"/,
  `href="./styles/main.css?v=${version}"`
);
writeFileSync(HTML, html);

console.log(`stamped v=${version} (${jsFiles.length} modules)`);
