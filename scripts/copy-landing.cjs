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
