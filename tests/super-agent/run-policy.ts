import { readFileSync } from 'node:fs';
import path from 'node:path';
import { registerAllTools } from '../../server/agents/planEngine/tools/index.js';
import { toolRegistry } from '../../server/agents/planEngine/registry.js';
import { evaluatePlan, aggregateDecision } from '../../server/agents/planEngine/policy.js';
import type { Plan, PolicyDecision } from '../../server/agents/planEngine/types.js';

type PolicyCase = {
  name: string;
  plan: Plan;
  permissions: string[];
  expected: Array<Partial<PolicyDecision>>;
};

function loadPolicyCases(): PolicyCase[] {
  const file = path.resolve(process.cwd(), 'tests/super-agent/golden/policy.jsonl');
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PolicyCase);
}

function compareSubset(actual: unknown, expected: unknown, pathName = 'root'): string[] {
  if (expected === undefined) return [];
  if (expected === null || typeof expected !== 'object') {
    return Object.is(actual, expected) ? [] : [`${pathName}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`];
  }
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && JSON.stringify(actual) === JSON.stringify(expected)
      ? []
      : [`${pathName}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`];
  }
  if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
    return [`${pathName}: expected object, got ${JSON.stringify(actual)}`];
  }
  const failures: string[] = [];
  for (const [key, value] of Object.entries(expected)) {
    failures.push(...compareSubset((actual as Record<string, unknown>)[key], value, `${pathName}.${key}`));
  }
  return failures;
}

async function main() {
  toolRegistry._resetForTests();
  registerAllTools();

  const cases = loadPolicyCases();
  const failures: Array<{ name: string; reasons: string[] }> = [];

  for (const testCase of cases) {
    const decisions = await evaluatePlan(testCase.plan, toolRegistry as any, {
      tenantId: 'tenant_test',
      workspaceId: 'workspace_test',
      userId: 'user_test',
      hasPermission: (permission: string) => testCase.permissions.includes(permission) || testCase.permissions.includes('*'),
    });

    const aggregated = aggregateDecision(decisions);
    const step = decisions[0];
    const reasons = compareSubset(step, testCase.expected[0], `${testCase.name}.step0`);
    if (reasons.length > 0) {
      failures.push({
        name: testCase.name,
        reasons,
      });
      continue;
    }

    const expectedAction = testCase.expected[0]?.action;
    if (expectedAction && aggregated !== expectedAction && !(expectedAction === 'allow' && aggregated === 'require_approval' && step?.tool === 'approval.decide')) {
      failures.push({
        name: testCase.name,
        reasons: [`aggregated: expected ${expectedAction}, got ${aggregated}`],
      });
    }
  }

  console.log(`Super Agent policy set: ${cases.length - failures.length}/${cases.length} passed`);

  if (failures.length > 0) {
    console.error('');
    console.error('Failures:');
    for (const failure of failures) {
      console.error(`- ${failure.name}`);
      for (const reason of failure.reasons) {
        console.error(`  - ${reason}`);
      }
    }
    process.exit(1);
  }
}

main();
