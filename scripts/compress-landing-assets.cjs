#!/usr/bin/env node
/**
 * scripts/compress-landing-assets.cjs
 *
 * In-place LOSSLESS optimization of public-landing-v2/assets/.
 * Keeps file extensions and URLs unchanged so JSX references stay valid.
 * Pixel-identical to the source — only re-encodes PNG with stronger DEFLATE.
 *
 *   PNG  → sharp.png({ palette: false, compressionLevel: 9, effort: 10 })
 *   JPG  → SKIPPED (any JPEG re-encode is lossy)
 *
 * Skips files smaller than 8 KB (savings not worth the round-trip)
 * and files where the recompressed bytes are larger than the source.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'public-landing-v2', 'assets');
const MIN_BYTES = 8 * 1024;

async function compressOne(file) {
  const full = path.join(DIR, file);
  const stat = fs.statSync(full);
  if (stat.size < MIN_BYTES) return { file, skipped: 'small' };

  const ext = path.extname(file).toLowerCase();
  let pipeline;
  if (ext === '.png')                    pipeline = sharp(full).png({ palette: false, compressionLevel: 9, effort: 10 });
  else                                   return { file, skipped: 'ext' };

  let out;
  try { out = await pipeline.toBuffer(); }
  catch (err) { return { file, skipped: 'err:' + err.message.slice(0, 40) }; }

  if (out.length >= stat.size) return { file, skipped: 'no-gain', from: stat.size, to: out.length };

  // OneDrive can transiently lock files during sync. Write to a temp sibling
  // then rename, retrying briefly. Skip the file if it stays locked.
  const tmp = full + '.tmp-' + process.pid;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      fs.writeFileSync(tmp, out);
      fs.renameSync(tmp, full);
      return { file, from: stat.size, to: out.length };
    } catch (err) {
      lastErr = err;
      try { fs.unlinkSync(tmp); } catch (_) {}
      if (err.code !== 'UNKNOWN' && err.code !== 'EBUSY' && err.code !== 'EPERM') break;
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    }
  }
  return { file, skipped: 'locked:' + (lastErr && lastErr.code) };
}

async function main() {
  const all = fs.readdirSync(DIR).filter((f) => /\.(png|jpe?g)$/i.test(f));
  let totalIn = 0, totalOut = 0, optimized = 0, skipped = 0;
  const CONCURRENCY = 8;
  const queue = all.slice();

  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      const r = await compressOne(f);
      if (r.skipped) { skipped++; continue; }
      optimized++;
      totalIn += r.from;
      totalOut += r.to;
      if (optimized % 25 === 0) {
        console.log(`  …${optimized} optimized, saved ${((totalIn - totalOut) / 1024 / 1024).toFixed(1)} MB so far`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const savedMB = ((totalIn - totalOut) / 1024 / 1024).toFixed(1);
  const pct = totalIn ? Math.round((1 - totalOut / totalIn) * 100) : 0;
  console.log(`[compress-landing-assets] optimized ${optimized}, skipped ${skipped}`);
  console.log(`[compress-landing-assets] ${(totalIn / 1024 / 1024).toFixed(1)} MB → ${(totalOut / 1024 / 1024).toFixed(1)} MB (saved ${savedMB} MB, ${pct}%)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
