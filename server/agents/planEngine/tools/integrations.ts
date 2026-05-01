/**
 * server/agents/planEngine/tools/integrations.ts
 *
 * Integration and webhook tools built on the existing repository layer.
 */

import { createIntegrationRepository } from '../../../data/index.js';
import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';

const integrationRepo = createIntegrationRepository();

function scope(context: { tenantId: string }) {
  return { tenantId: context.tenantId };
}

export const integrationListConnectorsTool: ToolSpec<Record<string, never>, unknown> = {
  name: 'integration.connectors.list',
  version: '1.0.0',
  description: 'List available connectors for the tenant.',
  category: 'integration',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'settings.read',
  args: s.object({}, { required: false }),
  returns: s.any('Array of connectors'),
  async run({ context }) {
    return { ok: true, value: await integrationRepo.listConnectors(scope(context)) };
  },
};

export const integrationGetConnectorTool: ToolSpec<{ connectorId: string }, unknown> = {
  name: 'integration.connectors.get',
  version: '1.0.0',
  description: 'Fetch a connector by ID.',
  category: 'integration',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'settings.read',
  args: s.object({ connectorId: s.string({ description: 'Connector UUID' }) }),
  returns: s.any('Connector object'),
  async run({ args, context }) {
    const connector = await integrationRepo.getConnector(scope(context), args.connectorId);
    if (!connector) return { ok: false, error: 'Connector not found', errorCode: 'NOT_FOUND' };
    return { ok: true, value: connector };
  },
};

export const integrationListCapabilitiesTool: ToolSpec<{ connectorId: string }, unknown> = {
  name: 'integration.capabilities.list',
  version: '1.0.0',
  description: 'List connector capabilities.',
  category: 'integration',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'settings.read',
  args: s.object({ connectorId: s.string({ description: 'Connector UUID' }) }),
  returns: s.any('Capability list'),
  async run({ args, context }) {
    return { ok: true, value: await integrationRepo.listCapabilities(scope(context), args.connectorId) };
  },
};

export const integrationListWebhooksTool: ToolSpec<{ connectorId: string; limit?: number }, unknown> = {
  name: 'integration.webhooks.list',
  version: '1.0.0',
  description: 'List recent webhook events for a connector.',
  category: 'integration',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'settings.read',
  args: s.object({
    connectorId: s.string({ description: 'Connector UUID' }),
    limit: s.number({ required: false, integer: true, min: 1, max: 100, description: 'Max results (default 50)' }),
  }),
  returns: s.any('Webhook events'),
  async run({ args, context }) {
    return { ok: true, value: await integrationRepo.listRecentWebhooks(scope(context), args.connectorId, args.limit ?? 50) };
  },
};

export const integrationGetWebhookTool: ToolSpec<{ webhookEventId: string }, unknown> = {
  name: 'integration.webhooks.get',
  version: '1.0.0',
  description: 'Get a webhook event by ID.',
  category: 'integration',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'settings.read',
  args: s.object({ webhookEventId: s.string({ description: 'Webhook event UUID' }) }),
  returns: s.any('Webhook event'),
  async run({ args, context }) {
    const event = await integrationRepo.getWebhookEvent(scope(context), args.webhookEventId);
    if (!event) return { ok: false, error: 'Webhook event not found', errorCode: 'NOT_FOUND' };
    return { ok: true, value: event };
  },
};

export const integrationCreateWebhookTool: ToolSpec<{
  connectorId?: string;
  sourceSystem: string;
  eventType: string;
  rawPayload: unknown;
  dedupeKey?: string;
  status?: string;
}, unknown> = {
  name: 'integration.webhooks.create',
  version: '1.0.0',
  description: 'Create a webhook event record.',
  category: 'integration',
  sideEffect: 'write',
  risk: 'medium',
  idempotent: false,
  requiredPermission: 'settings.write',
  args: s.object({
    connectorId: s.string({ required: false, description: 'Connector UUID' }),
    sourceSystem: s.string({ min: 1, max: 100, description: 'Source system name' }),
    eventType: s.string({ min: 1, max: 100, description: 'Event type' }),
    rawPayload: s.any('Raw webhook payload'),
    dedupeKey: s.string({ required: false, max: 200, description: 'Deduplication key' }),
    status: s.string({ required: false, description: 'received, processed, failed' }),
  }),
  returns: s.any('Webhook event'),
  async run({ args, context }) {
    if (context.dryRun) return { ok: true, value: { dryRun: true, ...args } };
    const event = await integrationRepo.createWebhookEvent(scope(context), {
      connector_id: args.connectorId ?? null,
      source_system: args.sourceSystem,
      event_type: args.eventType,
      raw_payload: args.rawPayload,
      dedupe_key: args.dedupeKey,
      status: args.status ?? 'received',
    });
    return { ok: true, value: event };
  },
};

