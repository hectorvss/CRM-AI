/**
 * server/agents/planEngine/tools/search.ts
 *
 * Cross-entity search tool. Lets the agent locate matching records across
 * cases, orders, customers and payments in a single call when the user gives
 * a free-text reference (order number, customer name, email, case id, etc.).
 *
 * Why it matters: without this, the LLM has to chain 4 separate `*.list`
 * calls and stitch them together, which inflates plans and latency. A single
 * `search.global` returns a compact match summary the LLM can act on.
 */

import {
  createCaseRepository,
  createCustomerRepository,
  createCommerceRepository,
} from '../../../data/index.js';
import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';

const caseRepo = createCaseRepository();
const customerRepo = createCustomerRepository();
const commerceRepo = createCommerceRepository();

interface SearchGlobalArgs {
  q: string;
  entityTypes?: string[];
  limit?: number;
}

interface SearchHit {
  entityType: 'case' | 'order' | 'customer' | 'payment';
  id: string;
  label: string;
  detail?: string | null;
  status?: string | null;
}

export const searchGlobalTool: ToolSpec<SearchGlobalArgs, unknown> = {
  name: 'search.global',
  version: '1.0.0',
  description:
    'Search across cases, orders, customers and payments using a free-text query. ' +
    'Useful when the user mentions a name, email, order number or case id and you ' +
    'need to find the canonical record before acting. Returns a compact list of ' +
    'top matches grouped by entity type.',
  category: 'search',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    q: s.string({ description: 'Free-text query — name, email, order number, case id, etc.' }),
    entityTypes: s.array(s.string(), {
      required: false,
      description: 'Optional subset of entity types to search: case, order, customer, payment. Defaults to all.',
    }),
    limit: s.number({
      required: false,
      integer: true,
      min: 1,
      max: 25,
      description: 'Max hits per entity type (default 5).',
    }),
  }),
  returns: s.any('{ totalHits, hits: SearchHit[] }'),
  async run({ args, context }) {
    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const limit = args.limit ?? 5;
    const q = args.q.trim();
    if (!q) return { ok: true, value: { totalHits: 0, hits: [] } };

    const wanted = new Set(
      (args.entityTypes && args.entityTypes.length > 0
        ? args.entityTypes
        : ['case', 'order', 'customer', 'payment']
      ).map((t) => t.toLowerCase()),
    );

    const tasks: Array<Promise<SearchHit[]>> = [];

    if (wanted.has('case')) {
      tasks.push(
        caseRepo
          .list(scope, { q })
          .then((rows: any[]) =>
            (rows || []).slice(0, limit).map((c: any): SearchHit => ({
              entityType: 'case',
              id: c.id,
              label: c.case_number || c.id,
              detail: c.customer_name || c.subject || null,
              status: c.status ?? null,
            })),
          )
          .catch(() => []),
      );
    }

    if (wanted.has('order')) {
      tasks.push(
        commerceRepo
          .listOrders(scope, { q } as any)
          .then((rows: any[]) =>
            (rows || []).slice(0, limit).map((o: any): SearchHit => ({
              entityType: 'order',
              id: o.id,
              label: o.order_number || o.id,
              detail: o.customer_name || o.customer_id || null,
              status: o.status ?? o.fulfillment_status ?? null,
            })),
          )
          .catch(() => []),
      );
    }

    if (wanted.has('customer')) {
      tasks.push(
        customerRepo
          .list(scope, { q } as any)
          .then((rows: any[]) =>
            (rows || []).slice(0, limit).map((cu: any): SearchHit => ({
              entityType: 'customer',
              id: cu.id,
              label: cu.full_name || cu.email || cu.id,
              detail: cu.email || cu.phone || null,
              status: cu.segment ?? null,
            })),
          )
          .catch(() => []),
      );
    }

    if (wanted.has('payment')) {
      tasks.push(
        commerceRepo
          .listPayments(scope, { q } as any)
          .then((rows: any[]) =>
            (rows || []).slice(0, limit).map((p: any): SearchHit => ({
              entityType: 'payment',
              id: p.id,
              label: p.payment_number || p.external_id || p.id,
              detail: p.amount != null ? `${p.amount} ${p.currency || ''}`.trim() : null,
              status: p.status ?? null,
            })),
          )
          .catch(() => []),
      );
    }

    const groups = await Promise.all(tasks);
    const hits = groups.flat();
    return { ok: true, value: { totalHits: hits.length, hits } };
  },
};
