/**
 * server/agents/planEngine/tools/customers.ts
 */

import { createCustomerRepository } from '../../../data/index.js';
import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';

const customerRepo = createCustomerRepository();

// ── customer.get ──────────────────────────────────────────────────────────────

export const customerGetTool: ToolSpec<{ customerId: string }, unknown> = {
  name: 'customer.get',
  version: '1.0.0',
  description: 'Retrieve a customer profile by ID including orders, open cases, payments, and risk level.',
  category: 'customer',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({ customerId: s.string({ description: 'UUID of the customer' }) }),
  returns: s.any('Customer state including linked entities'),
  async run({ args, context }) {
    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const detail = await customerRepo.getState(scope, args.customerId);
    if (!detail) return { ok: false, error: 'Customer not found', errorCode: 'NOT_FOUND' };
    return { ok: true, value: detail };
  },
};

// ── customer.list ─────────────────────────────────────────────────────────────

export const customerListTool: ToolSpec<{ q?: string; segment?: string; limit?: number }, unknown> = {
  name: 'customer.list',
  version: '1.0.0',
  description: 'Search and list customers. Use `q` for name/email search, `segment` to filter by segment.',
  category: 'customer',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    q: s.string({ required: false, description: 'Search query (name, email, external ID)' }),
    segment: s.string({ required: false, description: 'Segment filter (e.g. enterprise, smb, consumer)' }),
    limit: s.number({ required: false, integer: true, min: 1, max: 50, description: 'Max results (default 20)' }),
  }),
  returns: s.any('Array of customer objects'),
  async run({ args, context }) {
    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const filters: { q?: string; segment?: string } = {};
    if (args.q) filters.q = args.q;
    if (args.segment) filters.segment = args.segment;
    const all = await customerRepo.list(scope, filters);
    return { ok: true, value: (all as any[]).slice(0, args.limit ?? 20) };
  },
};

// ── customer.update ───────────────────────────────────────────────────────────

const CUSTOMER_SEGMENT_VALUES = ['consumer', 'smb', 'enterprise', 'vip', 'at_risk'] as const;
const CUSTOMER_RISK_VALUES    = ['low', 'medium', 'high', 'critical'] as const;
const CUSTOMER_CHANNEL_VALUES = ['email', 'whatsapp', 'sms', 'web_chat'] as const;

interface CustomerUpdateArgs {
  customerId: string;
  segment?: typeof CUSTOMER_SEGMENT_VALUES[number];
  riskLevel?: typeof CUSTOMER_RISK_VALUES[number];
  preferredChannel?: typeof CUSTOMER_CHANNEL_VALUES[number];
  fraudFlag?: boolean;
}

export const customerUpdateTool: ToolSpec<CustomerUpdateArgs, unknown> = {
  name: 'customer.update',
  version: '1.0.0',
  description:
    'Update a customer profile attribute: segment, risk level, preferred contact channel, or fraud flag. ' +
    'At least one field must be provided. Use riskLevel="high" for elevated-risk customers. ' +
    'Setting fraudFlag=true will mark the customer for fraud review.',
  category: 'customer',
  sideEffect: 'write',
  risk: 'low',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    customerId: s.string({ description: 'UUID of the customer to update' }),
    segment: s.enum(CUSTOMER_SEGMENT_VALUES, { required: false, description: 'New customer segment' }),
    riskLevel: s.enum(CUSTOMER_RISK_VALUES, { required: false, description: 'New risk level' }),
    preferredChannel: s.enum(CUSTOMER_CHANNEL_VALUES, { required: false, description: 'Preferred communication channel' }),
    fraudFlag: s.boolean({ required: false, description: 'Set to true to flag customer for fraud review, false to clear the flag' }),
  }),
  returns: s.any('{ customerId, updated: string[] }'),
  async run({ args, context }) {
    const { customerId, segment, riskLevel, preferredChannel, fraudFlag } = args;
    const updates: Record<string, any> = {};
    if (segment !== undefined)          updates.segment            = segment;
    if (riskLevel !== undefined)        updates.risk_level         = riskLevel;
    if (preferredChannel !== undefined) updates.preferred_channel  = preferredChannel;
    if (fraudFlag !== undefined)        updates.fraud_flag         = fraudFlag;

    if (Object.keys(updates).length === 0) {
      return { ok: false, error: 'At least one field (segment, riskLevel, preferredChannel, fraudFlag) must be provided', errorCode: 'INVALID_ARGS' };
    }

    if (context.dryRun) {
      return { ok: true, value: { customerId, updated: Object.keys(updates), dryRun: true } };
    }

    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const existing = await customerRepo.getState(scope, customerId);
    if (!existing) return { ok: false, error: 'Customer not found', errorCode: 'NOT_FOUND' };

    await customerRepo.update(scope, customerId, {
      ...updates,
      updated_at: new Date().toISOString(),
    });

    await context.audit({
      action: 'PLAN_ENGINE_CUSTOMER_UPDATE',
      entityType: 'customer',
      entityId: customerId,
      oldValue: Object.fromEntries(Object.keys(updates).map((k) => [k, (existing as any)?.customer?.[k] ?? null])),
      newValue: updates,
      metadata: { source: 'plan-engine', planId: context.planId },
    });

    return { ok: true, value: { customerId, updated: Object.keys(updates) } };
  },
};
