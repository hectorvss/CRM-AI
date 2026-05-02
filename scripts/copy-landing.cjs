/**
 * scripts/copy-landing.cjs
 *
 * Copies the static landing-page assets (public-landing/) into the Vite build
 * output (dist/landing/) so a single `dist/` directory can be deployed to
 * Vercel — the SPA lives at dist/index.html and the landing at
 * dist/landing/index.html. vercel.json rewrites map URLs to either side.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const SRC_DIR  = path.join(ROOT, 'public-landing');
const DEST_DIR = path.join(ROOT, 'dist', 'landing');

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

if (!fs.existsSync(SRC_DIR)) {
  console.warn(`[copy-landing] Source directory not found: ${SRC_DIR} — skipping`);
  process.exit(0);
}

fs.rmSync(DEST_DIR, { recursive: true, force: true });
copyRecursive(SRC_DIR, DEST_DIR);
console.log(`[copy-landing] Copied ${SRC_DIR} → ${DEST_DIR}`);

// ── Move SPA index out of root so it doesn't shadow the landing rewrite ──
// Vercel serves static files BEFORE evaluating rewrites. If dist/index.html
// exists it will be served at "/" — blocking the rewrite to /landing/index.html.
// Renaming to _spa.html lets the "/" rewrite fire while /app rewrites to _spa.html.
const SPA_INDEX = path.join(ROOT, 'dist', 'index.html');
const SPA_DEST  = path.join(ROOT, 'dist', '_spa.html');
if (fs.existsSync(SPA_INDEX)) {
  fs.renameSync(SPA_INDEX, SPA_DEST);
  console.log(`[copy-landing] Moved dist/index.html → dist/_spa.html (landing takes root)`);
}
