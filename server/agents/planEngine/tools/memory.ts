/**
 * server/agents/planEngine/tools/memory.ts
 *
 * Core-memory tools for the Super Agent. Port of PostHog's memory handling
 * (ee/hogai manage_memories + the /remember slash command): a per-tenant text
 * blob the agent reads at the start of every conversation and appends durable
 * facts to over time ("this customer is on the Enterprise plan", "refunds over
 * 500€ always need finance sign-off").
 *
 * memory.get is read-only, so the future support agent (support_readonly
 * surface) can consult it; memory.append is a low-risk write, operator-only.
 */

import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';
import { getCoreMemory, appendCoreMemory } from '../../../data/agentCoreMemory.js';

type MemoryAppendArgs = { fact: string };

export const memoryAppendTool: ToolSpec<MemoryAppendArgs, unknown> = {
  name: 'memory.append',
  version: '1.0.0',
  description:
    'Save a durable fact to the team\'s long-term memory so it is available in every future conversation. ' +
    'Use for stable preferences, policies, or context worth remembering — not for one-off details.',
  category: 'system',
  sideEffect: 'write',
  risk: 'low',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    fact: s.string({ min: 1, max: 2000, description: 'The fact to remember, phrased as a standalone statement.' }),
  }),
  returns: s.any('Confirmation with the saved fact'),
  async run({ args, context }) {
    await appendCoreMemory(context.tenantId, args.fact.trim());
    return { ok: true, value: { saved: true, fact: args.fact.trim() } };
  },
};

export const memoryGetTool: ToolSpec<Record<string, never>, unknown> = {
  name: 'memory.get',
  version: '1.0.0',
  description: 'Read the team\'s long-term memory (durable facts saved across conversations).',
  category: 'system',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({}),
  returns: s.any('The current core-memory text, or null if empty'),
  async run({ context }) {
    const memory = await getCoreMemory(context.tenantId);
    return { ok: true, value: { memory: memory ?? null } };
  },
};
