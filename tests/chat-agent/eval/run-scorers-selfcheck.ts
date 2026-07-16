/**
 * tests/chat-agent/eval/run-scorers-selfcheck.ts
 *
 * Offline validation of the deterministic eval scorers (no LLM, no Supabase).
 * Confirms the harness scores known-good and known-bad runs correctly before we
 * trust it to gate real agent quality.
 */
import { scoreDeterministic, aggregate, type RunResult, type CaseExpect } from './scorers.js';

function run(partial: Partial<RunResult>): RunResult {
  return {
    answer: '', tools: [], firstTextMs: 1000, totalMs: 2000, tokens: 5000,
    narratedBeforeTool: true, sawApprovalRequest: false, errored: false, ...partial,
  };
}

interface Check { label: string; r: RunResult; e: CaseExpect; scorer: string; expect: (s: number) => boolean; }

const checks: Check[] = [
  // status question, situation injected → best with 0 tools
  { label: 'status w/ 0 tools → tool_relevance 1', r: run({ tools: [] }), e: { toolsAnyOf: [] }, scorer: 'tool_relevance', expect: (s) => s === 1 },
  { label: 'status w/ 3 tools → tool_relevance < 1', r: run({ tools: ['a', 'b', 'c'] }), e: { toolsAnyOf: [] }, scorer: 'tool_relevance', expect: (s) => s < 1 },
  { label: 'expected tool called → tool_relevance 1', r: run({ tools: ['case.get'] }), e: { toolsAnyOf: ['case.get', 'case.timeline'] }, scorer: 'tool_relevance', expect: (s) => s === 1 },
  { label: 'wrong tool → tool_relevance 0', r: run({ tools: ['order.get'] }), e: { toolsAnyOf: ['case.get'] }, scorer: 'tool_relevance', expect: (s) => s === 0 },
  { label: 'forbidden tool → tool_relevance 0', r: run({ tools: ['payment.refund'] }), e: { toolsAnyOf: ['case.get'], toolsNoneOf: ['payment.refund'] }, scorer: 'tool_relevance', expect: (s) => s === 0 },

  // approval gate — the T1.1 safety guarantee
  { label: 'write gated → approval_gate 1', r: run({ sawApprovalRequest: true }), e: { requiresApproval: true }, scorer: 'approval_gate', expect: (s) => s === 1 },
  { label: 'write NOT gated → approval_gate 0', r: run({ sawApprovalRequest: false }), e: { requiresApproval: true }, scorer: 'approval_gate', expect: (s) => s === 0 },

  // efficiency & narration & errors
  { label: 'few fast tools → efficiency 1', r: run({ tools: ['a'], firstTextMs: 1500 }), e: { maxTools: 4 }, scorer: 'efficiency', expect: (s) => s === 1 },
  { label: 'tool thrash → efficiency < 1', r: run({ tools: ['a', 'b', 'c', 'd', 'e', 'f'], firstTextMs: 1500 }), e: { maxTools: 4 }, scorer: 'efficiency', expect: (s) => s < 1 },
  { label: 'tool w/o narration → narration 0', r: run({ tools: ['a'], narratedBeforeTool: false }), e: {}, scorer: 'narration', expect: (s) => s === 0 },
  { label: 'errored run → no_error 0', r: run({ errored: true }), e: {}, scorer: 'no_error', expect: (s) => s === 0 },
  { label: 'missing mention → must_mention < 1', r: run({ answer: 'hola' }), e: { mustMention: ['reembolso'] }, scorer: 'must_mention', expect: (s) => s < 1 },
];

let ok = true;
for (const c of checks) {
  const scores = scoreDeterministic(c.r, c.e);
  const s = scores.find((x) => x.name === c.scorer)!;
  const pass = c.expect(s.score);
  ok = ok && pass;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${c.label.padEnd(44)} ${c.scorer}=${s.score.toFixed(2)}`);
}

// aggregate sanity: a perfect read run scores ~1
const perfect = aggregate(scoreDeterministic(run({ tools: [], answer: 'ok' }), { toolsAnyOf: [] }));
const perfectOk = perfect > 0.95;
ok = ok && perfectOk;
console.log(`${perfectOk ? 'OK  ' : 'FAIL'} perfect read run aggregate ~1 (got ${perfect.toFixed(2)})`);

console.log(ok ? '\n✅ Scorers deterministas correctos' : '\n❌ Fallos en los scorers');
process.exit(ok ? 0 : 1);
