/**
 * server/runtime/adapters/index.ts
 *
 * Combined registry of all node adapters. Phase 1 leaves it empty;
 * Phase 2+ adds one category map per import.
 */

import type { NodeAdapter } from '../workflowExecutor.js';

export const ALL_ADAPTERS: Record<string, NodeAdapter> = {
  // Phase 2 will spread `...flowAdapters` here, etc.
};
