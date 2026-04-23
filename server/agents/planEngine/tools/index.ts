/**
 * server/agents/planEngine/tools/index.ts
 *
 * Tool manifest — the single import that registers ALL ToolSpecs into the
 * global toolRegistry. Import this file exactly once at server startup
 * (from server/agents/planEngine/index.ts).
 *
 * To add a new tool:
 *  1. Create (or extend) a file in this directory.
 *  2. Export a ToolSpec<TArgs, TReturns>.
 *  3. Add it to the register() calls below.
 *
 * Naming convention: <domain>.<verb> — lower_snake_case, dot-separated.
 */

import { toolRegistry } from '../registry.js';

// ── Orders
import { orderGetTool, orderListTool, orderCancelTool } from './orders.js';
// ── Payments
import { paymentGetTool, paymentRefundTool } from './payments.js';
// ── Cases
import { caseGetTool, caseUpdateStatusTool, caseAddNoteTool } from './cases.js';

export function registerAllTools(): void {
  // Orders
  toolRegistry.register(orderGetTool);
  toolRegistry.register(orderListTool);
  toolRegistry.register(orderCancelTool);

  // Payments
  toolRegistry.register(paymentGetTool);
  toolRegistry.register(paymentRefundTool);

  // Cases
  toolRegistry.register(caseGetTool);
  toolRegistry.register(caseUpdateStatusTool);
  toolRegistry.register(caseAddNoteTool);
}
