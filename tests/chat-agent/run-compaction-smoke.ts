/**
 * tests/chat-agent/run-compaction-smoke.ts
 *
 * Offline test for conversation compaction (Tier 3). No LLM, no Supabase — a
 * fake summarizer is injected. Verifies: long histories compact at a user
 * boundary (no orphan tool_result), the summary is folded into the first kept
 * user message, tool_use/tool_result pairs stay intact, and short histories are
 * left untouched.
 */
import { compactHistory } from '../../server/agents/chatAgent/compaction.js';
import type { ProviderMessage } from '../../server/agents/chatAgent/providers/types.js';

const fakeSummarize = async () => 'RESUMEN: caso 123 del cliente Ada; reembolso pendiente de aprobación.';

// Build 10 turns: user → assistant(+toolCall) → tool_result, with long content.
function longHistory(turns: number): ProviderMessage[] {
  const pad = 'x'.repeat(1200);
  const out: ProviderMessage[] = [];
  for (let i = 0; i < turns; i++) {
    out.push({ role: 'user', content: `pregunta ${i} ${pad}` });
    out.push({ role: 'assistant', content: `respuesta ${i} ${pad}`, toolCalls: [{ id: `tc${i}`, toolName: 'case.get', args: { id: String(i) } }] });
    out.push({ role: 'tool_result', toolCallId: `tc${i}`, content: `result ${i}`, isError: false });
  }
  return out;
}

let ok = true;
const assert = (label: string, cond: boolean) => { ok = ok && cond; console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}`); };

// 1) Long history compacts.
{
  const hist = longHistory(10); // 30 messages, ~36k chars
  const res = await compactHistory(hist, fakeSummarize, { keepRecent: 12, maxChars: 24_000 });
  assert('long history compacts', res.compacted === true);
  assert('first kept message is a user message', res.messages[0].role === 'user');
  assert('summary folded into first user message', res.messages[0].content.includes('RESUMEN'));
  assert('kept window does not start with an orphan tool_result', res.messages[0].role !== 'tool_result');
  assert('kept window smaller than original', res.messages.length < hist.length);
  // Every tool_result in the kept window has a preceding assistant with that toolCall.
  let pairingOk = true;
  for (let i = 0; i < res.messages.length; i++) {
    const m = res.messages[i];
    if (m.role === 'tool_result') {
      const prev = res.messages[i - 1] as any;
      if (!prev || prev.role !== 'assistant' || !(prev.toolCalls ?? []).some((tc: any) => tc.id === (m as any).toolCallId)) pairingOk = false;
    }
  }
  assert('tool_use/tool_result pairs intact in kept window', pairingOk);
}

// 2) Short history is untouched.
{
  const hist = longHistory(2); // 6 messages, well under threshold
  const res = await compactHistory(hist, fakeSummarize, { keepRecent: 12, maxChars: 24_000 });
  assert('short history not compacted', res.compacted === false && res.messages.length === hist.length);
}

// 3) Summarizer failure is non-fatal (returns original).
{
  const hist = longHistory(10);
  const res = await compactHistory(hist, async () => { throw new Error('boom'); }, { keepRecent: 12, maxChars: 24_000 }).catch(() => null);
  // compactHistory itself doesn't swallow — the caller does; here we just ensure it throws (caller falls back).
  assert('summarizer error propagates for caller fallback', res === null);
}

console.log(ok ? '\n✅ Compactación correcta' : '\n❌ Fallos en la compactación');
process.exit(ok ? 0 : 1);
