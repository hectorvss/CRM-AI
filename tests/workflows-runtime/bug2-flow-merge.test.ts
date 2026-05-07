/**
 * tests/workflows-runtime/bug2-flow-merge.test.ts
 *
 * Bug 2: `flow.merge` is a stub. Pre-fix it returns `{merged: true}` on the
 * first incoming branch and never aggregates upstream outputs nor waits for
 * other branches.
 *
 * Workflow shape:
 *   start → A
 *   start → B
 *   A    → merge
 *   B    → merge
 *   merge → final
 *
 * After the fix:
 *   - merge fires exactly ONCE, after BOTH A and B have arrived.
 *   - merge.output.merged.from_A and from_B are populated with each
 *     branch's output.
 *   - final runs exactly once after merge.
 */

import 'dotenv/config';
import assert from 'node:assert/strict';
import { runWorkflow } from './harness.js';

async function main() {
  const workflow = {
    nodes: [
      { id: 'start', type: 'utility', key: 'data.set_fields', config: { field: 'seed', value: 'go' } },
      { id: 'A', type: 'utility', key: 'data.set_fields', config: { field: 'branchA', value: 'alpha' } },
      { id: 'B', type: 'utility', key: 'data.set_fields', config: { field: 'branchB', value: 'beta' } },
      { id: 'merge', type: 'utility', key: 'flow.merge', config: { mode: 'wait-all' } },
      { id: 'final', type: 'utility', key: 'data.set_fields', config: { field: 'final', value: 'done' } },
    ],
    edges: [
      { source: 'start', target: 'A' },
      { source: 'start', target: 'B' },
      { source: 'A', target: 'merge' },
      { source: 'B', target: 'merge' },
      { source: 'merge', target: 'final' },
    ],
  };

  const result = await runWorkflow({ workflow });

  assert.equal(result.steps.A?.status, 'completed', 'A should complete');
  assert.equal(result.steps.B?.status, 'completed', 'B should complete');
  assert.ok(result.steps.merge, 'merge step missing');
  assert.equal(result.steps.merge.status, 'completed', 'merge should complete');

  // Bug-2 assertions: merge must aggregate inputs from both branches.
  const merged = result.steps.merge.output?.merged;
  assert.ok(merged && typeof merged === 'object', `merge.output.merged should be an object, got ${JSON.stringify(merged)}`);
  assert.ok(
    'from_A' in merged,
    `merge.output.merged.from_A missing — keys: ${Object.keys(merged ?? {}).join(',')}`,
  );
  assert.ok(
    'from_B' in merged,
    `merge.output.merged.from_B missing — keys: ${Object.keys(merged ?? {}).join(',')}`,
  );

  // Final must have run.
  assert.ok(result.steps.final, 'final step should execute after merge');
  assert.equal(result.steps.final.status, 'completed', 'final should complete');

  // Merge must fire exactly once (not visited twice).
  const mergeVisits = result.visited.filter((id) => id === 'merge').length;
  assert.equal(mergeVisits, 1, `merge should fire exactly once, fired ${mergeVisits} times`);

  console.log('  ✓ PASS  bug2-flow-merge: synchronizes parallel branches and aggregates inputs');
}

main().catch((err) => {
  console.log(`  ✗ FAIL  bug2-flow-merge: ${err?.message ?? err}`);
  if (err?.stack) console.log(err.stack);
  process.exit(1);
});
