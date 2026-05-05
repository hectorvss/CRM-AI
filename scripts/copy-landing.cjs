/**
 * scripts/copy-landing.cjs
 *
 * Copies the static landing-page assets into the Vite build output (dist/) so a
 * single `dist/` directory can be deployed to Vercel:
 *   - SPA at dist/_spa.html (served on /app routes)
 *   - Landing v2 at dist/landing-v2/  → served at /
 *
 * vercel.json rewrites map URLs to either side.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COPIES = [
  { src: path.join(ROOT, 'public-landing-v2'), dest: path.join(ROOT, 'dist', 'landing-v2'), label: 'landing-v2' },
];

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

for (const { src, dest, label } of COPIES) {
  if (!fs.existsSync(src)) {
    console.warn(`[copy-landing] ${label}: source not found (${src}) — skipping`);
    continue;
  }
  fs.rmSync(dest, { recursive: true, force: true });
  copyRecursive(src, dest);
  console.log(`[copy-landing] ${label}: copied ${src} → ${dest}`);
}

// ── Move SPA index out of root so it doesn't shadow the landing rewrite ──
// Vercel serves static files BEFORE evaluating rewrites. If dist/index.html
// exists it will be served at "/" — blocking the rewrite to /landing-v2/index.html.
// Renaming to _spa.html lets the "/" rewrite fire while /app rewrites to _spa.html.
const SPA_INDEX = path.join(ROOT, 'dist', 'index.html');
const SPA_DEST  = path.join(ROOT, 'dist', '_spa.html');
if (fs.existsSync(SPA_INDEX)) {
  fs.renameSync(SPA_INDEX, SPA_DEST);
  console.log(`[copy-landing] Moved dist/index.html → dist/_spa.html (landing v2 takes root)`);
}
