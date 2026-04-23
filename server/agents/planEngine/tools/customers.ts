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
