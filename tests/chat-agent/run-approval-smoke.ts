/**
 * tests/chat-agent/run-approval-smoke.ts
 *
 * End-to-end smoke of the phase-2 approval flow WITHOUT an LLM key:
 * a scripted provider requests a high-risk tool (payment.refund), the loop
 * pauses (approval_request + pending_action persisted), then a resume run
 * approves/rejects and continues. Asserts the gate, checkpoint persistence,
 * and both decision paths.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Run:
 *   npx tsx tests/chat-agent/run-approval-smoke.ts
 */
import assert from 'node:assert/strict';
import { registerAllTools } from '../../server/agents/planEngine/tools/index.js';
import { toolRegistry } from '../../server/agents/planEngine/registry.js';
import { runChatAgent } from '../../server/agents/chatAgent/index.js';
import { _setProvidersForTests } from '../../server/agents/chatAgent/providers/index.js';
import type { ChatLLMProvider, StreamChatResult } from '../../server/agents/chatAgent/providers/types.js';
import { getConversation, listMessages, deleteConversation, type AgentScope } from '../../server/data/agentConversations.js';
import type { AgentSSEEmitter } from '../../server/agents/chatAgent/sse.js';

toolRegistry._resetForTests();
registerAllTools();

const RISKY_TOOL = 'payment.refund';
assert.ok(toolRegistry.get(RISKY_TOOL), `${RISKY_TOOL} must be registered`);
assert.ok(['high', 'critical'].includes(toolRegistry.get(RISKY_TOOL)!.risk), `${RISKY_TOOL} must be high/critical`);

const scope: AgentScope = { tenantId: 'org_default', workspaceId: 'ws_default', userId: 'approval-test-user' };

function collector() {
  const events: Array<{ event: string; data: any }> = [];
  const emitter: AgentSSEEmitter = { emit: (event, data) => events.push({ event, data }), close: () => {} };
  return { events, emitter };
}

// Provider that: turn 1 → requests the risky tool; any later turn → final text.
function makeProvider(): ChatLLMProvider {
  let calls = 0;
  return {
    async streamChat(opts): Promise<StreamChatResult> {
      calls++;
      // The risky tool is only proposed on the very first model turn of the
      // original run. On resume the checkpoint already contains that turn, so
      // the first streamChat of the resume run is the continuation.
      const alreadyHasRefund = opts.messages.some(
        (m) => m.role === 'assistant' && m.toolCalls?.some((tc) => tc.toolName === RISKY_TOOL),
      );
      if (!alreadyHasRefund) {
        opts.onTextDelta('Voy a reembolsar el pago. ');
        return {
          text: 'Voy a reembolsar el pago. ',
          toolCalls: [{ id: 'call_refund', toolName: RISKY_TOOL, args: { paymentId: 'pay_test_123', amount: 10 } }],
          usage: { inputTokens: 80, outputTokens: 15 },
          stopReason: 'tool_use',
          model: 'fake-sonnet',
        };
      }
      opts.onTextDelta('Hecho.');
      return { text: 'Hecho.', toolCalls: [], usage: { inputTokens: 90, outputTokens: 10 }, stopReason: 'end_turn', model: 'fake-sonnet' };
    },
    async completeUtility() {
      return { text: 'Reembolso de pago', usage: { inputTokens: 5, outputTokens: 3 }, model: 'fake-mini' };
    },
  };
}

async function runScenario(decision: 'approve' | 'reject') {
  _setProvidersForTests(makeProvider(), makeProvider());

  // ── Turn 1: hits the gate ────────────────────────────────────────────────
  const first = collector();
  await runChatAgent({ ...scope, message: 'reembolsa el pago pay_test_123', hasPermission: () => true, emitter: first.emitter });

  const names1 = first.events.map((e) => e.event);
  assert.ok(names1.includes('approval_request'), `[${decision}] must emit approval_request`);
  const approval = first.events.find((e) => e.event === 'approval_request')!.data;
  assert.equal(approval.toolName, RISKY_TOOL);
  assert.ok(approval.proposalId, 'approval must carry a proposalId');
  assert.ok(approval.preview?.includes('paymentId') || approval.preview?.length > 0, 'preview present');
  const done1 = first.events[first.events.length - 1];
  assert.equal(done1.event, 'done');
  assert.equal(done1.data.finishReason, 'approval_pending');
  // The risky tool must NOT have executed yet.
  assert.ok(!names1.includes('tool_result'), `[${decision}] no tool ran before approval`);

  const conversationId = first.events[0].data.conversationId as string;
  const parked = await getConversation(scope, conversationId);
  assert.equal(parked!.status, 'awaiting_approval', 'conversation parked');
  assert.ok(parked!.pending_action, 'pending_action persisted');
  assert.equal((parked!.pending_action as any).proposalId, approval.proposalId);
  assert.ok((parked!.pending_action as any).preview, 'preview stored for reload');
  // Title must be set at the gate (the gate returns before the normal block).
  assert.notEqual(parked!.title, 'New conversation', 'title generated at the gate');
  // No duplicate narration: only the user message is persisted before resume.
  const parkedMsgs = await listMessages(scope, conversationId);
  assert.equal(parkedMsgs.length, 1, 'only the user message persisted at the gate (no duplicate assistant)');
  assert.equal(parkedMsgs[0].role, 'user');

  // ── Resume: approve or reject ────────────────────────────────────────────
  const second = collector();
  await runChatAgent({
    ...scope,
    conversationId,
    message: '',
    hasPermission: () => true,
    emitter: second.emitter,
    resume: { proposalId: approval.proposalId, decision, feedback: decision === 'reject' ? 'No autorizado' : undefined },
  });

  const names2 = second.events.map((e) => e.event);
  const toolResult = second.events.find((e) => e.event === 'tool_result')!.data;
  assert.equal(toolResult.toolName, RISKY_TOOL);
  if (decision === 'approve') {
    // Approved → the tool actually starts and runs (ok value depends on
    // whether the fake payment exists; we only assert it executed).
    assert.ok(names2.includes('tool_start'), '[approve] tool must start');
    assert.notEqual(toolResult.data?.rejectedByUser, true, '[approve] not a rejection');
  } else {
    // Rejected → no tool_start (nothing ran); result flags the rejection.
    assert.ok(!names2.includes('tool_start'), '[reject] tool must NOT start');
    assert.equal(toolResult.ok, false, '[reject] rejected result is not ok');
    assert.equal(toolResult.data.rejectedByUser, true, '[reject] rejection is flagged');
  }
  const done2 = second.events[second.events.length - 1];
  assert.equal(done2.event, 'done');
  assert.equal(done2.data.finishReason, 'stop', `[${decision}] resume finishes cleanly`);

  // Checkpoint cleared.
  const resumed = await getConversation(scope, conversationId);
  assert.equal(resumed!.status, 'active', 'status back to active');
  assert.equal(resumed!.pending_action, null, 'pending_action cleared');
  // Exactly one assistant message persisted for the whole logical turn — no
  // duplication from the gate.
  const finalMsgs = await listMessages(scope, conversationId);
  assert.equal(finalMsgs.length, 2, 'user + single assistant message (no duplicate narration)');
  assert.equal(finalMsgs[1].role, 'assistant');

  await deleteConversation(scope, conversationId);
  console.log(`✅ [${decision}] gate → pending_action → resume → ${decision === 'approve' ? 'executed' : 'rejected'} → cleared`);
}

(async () => {
  await runScenario('approve');
  await runScenario('reject');
  console.log('\nApproval flow holds for both decisions.');
  process.exit(0);
})().catch((err) => { console.error('❌', err); process.exit(1); });
