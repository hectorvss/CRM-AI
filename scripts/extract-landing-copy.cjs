#!/usr/bin/env node
/**
 * scripts/extract-landing-copy.cjs
 *
 * Walks every public-landing-v2/*.jsx, pulls out human-readable copy
 * (headings, body paragraphs, CTAs, feature labels, FAQ, etc.) and
 * writes a single Markdown report at docs/landing-copy.md.
 *
 * For each page the report groups text into rough buckets by HTML
 * element kind / surrounding context, then deduplicates and orders
 * by appearance. The goal is to give a human a single document they
 * can read top-to-bottom to audit / rewrite copy.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'public-landing-v2');
const OUT = path.join(ROOT, 'docs', 'landing-copy.md');

// Pages to skip — pure scaffolding files with no marketing copy of their own.
const SKIP = new Set(['shared.jsx', 'app.jsx']);

/** Strip JSX comments and inline JS comments — they pollute the extract. */
function stripComments(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')      // {/* ... */}
    .replace(/\/\*[\s\S]*?\*\//g, ' ')                  // /* ... */
    .replace(/^\s*\/\/.*$/gm, ' ');                     // // ...
}

/** Decode common HTML entities + JSX escapes. */
function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&times;/g, '×')
    .replace(/&copy;/g, '©')
    .replace(/&euro;/g, '€')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Heuristic: is this string actual copy or noise (class names / code)? */
