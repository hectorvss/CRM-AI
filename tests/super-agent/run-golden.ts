import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCommandIntent, type CommandContext, type StructuredCommand } from '../../server/agents/superAgent/intent.js';

type GoldenCase = {
  input: string;
  context?: CommandContext;
  expected: Partial<StructuredCommand> & {
    navigationTarget?: Partial<StructuredCommand['navigationTarget']>;
  };
};

function loadGoldenCases(): Array<GoldenCase & { file: string; line: number }> {
  const dir = path.resolve(process.cwd(), 'tests/super-agent/golden');
  const files = readdirSync(dir).filter((file) => file.endsWith('.jsonl'));
  const cases: Array<GoldenCase & { file: string; line: number }> = [];

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const lines = readFileSync(fullPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    lines.forEach((line, index) => {
      const parsed = JSON.parse(line) as GoldenCase;
      cases.push({
        ...parsed,
        file: fullPath,
        line: index + 1,
      });
    });
  }

  return cases;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  if (!isPlainObject(actual)) {
    return [`${pathName}: expected object, got ${JSON.stringify(actual)}`];
  }

  const failures: string[] = [];
  for (const [key, value] of Object.entries(expected)) {
    failures.push(...compareSubset(actual[key], value, `${pathName}.${key}`));
  }
  return failures;
}

function compareCase(actual: StructuredCommand, expected: GoldenCase['expected']) {
  const normalizedActual = {
    ...actual,
    navigationTarget: actual.navigationTarget
      ? {
          page: actual.navigationTarget.page,
          entityType: actual.navigationTarget.entityType,
          entityId: actual.navigationTarget.entityId,
          section: actual.navigationTarget.section,
          sourceContext: actual.navigationTarget.sourceContext,
          runId: actual.navigationTarget.runId,
        }
      : null,
  };

  return compareSubset(normalizedActual, expected);
}

function main() {
  const cases = loadGoldenCases();
  if (!cases.length) {
    console.error('No golden cases found in tests/super-agent/golden');
    process.exit(1);
  }

  const failures: Array<{ file: string; line: number; input: string; reasons: string[] }> = [];

  for (const testCase of cases) {
    const actual = parseCommandIntent(testCase.input, testCase.context);
    const reasons = compareCase(actual, testCase.expected);
    if (reasons.length > 0) {
      failures.push({
        file: testCase.file,
        line: testCase.line,
        input: testCase.input,
        reasons,
      });
    }
  }

  const passed = cases.length - failures.length;
  console.log(`Super Agent golden set: ${passed}/${cases.length} passed`);

  if (failures.length > 0) {
    console.error('');
    console.error('Failures:');
    for (const failure of failures.slice(0, 12)) {
      console.error(`- ${failure.file}:${failure.line} :: ${failure.input}`);
      for (const reason of failure.reasons) {
        console.error(`  - ${reason}`);
      }
    }
    process.exit(1);
  }
}

main();