export const integrationUpdateWebhookTool: ToolSpec<{ webhookEventId: string; status: string; updates?: Record<string, unknown> }, unknown> = {
  name: 'integration.webhooks.update',
  version: '1.0.0',
  description: 'Update webhook event status or metadata.',
  category: 'integration',
  sideEffect: 'write',
  risk: 'medium',
  idempotent: false,
  requiredPermission: 'settings.write',
  args: s.object({
    webhookEventId: s.string({ description: 'Webhook event UUID' }),
    status: s.string({ min: 1, max: 50, description: 'New status' }),
    updates: s.object({}, { required: false, description: 'Additional updates' }),
  }),
  returns: s.any('Webhook event'),
  async run({ args, context }) {
    if (context.dryRun) return { ok: true, value: { dryRun: true, webhookEventId: args.webhookEventId, status: args.status } };
    await integrationRepo.updateWebhookEventStatus(scope(context), args.webhookEventId, args.status, args.updates ?? {});
    const event = await integrationRepo.getWebhookEvent(scope(context), args.webhookEventId);
    return { ok: true, value: event };
  },
};

export const integrationGetCanonicalEventTool: ToolSpec<{ canonicalEventId: string }, unknown> = {
  name: 'integration.canonical.get',
  version: '1.0.0',
  description: 'Get a canonical event by ID.',
  category: 'integration',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'settings.read',
  args: s.object({ canonicalEventId: s.string({ description: 'Canonical event UUID' }) }),
  returns: s.any('Canonical event'),
  async run({ args }) {
    const event = await integrationRepo.getCanonicalEvent(args.canonicalEventId);
    if (!event) return { ok: false, error: 'Canonical event not found', errorCode: 'NOT_FOUND' };
    return { ok: true, value: event };
  },
};

export const integrationCreateCanonicalEventTool: ToolSpec<{
  sourceSystem: string;
  sourceEntityType: string;
  sourceEntityId: string;
  eventType: string;
  canonicalEntityType: string;
  canonicalEntityId: string;
  normalizedPayload: unknown;
  dedupeKey?: string;
  caseId?: string;
  workspaceId?: string;
}, unknown> = {
  name: 'integration.canonical.create',
  version: '1.0.0',
  description: 'Create a canonical event record.',
  category: 'integration',
  sideEffect: 'write',
  risk: 'medium',
  idempotent: false,
  requiredPermission: 'settings.write',
  args: s.object({
    sourceSystem: s.string({ min: 1, max: 100 }),
    sourceEntityType: s.string({ min: 1, max: 100 }),
    sourceEntityId: s.string({ min: 1, max: 200 }),
    eventType: s.string({ min: 1, max: 100 }),
    canonicalEntityType: s.string({ min: 1, max: 100 }),
    canonicalEntityId: s.string({ min: 1, max: 200 }),
    normalizedPayload: s.any('Normalized payload'),
    dedupeKey: s.string({ required: false, max: 200 }),
    caseId: s.string({ required: false, max: 200 }),
    workspaceId: s.string({ required: false, max: 200 }),
  }),
  returns: s.any('Canonical event'),
  async run({ args, context }) {
    if (context.dryRun) return { ok: true, value: { dryRun: true, ...args } };
    const event = await integrationRepo.createCanonicalEvent(scope(context), {
      source_system: args.sourceSystem,
      source_entity_type: args.sourceEntityType,
      source_entity_id: args.sourceEntityId,
      event_type: args.eventType,
      canonical_entity_type: args.canonicalEntityType,
      canonical_entity_id: args.canonicalEntityId,
      normalized_payload: args.normalizedPayload,
      dedupe_key: args.dedupeKey,
      case_id: args.caseId ?? null,
      workspace_id: args.workspaceId ?? context.workspaceId ?? null,
    });
    return { ok: true, value: event };
  },
};

export const integrationUpdateCanonicalEventTool: ToolSpec<{ canonicalEventId: string; updates: Record<string, unknown> }, unknown> = {
  name: 'integration.canonical.update',
  version: '1.0.0',
  description: 'Update a canonical event record.',
  category: 'integration',
  sideEffect: 'write',
  risk: 'medium',
  idempotent: false,
  requiredPermission: 'settings.write',
  args: s.object({
    canonicalEventId: s.string({ min: 1, max: 200 }),
    updates: s.object({}, { description: 'Update payload' }),
  }),
  returns: s.any('Canonical event'),
  async run({ args, context }) {
    if (context.dryRun) return { ok: true, value: { dryRun: true, canonicalEventId: args.canonicalEventId } };
    await integrationRepo.updateCanonicalEvent(args.canonicalEventId, args.updates);
    const event = await integrationRepo.getCanonicalEvent(args.canonicalEventId);
    return { ok: true, value: event };
  },
};
