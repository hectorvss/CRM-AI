#!/usr/bin/env node
/**
 * scripts/build-landing-jsx.cjs
 *
 * Pre-transpiles every public-landing-v2/*.jsx into a sibling *.js file
 * using esbuild. Eliminates @babel/standalone's runtime cost in the browser.
 *
 * The output keeps the same IIFE structure the source already uses
 * (`(function () { ... })();`) and references the same globals
 * (React, ReactDOM, ClainV2, etc.), so index.html just swaps `.jsx` → `.js`.
 *
 * Run on every build (vercel) and after manual edits to landing JSX.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'public-landing-v2');

function listJsx(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.jsx'))
    .map((f) => path.join(dir, f));
}

async function build() {
  const entries = listJsx(SRC);
  if (!entries.length) {
    console.warn('[build-landing-jsx] no .jsx files found in', SRC);
    return;
  }

  let written = 0;
  let totalSrc = 0;
  let totalOut = 0;

  for (const entry of entries) {
    const out = entry.replace(/\.jsx$/, '.js');
    const src = fs.readFileSync(entry, 'utf8');
    totalSrc += src.length;

    const result = await esbuild.transform(src, {
      loader: 'jsx',
      jsx: 'transform',           // classic React.createElement — matches what
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      target: 'es2019',           // safe baseline for modern browsers
      format: 'iife',             // each file already wraps itself in an IIFE,
                                  // but esbuild ensures top-level scope safety
      legalComments: 'inline',
      minify: false,              // keep readable; gzip handles the rest
      sourcemap: false,
    });

    fs.writeFileSync(out, result.code, 'utf8');
    totalOut += result.code.length;
    written++;
  }

  console.log(
    `[build-landing-jsx] transpiled ${written} files: ${(totalSrc / 1024).toFixed(0)} KB JSX → ${(totalOut / 1024).toFixed(0)} KB JS`,
  );
}

build().catch((err) => {
  console.error('[build-landing-jsx] FAILED', err);
  process.exit(1);
});
