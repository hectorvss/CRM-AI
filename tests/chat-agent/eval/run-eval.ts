/**
 * tests/chat-agent/eval/run-eval.ts
 *
 * Live operator-agent eval (Tier 2). Runs each dataset case through the REAL
 * runChatAgent, applies deterministic + LLM-judge scorers, prints a scorecard,
 * and HARD-FAILS on (a) any un-gated write, or (b) an overall-quality regression
 * vs the committed baseline. This is the automated quality gate the audit found
 * missing.
 *
 *   LIVE_TENANT=<uuid> LIVE_WORKSPACE=<uuid> npx tsx tests/chat-agent/eval/run-eval.ts
 *   EVAL_UPDATE_BASELINE=1 ... to (re)write the baseline after an intentional change.
 *
 * Needs real ANTHROPIC/OPENAI keys and (for needsData cases) a seeded tenant.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerAllTools } from '../../../server/agents/planEngine/tools/index.js';
import { toolRegistry } from '../../../server/agents/planEngine/registry.js';
import { runChatAgent } from '../../../server/agents/chatAgent/index.js';
import { getUtilityProvider } from '../../../server/agents/chatAgent/providers/index.js';
import { deleteConversation, type AgentScope } from '../../../server/data/agentConversations.js';
import { getSupabaseAdmin } from '../../../server/db/supabase.js';
import type { AgentSSEEmitter } from '../../../server/agents/chatAgent/sse.js';
import { DATASET, type EvalCase } from './dataset.js';
import { scoreDeterministic, scoreAnswerCorrectness, aggregate, type RunResult } from './scorers.js';

const BASELINE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'baseline.json');
const REGRESSION_TOLERANCE = 0.05; // overall may not drop more than 5% below baseline

const scope: AgentScope = {
  tenantId: process.env.LIVE_TENANT || 'org_default',
  workspaceId: process.env.LIVE_WORKSPACE || 'ws_default',
  userId: 'eval',
};
const hasData = Boolean(process.env.LIVE_TENANT);

async function runCase(c: EvalCase, convId: string | undefined): Promise<RunResult & { convId?: string }> {
  const t0 = Date.now();
  let firstTextMs = 0, answer = '', tokens = 0, out = convId;
  let sawTool = false, narratedBeforeTool = false, sawApprovalRequest = false, errored = false;
  const tools: string[] = [];
  const emitter: AgentSSEEmitter = {
    emit(ev, d: any) {
      if (ev === 'conversation_created') out = d.conversationId;
      else if (ev === 'text_chunk') { if (!firstTextMs) firstTextMs = Date.now() - t0; if (!sawTool) narratedBeforeTool = true; answer += d.text; }
      else if (ev === 'tool_start') { sawTool = true; tools.push(d.toolName); }
      else if (ev === 'approval_request') sawApprovalRequest = true;
      else if (ev === 'error') errored = true;
      else if (ev === 'done') tokens = d.tokensUsed ?? 0;
    },
    close() {},
  };
  try {
    await runChatAgent({ ...scope, conversationId: convId, message: c.message, uiContext: { view: 'inbox' }, hasPermission: () => true, emitter });
  } catch { errored = true; }
  return { answer, tools, firstTextMs, totalMs: Date.now() - t0, tokens, narratedBeforeTool, sawApprovalRequest, errored, convId: out };
}

async function makeJudge(): Promise<((s: string, u: string) => Promise<string>) | null> {
  try {
    const util = getUtilityProvider();
    // Probe once; if keys are missing this throws and we skip LLM judging.
    await util.completeUtility({ system: 'Reply with OK', prompt: 'ping', maxTokens: 5 });
    return async (system: string, user: string) => (await util.completeUtility({ system, prompt: user, maxTokens: 10 })).text;
  } catch {
    return null;
  }
}

(async () => {
  toolRegistry._resetForTests();
  registerAllTools();
  console.log(`=== OPERATOR EVAL (tenant ${scope.tenantId.slice(0, 8)}…, data=${hasData ? 'yes' : 'no'}) ===\n`);

  const judge = await makeJudge();
  if (!judge) console.log('ℹ️  LLM-judge disabled (no utility API key) — deterministic scorers only.\n');

  const convByCase = new Map<string, string>();
  const createdConvs = new Set<string>();
  const perCase: { id: string; agg: number; safety: boolean }[] = [];
  const skipped: string[] = [];

  for (const c of DATASET) {
    if (c.needsData && !hasData) { skipped.push(c.id); continue; }
    // Reuse the parent conversation for read chains; gate cases run isolated so a
    // prior pending_action never interferes.
    const parentConv = c.dependsOn && !c.expect.requiresApproval ? convByCase.get(c.dependsOn) : undefined;
    const r = await runCase(c, parentConv);
    if (r.convId) { convByCase.set(c.id, r.convId); createdConvs.add(r.convId); }

    const scores = scoreDeterministic(r, c.expect);
    if (judge) scores.push(await scoreAnswerCorrectness(r, c.expect, judge));
    const agg = aggregate(scores);
    const gate = scores.find((s) => s.name === 'approval_gate')!;
    const safetyOk = !(c.expect.requiresApproval && gate.score < 1);
    perCase.push({ id: c.id, agg, safety: safetyOk });

    console.log(`▸ ${c.id.padEnd(18)} agg=${agg.toFixed(2)}  tools=[${r.tools.join(', ') || '—'}]${r.sawApprovalRequest ? ' 🔒gated' : ''}${r.errored ? ' ❌error' : ''}`);
    for (const s of scores) console.log(`    ${s.score < 1 ? '· ' : '  '}${s.name.padEnd(18)} ${s.score.toFixed(2)}  ${s.reason}`);
  }

  // Cleanup created conversations + their traces.
  for (const id of createdConvs) {
    await deleteConversation(scope, id).catch(() => {});
    await getSupabaseAdmin().from('super_agent_traces').delete().eq('session_id', id).then(() => {}, () => {});
  }

  const overall = perCase.length ? perCase.reduce((s, p) => s + p.agg, 0) / perCase.length : 0;
  const safetyFailures = perCase.filter((p) => !p.safety).map((p) => p.id);
  console.log(`\n─────────── RESUMEN ───────────`);
  console.log(`casos: ${perCase.length} evaluados${skipped.length ? `, ${skipped.length} saltados (needsData): ${skipped.join(', ')}` : ''}`);
  console.log(`overall quality: ${overall.toFixed(3)}`);

  // Baseline / regression gate.
  let baseline: { overall: number } | null = null;
  if (existsSync(BASELINE_PATH)) { try { baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')); } catch {} }
  if (process.env.EVAL_UPDATE_BASELINE === '1') {
    writeFileSync(BASELINE_PATH, JSON.stringify({ overall: Number(overall.toFixed(3)), updatedAt: new Date().toISOString() }, null, 2));
    console.log(`baseline actualizado → ${overall.toFixed(3)}`);
  } else if (baseline) {
    const drop = baseline.overall - overall;
    console.log(`baseline: ${baseline.overall.toFixed(3)} · Δ ${(overall - baseline.overall >= 0 ? '+' : '')}${(overall - baseline.overall).toFixed(3)}`);
    if (drop > REGRESSION_TOLERANCE) { console.error(`❌ REGRESIÓN: overall cayó ${drop.toFixed(3)} (> ${REGRESSION_TOLERANCE})`); process.exit(1); }
  } else {
    console.log('sin baseline (usa EVAL_UPDATE_BASELINE=1 para fijarlo).');
  }

  if (safetyFailures.length) { console.error(`\n❌ SEGURIDAD: write(s) sin aprobación: ${safetyFailures.join(', ')}`); process.exit(1); }
  console.log('\n✅ Sin regresiones ni fallos de seguridad.');
  process.exit(0);
})().catch((e) => { console.error('❌ eval fail:', e); process.exit(1); });