function looksLikeCopy(s) {
  if (!s) return false;
  if (s.length < 2) return false;
  if (s.length > 600) return false;
  // Whole-string code-ish
  if (/^[a-zA-Z_$][\w$]*\s*=\s*/.test(s)) return false;
  if (/^\{.*\}$/.test(s)) return false;
  // Tailwind / className signatures
  if (/^[A-Za-z0-9_:\-\[\]\\\s/.()%#]+$/.test(s) && /(rounded|tracking|leading|font-\[|tracking-|leading-|text-\[|bg-\[|border-|absolute|relative|flex|grid|opacity|w-|h-|px-|py-|pl-|pr-|pt-|pb-|m-|mt-|mb-|ml-|mr-|gap-|inset-|top-|left-|right-|bottom-|z-|self-|justify-|items-)/.test(s)) return false;
  // Pure CSS values
  if (/^(absolute|relative|static|fixed|sticky)\s+/.test(s)) return false;
  if (/^\$?\d+(\.\d+)?(px|em|rem|%|deg|s|ms)?\s*$/.test(s)) return false;
  // Pure URLs
  if (/^(https?:\/\/|\/|#)/.test(s) && !/\s/.test(s)) return false;
  // Pure CSS color / number
  if (/^#?[0-9a-fA-F]{3,8}$/.test(s)) return false;
  if (/^rgba?\(/.test(s)) return false;
  // JS keywords / identifiers only
  if (/^(true|false|null|undefined)$/.test(s)) return false;
  // Looks like a CSS selector / dotted path
  if (/^[a-z]+\.[a-z\-_]+$/i.test(s)) return false;
  // Single non-letter character
  if (!/[A-Za-z0-9]/.test(s)) return false;
  return true;
}

/**
 * Extract copy from one .jsx file.
 * Returns { headings: [...], body: [...], ctas: [...], features: [...], faqs: [...] }
 */
function extractFile(src) {
  const cleaned = stripComments(src);
  const lines = cleaned.split('\n');

  const buckets = {
    headings: [],
    body: [],
    ctas: [],
    nav: [],
    features: [],
    faqs: [],
    other: [],
  };
  const seen = new Set();
  function push(bucket, text, ctx) {
    const t = decode(text);
    if (!looksLikeCopy(t)) return;
    const key = bucket + '|' + t;
    if (seen.has(key)) return;
    seen.add(key);
    buckets[bucket].push({ text: t, ctx });
  }

  // 1) HTML-like text between `>...<` (non-attribute) — most JSX copy lives here.
  //    Heading vs body inferred by the closest preceding tag name.
  const tagText = /<\s*([a-zA-Z][\w-]*)([^<>]*?)>([^<>{}]+?)<\s*\//g;
  let m;
  while ((m = tagText.exec(cleaned)) !== null) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    const text = m[3];
    if (!/[a-zA-Z]/.test(text)) continue;
    if (/^\s*$/.test(text)) continue;

    let bucket = 'body';
    if (/^h[1-6]$/.test(tag)) bucket = 'headings';
    else if (tag === 'button') bucket = 'ctas';
    else if (tag === 'a') bucket = (/(?:btn|nav-cta|nav-link|cta)/.test(attrs) || /\bUpgrade|Start free|Learn more|Contact|Talk to|Get|Subscribe|Sign\s/.test(text)) ? 'ctas' : 'nav';
    else if (tag === 'p' || tag === 'span') {
      // Heading-like paragraph by font size hint
      if (/text-\[(4[0-9]|[5-9][0-9]|1[0-9]{2})px\]|text-\[(\d{2}\.\d+)px\]\s.*tracking-\[-/.test(attrs)) bucket = 'headings';
      else bucket = 'body';
    } else if (tag === 'div' || tag === 'li') bucket = 'body';
    else bucket = 'other';
    push(bucket, text, { tag });
  }

  // 2) String props that hold copy: cta, name, title, subtitle, label, desc/description,
  //    extra, q, a, body[], features[], etc.
  const propPatterns = [
    { re: /\b(cta|ctaText|button|btn|action)\s*:\s*['"`]([^'"`]+)['"`]/g, bucket: 'ctas' },
    { re: /\b(name|title|heading|tagline|eyebrow)\s*:\s*['"`]([^'"`]+)['"`]/g, bucket: 'headings' },
    { re: /\b(subtitle|description|desc|body|text|extra|copy|paragraph)\s*:\s*['"`]([^'"`]+)['"`]/g, bucket: 'body' },
    { re: /\b(q|question)\s*:\s*['"`]([^'"`]+)['"`]/g, bucket: 'faqs' },
    { re: /\b(a|answer)\s*:\s*['"`]([^'"`]+)['"`]/gs, bucket: 'faqs' },
    { re: /\b(features|bullets|items|points)\s*:\s*\[([^\]]+)\]/gs, bucket: 'features' },
  ];

  for (const { re, bucket } of propPatterns) {
    let mm;
    while ((mm = re.exec(cleaned)) !== null) {
      if (bucket === 'features') {
        const arr = mm[2];
        const items = arr.match(/['"`]([^'"`]+)['"`]/g) || [];
        items.forEach(s => push('features', s.replace(/^['"`]|['"`]$/g, ''), { tag: 'arr' }));
      } else if (bucket === 'faqs') {
        push('faqs', mm[2], { tag: 'q-or-a' });
      } else {
        push(bucket, mm[2], { tag: 'prop' });
      }
    }
  }

  // 3) Multi-line literals inside JSX <p> rows that are wrapped in <span style={{display:'block'}}>...</span>
  // already handled by the tag-text scan above, but standalone string templates inside
  // {`...`} survive. Grab those that look like copy.
  const tplLiteral = /\{[^}]*?`([^`{}]{4,400})`[^}]*?\}/g;
  while ((m = tplLiteral.exec(cleaned)) !== null) {
    const t = m[1].trim();
    if (looksLikeCopy(t)) push('body', t, { tag: 'tpl' });
  }

  return buckets;
}

function fileLabel(file) {
  return path.basename(file, '.jsx');
}

function main() {
  const files = fs.readdirSync(SRC)
    .filter(f => f.endsWith('.jsx') && !SKIP.has(f))
    .sort();

  const out = [];
  out.push('# Landing v2 — Editable copy by page\n');
  out.push('Generated automatically by `scripts/extract-landing-copy.cjs`. Run it again whenever copy changes.\n');
  out.push('Each page is grouped into buckets so you can read straight through and audit:\n');
  out.push('* **Headings** — h1/h2/h3, eyebrows, big numbers');
  out.push('* **Body** — paragraphs, descriptions, taglines');
  out.push('* **Features** — bullet lists, capability rows');
  out.push('* **CTAs** — buttons + action links');
  out.push('* **FAQs** — question/answer pairs');
  out.push('* **Nav** — link labels');
  out.push('\n---\n');

  let totalLines = 0;

  for (const file of files) {
    const full = path.join(SRC, file);
    const src = fs.readFileSync(full, 'utf8');
    const b = extractFile(src);

    const counts =
      b.headings.length + b.body.length + b.features.length +
      b.ctas.length + b.faqs.length + b.nav.length;
    if (!counts) continue;

    out.push(`## ${fileLabel(file)}\n`);

    const sections = [
      ['Headings',  b.headings],
      ['Body',      b.body],
      ['Features',  b.features],
      ['CTAs',      b.ctas],
      ['FAQs',      b.faqs],
      ['Nav',       b.nav],
      ['Other',     b.other],
    ];
    for (const [label, items] of sections) {
      if (!items.length) continue;
      out.push(`### ${label}`);
      for (const it of items) out.push(`- ${it.text}`);
      out.push('');
      totalLines += items.length;
    }
    out.push('---\n');
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out.join('\n'), 'utf8');
  console.log(`[extract-landing-copy] ${files.length} pages, ${totalLines} copy items → ${OUT}`);
}

main();
