/**
 * server/runtime/workflowServices.ts
 *
 * Injectable services bundle for the workflow executor.
 *
 * Why this exists
 * ───────────────
 * `executeWorkflowNode` in `server/routes/workflows.ts` is ~3000+ lines and
 * directly imports / calls dozens of side-effectful collaborators:
 *   - Supabase admin client (`getSupabaseAdmin()`)
 *   - `integrationRegistry` (Shopify, Stripe, Slack, Gmail, Outlook, …)
 *   - `channelSenders` (sendEmail / sendSms / sendWhatsApp)
 *   - direct `fetch` for OAuth refresh + AI providers
 *   - audit log writes
 *   - several repositories
 *
 * The only way to unit-test the executor today is to spin up the entire HTTP
 * stack with a real Supabase + real network. That's why historical "fixes"
 * to nodes like `flow.loop` have shipped without runtime verification.
 *
 * This bundle gives the executor (and therefore tests) one consistent place
 * to swap real services for mocks. Production code calls
 * `createDefaultServices()` which wires the same singletons the route uses
 * inline today. Tests build a `WorkflowServices` with in-memory fakes.
 *
 * Migration plan (incremental)
 * ────────────────────────────
 * Phase A (this PR): pilot on `flow.loop` and `notification.email` only.
 *   The 3rd parameter on `executeWorkflowNode` is OPTIONAL — if omitted,
 *   the executor falls back to the existing inline behaviour, so production
 *   keeps working unchanged.
 *
 * Phase B (next PRs): migrate the remaining ~100 node handlers one at a
 *   time, replacing inline `getSupabaseAdmin()` / `integrationRegistry.get()`
 *   / `sendEmail()` calls with `services.supabase` / `services.integrations.get()`
 *   / `services.channels.email()`.
 *
 * Once every handler routes through `services`, we can drop the optional
 * fallback and make the parameter required. At that point the executor is
 * fully unit-testable.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Channel sender shape ────────────────────────────────────────────────────
// We deliberately re-declare the shape here (instead of `typeof sendEmail`)
// so the bundle does NOT pull `server/pipeline/channelSenders.ts` (and its
// integration imports) into test bundles when only a mock is needed.
export interface ChannelSendResultLite {
  messageId: string | null;
  simulated?: boolean;
  error?: string;
  [key: string]: any;
}

export type EmailSender = (
  to: string,
  subject: string,
  content: string,
  ref?: string,
) => Promise<ChannelSendResultLite>;

export type SmsSender = (
  to: string,
  content: string,
  ref?: string,
) => Promise<ChannelSendResultLite>;

export type WhatsAppSender = (
  to: string,
  content: string,
  ref?: string,
) => Promise<ChannelSendResultLite>;

export interface ChannelSenders {
  email: EmailSender;
  sms: SmsSender;
  whatsapp: WhatsAppSender;
}

// ── Integration registry shape ──────────────────────────────────────────────
// Mirrors the public surface of `server/integrations/registry.ts` we actually
// use from the executor. Tests can implement only `get()` and skip the rest.
export interface IntegrationRegistryLike {
  get<T = any>(key: string): T | undefined;
  has(key: string): boolean;
}

// ── Audit log entry ─────────────────────────────────────────────────────────
export interface WorkflowAuditEntry {
  tenantId: string;
  workspaceId: string;
  workflowRunId?: string;
  nodeId?: string;
  action: string;
  payload?: any;
  actorId?: string | null;
  at?: string;
}

export type AuditLogger = (entry: WorkflowAuditEntry) => Promise<void>;

// ── AI provider keys ────────────────────────────────────────────────────────
// Read from env at construction time, but tests can stub them out.
export interface AiKeys {
  gemini?: string;
  anthropic?: string;
  openai?: string;
  ollamaUrl?: string;
}

// ── Clock ───────────────────────────────────────────────────────────────────
// Allows deterministic tests for delay / wait nodes.
export interface Clock {
  now: () => Date;
  // Returns a Promise that resolves after `ms`. Tests override to a no-op.
  sleep: (ms: number) => Promise<void>;
}

// ── The bundle ──────────────────────────────────────────────────────────────
export interface WorkflowServices {
  /** Supabase service-role client. RLS is bypassed; callers MUST scope by tenant. */
  supabase: SupabaseClient;
  /** Lazy-loaded integration adapters. Returns undefined if not configured. */
  integrations: IntegrationRegistryLike;
  /** Email / SMS / WhatsApp senders. Throw on misconfiguration in prod. */
  channels: ChannelSenders;
  /** Replaceable fetch. Defaults to globalThis.fetch. Tests inject a stub. */
  fetchImpl: typeof fetch;
  /** Append-only audit log writer. */
  auditLog: AuditLogger;
  /** AI provider credentials snapshot. */
  aiKeys: AiKeys;
  /** Time source — tests freeze this. */
  clock: Clock;
}

/**
 * Build the production wiring. Only call this from a request-handling code
 * path that actually needs to execute workflows; cheap to call (singletons
 * underneath) but not free.
 */
export function createDefaultServices(): WorkflowServices {
  // Imports are deferred to runtime so the test bundle can import the TYPES
  // from this file without dragging the integration registry / supabase
  // client in unless `createDefaultServices` is actually called.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { getSupabaseAdmin } = require('../db/supabase.js');
  const { integrationRegistry } = require('../integrations/registry.js');
  const { sendEmail, sendSms, sendWhatsApp } = require('../pipeline/channelSenders.js');
  const { config: appConfig } = require('../config.js');
  /* eslint-enable @typescript-eslint/no-var-requires */

  return {
    supabase: getSupabaseAdmin(),
    integrations: integrationRegistry as IntegrationRegistryLike,
    channels: {
      email: sendEmail as EmailSender,
      sms: sendSms as SmsSender,
      whatsapp: sendWhatsApp as WhatsAppSender,
    },
    fetchImpl: globalThis.fetch.bind(globalThis),
    auditLog: async () => {
      // The current code writes audit entries inline; placeholder until
      // Phase B migrates those call sites through `services.auditLog`.
    },
    aiKeys: {
      gemini: appConfig?.geminiApiKey ?? process.env.GEMINI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      ollamaUrl: process.env.OLLAMA_URL,
    },
    clock: {
      now: () => new Date(),
      sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
    },
  };
}
