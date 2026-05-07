/**
 * server/runtime/adapters/index.ts
 *
 * Combined registry of all node adapters. Phase 1 leaves it empty;
 * Phase 2+ adds one category map per import.
 */

import type { NodeAdapter } from '../workflowExecutor.js';
import { flowAdapters } from './flow.js';
import { dataAdapters } from './data.js';
import { coreAdapters } from './core.js';
import { knowledgeAdapters } from './knowledge.js';

export const ALL_ADAPTERS: Record<string, NodeAdapter> = {
  ...flowAdapters,
  ...dataAdapters,
  ...coreAdapters,
  ...knowledgeAdapters,
};
