/**
 * tests/fin-agent/run-settings-smoke.ts
 *
 * P2: the "Ajustes" screen fields (identity / caps / validation) round-trip
 * through patchFinConfig → loadFinConfig, and identity changes are reflected in
 * Fin's generate system prompt (so changing tone/name really changes answers).
 *
 * Run: npx tsx tests/fin-agent/run-settings-smoke.ts
 */
import assert from 'node:assert/strict';
import { loadFinConfig, patchFinConfig, type FinScope } from '../../server/agents/finAgent/index.js';
import { buildGenerateSystem } from '../../server/agents/finAgent/prompts.js';

const scope: FinScope = { tenantId: 'org_default', workspaceId: 'ws_default' };

async function restore() {
  await patchFinConfig(scope, {
    identity: { name: 'Fin', tone: 'friendly', answer_length: 'balanced', formality: 'tú', languages: ['es', 'en'] },
    caps: { daily_replies: null, alert_email: null },
    validation: { confidence_threshold: 0.6 },
  });
}

const run = async () => {
  await restore();

  // Patch each group the way the UI does (partial patches, deep-merged server-side).
  await patchFinConfig(scope, { identity: { name: 'Clara', tone: 'professional', answer_length: 'concise', formality: 'usted' } });
  await patchFinConfig(scope, { identity: { languages: ['es', 'en', 'fr'] } });
  await patchFinConfig(scope, { caps: { daily_replies: 250, alert_email: 'alertas@clain.app' } });
  await patchFinConfig(scope, { validation: { confidence_threshold: 0.8 } });

  const cfg = await loadFinConfig(scope);
  assert.equal(cfg.identity.name, 'Clara', 'name persisted');
  assert.equal(cfg.identity.tone, 'professional', 'tone persisted');
  assert.equal(cfg.identity.answer_length, 'concise', 'answer_length persisted');
  assert.equal(cfg.identity.formality, 'usted', 'formality persisted');
  assert.deepEqual(cfg.identity.languages, ['es', 'en', 'fr'], 'languages persisted (partial patch did not drop name/tone)');
  assert.equal(cfg.caps.daily_replies, 250, 'daily_replies persisted');
  assert.equal(cfg.caps.alert_email, 'alertas@clain.app', 'alert_email persisted');
  assert.equal(cfg.validation.confidence_threshold, 0.8, 'confidence_threshold persisted');

  // The changes must actually reach Fin's generate prompt.
  const sys = buildGenerateSystem(cfg, [], 'untrusted');
  assert.ok(sys.includes('Clara'), 'prompt uses the new name');
  assert.ok(sys.includes('professional'), 'prompt uses the new tone');
  assert.ok(sys.includes('usted'), 'prompt uses the new formality');
  assert.ok(/short|2-4 sentences/i.test(sys), 'prompt reflects concise length');

  console.log('✓ fin-agent settings (Ajustes) round-trip + prompt smoke passed');
  await restore();
};

run().then(() => process.exit(0), async (e) => { await restore().catch(() => {}); console.error('✗ FAILED:', e); process.exit(1); });
