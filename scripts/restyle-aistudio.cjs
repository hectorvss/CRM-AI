#!/usr/bin/env node
/* eslint-disable no-console */
// One-shot restyle pass for AIStudio + sub-views to match the Clain/Fin
// design system. Maps generic Tailwind grays/indigo/violet/emerald to the
// Clain palette tokens used throughout src/prototype/Prototype.tsx.
//
// Usage: node scripts/restyle-aistudio.js
//
// Idempotent: replacements target the *original* utility tokens. Running
// twice is a no-op.

const fs = require('fs');
const path = require('path');

const FILES = [
  'src/components/AIStudio.tsx',
  'src/components/PermissionsView.tsx',
  'src/components/KnowledgeView.tsx',
  'src/components/ReasoningView.tsx',
  'src/components/SafetyView.tsx',
  'src/components/MinimalCategoryShell.tsx',
  'src/components/AgentNetworkGraph.tsx',
  'src/components/ActionModal.tsx',
  'src/connectionsData.ts',
  'src/components/PolicyActionsBar.tsx',
  'src/components/ConnectionsView.tsx',
];

// Order matters: more-specific patterns first.
const REPLACEMENTS = [
  // ── Borders ───────────────────────────────────────────────────────────
  [/border-gray-100\b/g,            'border-[#e9eae6]'],
  [/border-gray-200\b/g,            'border-[#e9eae6]'],
  [/border-gray-300\b/g,            'border-[#dcdcd9]'],
  [/border-gray-700\b/g,            'border-[#e9eae6]'],
  [/border-gray-800\/40\b/g,        'border-[#e9eae6]'],
  [/border-gray-800\b/g,            'border-[#e9eae6]'],

  // ── Backgrounds ───────────────────────────────────────────────────────
  [/bg-gray-50\/60\b/g,             'bg-[#f8f8f7]'],
  [/bg-gray-50\b/g,                 'bg-[#f8f8f7]'],
  [/bg-gray-100\b/g,                'bg-[#ededea]'],
  [/bg-gray-900\/40\b/g,            'bg-[#f8f8f7]'],
  [/bg-gray-900\b/g,                'bg-[#1a1a1a]'],
  [/bg-card-dark\b/g,               'bg-white'],
  [/bg-background-light\b/g,        'bg-[#f3f3f1]'],
  [/bg-background-dark\b/g,         'bg-[#f3f3f1]'],

  // ── Text colors ───────────────────────────────────────────────────────
  [/text-gray-900\b/g,              'text-[#1a1a1a]'],
  [/text-gray-800\b/g,              'text-[#1a1a1a]'],
  [/text-gray-700\b/g,              'text-[#1a1a1a]'],
  [/text-gray-600\b/g,              'text-[#646462]'],
  [/text-gray-500\b/g,              'text-[#646462]'],
  [/text-gray-400\b/g,              'text-[#a4a4a2]'],
  [/text-gray-300\b/g,              'text-[#c4c4c2]'],
  [/text-gray-950\b/g,              'text-[#1a1a1a]'],
  [/text-gray-200\b/g,              'text-[#a4a4a2]'],
  [/text-gray-100\b/g,              'text-[#ededea]'],

  // ── Sweep all coloured agent icon tokens to Clain neutral primary ────
  // The legacy AIStudio uses text-{color}-600 to differentiate agent
  // categories; in the Clain shell every icon is mono (text-[#1a1a1a]).
  [/text-(orange|emerald|rose|amber|cyan|purple|pink|blue|teal|slate|sky|stone|fuchsia|red|lime|green|yellow|indigo|violet)-(400|500|600|700)/g, 'text-[#1a1a1a]'],
  [/bg-(orange|emerald|rose|amber|cyan|purple|pink|blue|teal|slate|sky|stone|fuchsia|red|lime|green|yellow)-(400|500|600|700)/g,                'bg-[#1a1a1a]'],
  [/border-(orange|emerald|rose|amber|cyan|purple|pink|blue|teal|slate|sky|stone|fuchsia|red|lime|green|yellow|indigo|violet)-(400|500|600|700)/g, 'border-[#e9eae6]'],
  // 50/100/200 backgrounds (callout panels) → quiet neutrals
  [/bg-(orange|emerald|rose|amber|cyan|purple|pink|blue|teal|slate|sky|stone|fuchsia|red|lime|green|yellow|indigo|violet)-50/g,  'bg-[#f8f8f7]'],
  [/bg-(orange|emerald|rose|amber|cyan|purple|pink|blue|teal|slate|sky|stone|fuchsia|red|lime|green|yellow|indigo|violet)-100/g, 'bg-[#ededea]'],
  [/border-(orange|emerald|rose|amber|cyan|purple|pink|blue|teal|slate|sky|stone|fuchsia|red|lime|green|yellow|indigo|violet)-200/g, 'border-[#e9eae6]'],

  // ── Indigo accent → Clain dark / neutral ─────────────────────────────
  [/bg-indigo-50\b/g,               'bg-[#f8f8f7]'],
  [/bg-indigo-100\b/g,              'bg-[#ededea]'],
  [/bg-indigo-500\b/g,              'bg-[#1a1a1a]'],
  [/bg-indigo-600\b/g,              'bg-[#1a1a1a]'],
  [/bg-indigo-900\/20\b/g,          'bg-[#f8f8f7]'],
  [/bg-indigo-900\/40\b/g,          'bg-[#ededea]'],
  [/border-indigo-200\b/g,          'border-[#e9eae6]'],
  [/border-indigo-800\/40\b/g,      'border-[#e9eae6]'],
  [/text-indigo-600\b/g,            'text-[#1a1a1a]'],
  [/text-indigo-500\b/g,            'text-[#1a1a1a]'],
  [/text-indigo-300\b/g,            'text-[#1a1a1a]'],
  [/hover:bg-indigo-100\b/g,        'hover:bg-[#ededea]'],
  [/hover:bg-indigo-900\/40\b/g,    'hover:bg-[#ededea]'],
  // Selection/focus ring accents
  [/border-indigo-500(?!\d)/g,      'border-[#1a1a1a]'],
  [/ring-indigo-500\/20\b/g,        'ring-[#1a1a1a]/15'],
  [/focus:ring-indigo-500\/20\b/g,  'focus:ring-[#1a1a1a]/15'],
  [/focus:ring-indigo-500\b/g,      'focus:ring-[#1a1a1a]'],

  // ── Violet → Clain primary (used both for Emergency-stop CTA and toggle-on)
  [/bg-violet-500\b/g,              'bg-[#1a1a1a]'],
  [/bg-violet-600\b/g,              'bg-black'],
  [/hover:bg-violet-600\b/g,        'hover:bg-black'],
  [/border-violet-200\b/g,          'border-[#e9eae6]'],
  [/border-violet-500\/20\b/g,      'border-[#1a1a1a]'],
  [/border-violet-500\/30\b/g,      'border-[#e9eae6]'],
  [/\sdark:border-violet-500\/30\b/g, ''],
  [/text-violet-600\b/g,            'text-[#1a1a1a]'],
  [/text-violet-500\b/g,            'text-[#1a1a1a]'],

  // ── Emerald / rose / amber kept as-is for trend tones, but swap their
  // bg-50/100 helpers to neutral so cards stay quiet ──────────────────
  [/bg-emerald-50\b/g,              'bg-[#f8f8f7]'],
  [/bg-rose-50\b/g,                 'bg-[#f8f8f7]'],
  [/bg-amber-50\b/g,                'bg-[#f8f8f7]'],

  // ── Radii — Clain prefers explicit pixel values over Tailwind tokens ─
  [/rounded-2xl\b/g,                'rounded-[12px]'],
  [/rounded-xl\b/g,                 'rounded-[12px]'],
  [/rounded-lg\b/g,                 'rounded-[8px]'],
  [/rounded-md\b/g,                 'rounded-[6px]'],
  // rounded-full kept (used for pills/chips — matches Clain tag style)

  // ── Shadows — replace tailwind shadow-card / shadow-sm with Clain stack
  [/shadow-card\b/g,                'shadow-[0px_1px_2px_rgba(20,20,20,0.04)]'],
  [/shadow-sm\b/g,                  'shadow-[0px_1px_2px_rgba(20,20,20,0.04)]'],

  // ── Borders/radii unique to MinimalCategoryShell — align to Clain card style
  [/rounded-\[28px\]/g,             'rounded-[12px]'],
  [/rounded-\[24px\]/g,             'rounded-[12px]'],
  [/rounded-\[22px\]/g,             'rounded-[12px]'],
  [/border-black\/5(?!\d)/g,        'border-[#e9eae6]'],
  [/border-black\/10(?!\d)/g,       'border-[#e9eae6]'],
  [/bg-black\/\[0\.02\]/g,          'bg-[#f8f8f7]'],
  [/bg-black\/\[0\.03\]/g,          'bg-[#f8f8f7]'],
  [/bg-black\/\[0\.04\]/g,          'bg-[#ededea]'],
  [/bg-black\/5(?!\d)/g,            'bg-[#f8f8f7]'],
  [/hover:bg-black\/5(?!\d)/g,      'hover:bg-[#f8f8f7]'],

  // ── Cleanup malformed compound classes left by previous opacity-suffix mappings
  [/bg-\[#f8f8f7\]\/50\/20/g,       'bg-[#f8f8f7]/50'],
  [/bg-\[#f8f8f7\]\/50\/50/g,       'bg-[#f8f8f7]/50'],

  // ── Typography — match Fin/Clain scale used in src/prototype/Prototype.tsx
  // Specific compound first so we don't double-replace.
  [/text-3xl font-semibold tracking-tight/g, 'text-[28px] font-mono font-bold tracking-[-0.5px]'],
  [/text-3xl font-bold/g,             'text-[28px] font-mono font-bold'],
  [/text-3xl font-semibold/g,         'text-[28px] font-mono font-bold'],
  [/text-2xl font-bold/g,             'text-[20px] font-bold'],
  [/text-2xl font-semibold/g,         'text-[20px] font-bold'],
  [/text-xl font-bold/g,              'text-[16px] font-bold'],
  [/text-xl font-semibold/g,          'text-[15px] font-bold'],
  [/text-lg font-bold/g,              'text-[15px] font-bold'],
  [/text-lg font-semibold/g,          'text-[14px] font-bold'],
  [/text-base font-semibold/g,        'text-[14px] font-semibold'],
  [/text-base font-bold/g,            'text-[14px] font-bold'],
  // Bare size tokens
  [/\btext-3xl\b/g,                   'text-[28px]'],
  [/\btext-2xl\b/g,                   'text-[20px]'],
  [/\btext-xl\b/g,                    'text-[15px]'],
  [/\btext-lg\b/g,                    'text-[14px]'],
  [/\btext-base\b/g,                  'text-[13.5px]'],
  [/\btext-sm\b/g,                    'text-[13px]'],
  [/\btext-xs\b/g,                    'text-[12px]'],
  [/\btext-\[10px\] font-bold uppercase tracking-wider\b/g, 'text-[10px] font-mono uppercase tracking-[0.6px]'],
  // Drop bold + bold uppercase combinations to font-semibold (matches Fin)
  [/font-bold uppercase tracking-wider/g, 'font-mono uppercase tracking-[0.6px]'],

  // ── Spacing — tighten to Fin scale (was very generous in AIStudio) ───
  [/\bp-8\b/g,                        'p-6'],
  [/\bp-6\b/g,                        'p-5'],
  [/\bpx-8\b/g,                       'px-6'],
  [/\bpy-8\b/g,                       'py-6'],
  [/\bgap-8\b/g,                      'gap-6'],
  [/\bspace-y-8\b/g,                  'space-y-6'],
  [/\bspace-y-6\b/g,                  'space-y-5'],

  // ── Buttons — Fin uses h-7/h-8 fixed heights with px-2.5/px-3 ──────
  // Pill / rounded-full primary CTA (Enable all / Emergency stop)
  [/inline-flex items-center justify-center rounded-full border border-\[#e9eae6\] bg-white px-4 py-2 text-\[13px\] font-semibold/g,
                                     'inline-flex items-center justify-center rounded-full border border-[#e9eae6] bg-white h-8 px-3 text-[13px] font-semibold'],
  [/inline-flex items-center justify-center rounded-full bg-\[#1a1a1a\] px-4 py-2 text-\[13px\] font-semibold/g,
                                     'inline-flex items-center justify-center rounded-full bg-[#1a1a1a] h-8 px-3 text-[13px] font-semibold'],
  // Generic action pill: rounded-[12px] px-4 py-2 text-[13px] font-bold → h-8 px-3 rounded-[8px] text-[13px] font-semibold
  [/rounded-\[12px\] px-4 py-2 text-\[13px\] font-bold/g,
                                     'h-8 px-3 rounded-[8px] text-[13px] font-semibold'],
  [/rounded-\[12px\] bg-black px-4 py-2 text-\[13px\] font-bold text-white/g,
                                     'h-8 px-3 rounded-[8px] bg-[#1a1a1a] text-[13px] font-semibold text-white hover:bg-black'],
  [/rounded-\[12px\] bg-\[#f8f8f7\] px-4 py-2 text-\[13px\] font-bold text-\[#1a1a1a\] hover:bg-\[#ededea\]/g,
                                     'h-8 px-3 rounded-[8px] bg-[#f8f8f7] text-[13px] font-semibold text-[#1a1a1a] hover:bg-[#ededea] border border-[#e9eae6]'],

  // ── Shadow inner / shadow-md → flatter Fin tones ─────────────────────
  [/shadow-md\b/g,                    'shadow-[0px_1px_4px_rgba(20,20,20,0.08)]'],
  [/shadow-inner\b/g,                 ''],

  // ── Strip dark-mode variants — prototype is light-only ───────────────
  [/\sdark:bg-\[#1b1b1b\]/g,        ''],
  [/\sdark:bg-card-dark/g,          ''],
  [/\sdark:bg-\[#171717\]/g,        ''],
  [/\sdark:bg-white\/5/g,           ''],
  [/\sdark:bg-white\/\[0\.03\]/g,   ''],
  [/\sdark:bg-white\/\[0\.05\]/g,   ''],
  [/\sdark:bg-white\/\[0\.08\]/g,   ''],
  [/\sdark:bg-gray-800\b/g,         ''],
  [/\sdark:bg-gray-900\b/g,         ''],
  [/\sdark:bg-gray-900\/40\b/g,     ''],
  [/\sdark:bg-indigo-900\/20\b/g,   ''],
  [/\sdark:bg-indigo-900\/40\b/g,   ''],
  [/\sdark:hover:bg-indigo-900\/40\b/g, ''],
  [/\sdark:hover:bg-gray-800\b/g,   ''],
  [/\sdark:hover:bg-white\/5\b/g,   ''],
  [/\sdark:hover:bg-white\/\[0\.06\]/g, ''],
  [/\sdark:border-white\/5\b/g,     ''],
  [/\sdark:border-white\/10\b/g,    ''],
  [/\sdark:border-gray-700\b/g,     ''],
  [/\sdark:border-gray-800\b/g,     ''],
  [/\sdark:border-gray-800\/40\b/g, ''],
  [/\sdark:border-indigo-800\/40\b/g, ''],
  [/\sdark:text-white\b/g,          ''],
  [/\sdark:text-black\b/g,          ''],
  [/\sdark:text-gray-200\b/g,       ''],
  [/\sdark:text-gray-300\b/g,       ''],
  [/\sdark:text-gray-400\b/g,       ''],
  [/\sdark:text-indigo-300\b/g,     ''],
  [/\sdark:hover:text-gray-200\b/g, ''],
];

let changed = 0;
for (const rel of FILES) {
  const file = path.resolve(rel);
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  for (const [pat, sub] of REPLACEMENTS) {
    after = after.replace(pat, sub);
  }
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    const diff = after.length - before.length;
    console.log(`  edited ${rel}  (${diff > 0 ? '+' : ''}${diff} bytes)`);
    changed++;
  } else {
    console.log(`  unchanged ${rel}`);
  }
}
console.log(`\nDone: ${changed} of ${FILES.length} files updated.`);
