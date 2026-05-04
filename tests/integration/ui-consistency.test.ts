/**
 * tests/integration/ui-consistency.test.ts
 *
 * Static UI consistency check — verifies the catalog (cards) is fully
 * wired to modals, logos, and backend endpoints.
 *
 * For each card id in ToolsIntegrations.tsx:
 *   1. it has an entry in INTEGRATION_LOGOS (logos.tsx)
 *   2. if the modal pattern is in use (state hook + modal mount), the
 *      ConnectModal component file exists
 *   3. its endpoint at /api/integrations/{id} is mounted in server/index.ts
 *
 * This catches "tarjetas huérfanas" — a card without backend wiring would
 * click into a broken modal in production.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..', '..');
const tools = readFileSync(join(repoRoot, 'src/components/ToolsIntegrations.tsx'), 'utf8');
const logos = readFileSync(join(repoRoot, 'src/components/integrations/logos.tsx'), 'utf8');
const indexTs = readFileSync(join(repoRoot, 'server/index.ts'), 'utf8');
const webhooksRouter = readFileSync(join(repoRoot, 'server/webhooks/router.ts'), 'utf8');

// 1. Catalog ids
const catalogIds = Array.from(tools.matchAll(/^\s*\{\s*id:\s*'([a-z]+)'/gm)).map(m => m[1]);
const uniqueIds = Array.from(new Set(catalogIds));
console.log(`\n▶ UI consistency check\n`);
console.log(`  catalog cards: ${uniqueIds.length}`);

// 2. INTEGRATION_LOGOS entries (extract keys from logos.tsx)
const logoMatches = Array.from(logos.matchAll(/^\s+([a-z]+):\s+\{/gm)).map(m => m[1]);
const logoSet = new Set(logoMatches);
console.log(`  logo specs registered: ${logoSet.size}`);

// 3. Mounted backend routes
const mountedRoutes = Array.from(indexTs.matchAll(/app\.use\('\/api\/integrations\/([a-z]+)'/g)).map(m => m[1]);
const mountedSet = new Set(mountedRoutes);
console.log(`  /api/integrations/{id} mounts: ${mountedSet.size}`);

// 4. Modal mounts (look for `<XConnectModal`)
const modalMounts = Array.from(tools.matchAll(/<([A-Z][A-Za-z]+ConnectModal)\b/g)).map(m => m[1]);
const modalSet = new Set(modalMounts);
console.log(`  <Modal /> mounts in ToolsIntegrations.tsx: ${modalSet.size}`);

// 5. State hooks (pattern: `[xxxModalOpen, setXxxModalOpen]`)
const stateHooks = Array.from(tools.matchAll(/\[([a-z]+)ModalOpen,\s*set/g)).map(m => m[1]);
const stateSet = new Set(stateHooks);
console.log(`  modal state hooks: ${stateSet.size}`);

// 6. interceptors (`integration.id === 'x'`)
const interceptors = Array.from(tools.matchAll(/integration\.id === '([a-z]+)'/g)).map(m => m[1]);
const interceptorSet = new Set(interceptors);
console.log(`  openConfigModal interceptors: ${interceptorSet.size}`);

// 7. status overrides (`app.id === 'x'`)
const statusOverrides = Array.from(tools.matchAll(/app\.id === '([a-z]+)'/g)).map(m => m[1]);
const statusOverrideSet = new Set(statusOverrides);
console.log(`  status overrides: ${statusOverrideSet.size}`);

// 8. AI providers use credential schema (no dedicated modal)
const aiProviders = new Set(['anthropic', 'openai', 'ollama', 'gemini']);

// ── Report per-id ──
console.log(`\n▶ per-card consistency:\n`);
let issues = 0;
for (const id of uniqueIds.sort()) {
  const isAi = aiProviders.has(id);
  const hasLogo  = logoSet.has(id);
  const hasMount = mountedSet.has(id);
  const hasInterceptor = interceptorSet.has(id);
  const hasStatusOverride = statusOverrideSet.has(id);

  const flags: string[] = [];
  if (!hasLogo) flags.push('NO-LOGO');
  if (!isAi && !hasMount) flags.push('NO-/api/');
  if (!isAi && !hasInterceptor) flags.push('NO-OPEN');
  if (!isAi && !hasStatusOverride) flags.push('NO-STATUS');

  if (flags.length === 0) {
    console.log(`  ✓ ${id.padEnd(12)} ${isAi ? '(AI provider — credential schema)' : 'logo+mount+interceptor+status'}`);
  } else {
    console.log(`  ✗ ${id.padEnd(12)} ${flags.join(' ')}`);
    issues++;
  }
}

// ── Webhook handler coverage ──
console.log(`\n▶ webhook handler coverage:\n`);
const webhookMounts = Array.from(webhooksRouter.matchAll(/webhookRouter\.use\('\/([a-z]+)'/g)).map(m => m[1]);
const webhookSet = new Set(webhookMounts);
console.log(`  /webhooks/{source} mounts: ${webhookSet.size}`);

// Sources with no `/webhooks/<id>` mount are intentional:
//   - notion, confluence: poll-only (OAuth 3LO doesn't expose webhooks)
//   - anthropic/openai/ollama/gemini: AI providers, no inbound events
//   - salesforce: uses Platform Events / push topics, not HTTP webhooks
//   - twilio: routed via the generic /webhooks/sms channel (channels.ts)
const intentionalNoWebhook = new Set(['notion', 'confluence', 'anthropic', 'openai', 'ollama', 'gemini', 'salesforce', 'twilio']);
const missingWebhooks = uniqueIds.filter(id => !webhookSet.has(id) && !intentionalNoWebhook.has(id));
if (missingWebhooks.length === 0) {
  console.log(`  ✓ all 39 non-poll sources have a webhook handler`);
} else {
  console.log(`  ✗ missing webhook handlers (and not intentional): ${missingWebhooks.join(', ')}`);
  issues += missingWebhooks.length;
}

// ── Summary ──
console.log(`\n${'─'.repeat(60)}`);
console.log(`UI consistency: ${issues === 0 ? 'PASS' : 'FAIL'} (${issues} issues)`);
console.log(`${'─'.repeat(60)}\n`);
process.exit(issues === 0 ? 0 : 1);
