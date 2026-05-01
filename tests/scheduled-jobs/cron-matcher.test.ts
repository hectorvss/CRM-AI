/**
 * tests/scheduled-jobs/cron-matcher.test.ts
 *
 * Unit tests for the minimal 5-field cron matcher used by sweepScheduledWorkflows.
 *
 * The function `cronMatchesNow` is not exported by scheduledJobs.ts, so we
 * duplicate the same logic here to keep tests self-contained. If the
 * implementation changes, update this file accordingly.
 *
 * Run:  npx tsx tests/scheduled-jobs/cron-matcher.test.ts
 */

import assert from 'node:assert/strict';

// ── Inline the matcher (mirrors server/queue/scheduledJobs.ts) ──────────────

function cronMatchesNow(cron: string, now: Date): boolean {
  try {
    const [minF, hourF, domF, monF, dowF] = cron.trim().split(/\s+/);
    const matchField = (field: string, value: number): boolean => {
      if (field === '*') return true;
      if (field.startsWith('*/')) {
        const step = parseInt(field.slice(2), 10);
        return !isNaN(step) && value % step === 0;
      }
      return field.split(',').map(Number).includes(value);
    };
    return (
      matchField(minF,  now.getUTCMinutes()) &&
      matchField(hourF, now.getUTCHours())   &&
      matchField(domF,  now.getUTCDate())    &&
      matchField(monF,  now.getUTCMonth() + 1) &&
      matchField(dowF,  now.getUTCDay())
    );
  } catch { return false; }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function utcDate(year: number, month: number, day: number, hour: number, minute: number, weekday?: number): Date {
  // month is 1-based here for readability
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  return d;
}

// ── Test cases ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(label: string, cron: string, date: Date, expected: boolean): void {
  const actual = cronMatchesNow(cron, date);
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL [${label}]: cron="${cron}" date=${date.toISOString()} — expected ${expected}, got ${actual}`);
  }
}

// Every minute
test('every minute - matches',   '* * * * *', utcDate(2026, 4, 27, 10, 30), true);
test('every minute - also matches', '* * * * *', utcDate(2026, 1, 1, 0, 0), true);

// Specific minute + hour
test('exact min+hour - match',       '30 10 * * *', utcDate(2026, 4, 27, 10, 30), true);
test('exact min+hour - wrong minute', '30 10 * * *', utcDate(2026, 4, 27, 10, 31), false);
test('exact min+hour - wrong hour',   '30 10 * * *', utcDate(2026, 4, 27, 11, 30), false);

// Step values
test('every 5 min - minute=0',   '*/5 * * * *', utcDate(2026, 4, 27, 9, 0),  true);
test('every 5 min - minute=15',  '*/5 * * * *', utcDate(2026, 4, 27, 9, 15), true);
test('every 5 min - minute=17',  '*/5 * * * *', utcDate(2026, 4, 27, 9, 17), false);
test('every 2 hours - hour=4',   '0 */2 * * *', utcDate(2026, 4, 27, 4, 0),  true);
test('every 2 hours - hour=3',   '0 */2 * * *', utcDate(2026, 4, 27, 3, 0),  false);

// Day of month
test('dom match', '0 9 15 * *', utcDate(2026, 4, 15, 9, 0), true);
test('dom mismatch', '0 9 15 * *', utcDate(2026, 4, 16, 9, 0), false);

// Month
test('month match', '0 0 1 6 *', utcDate(2026, 6, 1, 0, 0), true);
test('month mismatch', '0 0 1 6 *', utcDate(2026, 5, 1, 0, 0), false);

// Day of week (0=Sunday)
// 2026-04-27 is a Monday (dow=1)
test('dow monday match',   '0 8 * * 1', utcDate(2026, 4, 27, 8, 0), true);
test('dow tuesday mismatch', '0 8 * * 2', utcDate(2026, 4, 27, 8, 0), false);

// Comma-separated values
test('comma min match',  '0,30 * * * *', utcDate(2026, 4, 27, 10, 30), true);
test('comma min match2', '0,30 * * * *', utcDate(2026, 4, 27, 10, 0),  true);
test('comma min miss',   '0,30 * * * *', utcDate(2026, 4, 27, 10, 15), false);

// Invalid cron — should return false gracefully
test('invalid cron', 'not a cron', new Date(), false);
test('empty cron',   '',           new Date(), false);
test('too few fields', '* * *',    new Date(), false);

// Daily midnight
test('midnight daily match', '0 0 * * *', utcDate(2026, 4, 27, 0, 0), true);
test('midnight daily miss',  '0 0 * * *', utcDate(2026, 4, 27, 0, 1), false);

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\nCron matcher: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
