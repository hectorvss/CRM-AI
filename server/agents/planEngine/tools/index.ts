/**
 * server/agents/planEngine/tools/index.ts
 *
 * Tool manifest — registers ALL ToolSpecs into the global toolRegistry.
 * Import this file exactly once via planEngine/index.ts at startup.
 */

import { toolRegistry } from '../registry.js';

// ── Orders
import { orderGetTool, orderListTool, orderCancelTool } from './orders.js';
// ── Payments
import { paymentGetTool, paymentRefundTool } from './payments.js';
// ── Cases
import { caseGetTool, caseUpdateStatusTool, caseAddNoteTool } from './cases.js';
// ── Returns
import { returnGetTool, returnListTool, returnApproveTool, returnRejectTool } from './returns.js';
// ── Approvals
import { approvalGetTool, approvalListTool, approvalDecideTool } from './approvals.js';
// ── Customers
import { customerGetTool, customerListTool } from './customers.js';
// ── Knowledge
import { knowledgeSearchTool } from './knowledge.js';
import { workflowGetTool, workflowListTool, workflowPublishTool } from './workflows.js';
import {
  reportAgentsTool,
  reportApprovalsTool,
  reportCostsTool,
  reportIntentsTool,
  reportOverviewTool,
  reportSlaTool,
} from './reports.js';
// ── Agent Delegates (bridge to catalog agent implementations)
import {
  agentDraftReplyTool,
  agentTriageTool,
  agentFraudCheckTool,
  agentEscalateTool,
} from './agentDelegates.js';
import { agentRunTool } from './agentRun.js';

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

  // Returns
  toolRegistry.register(returnGetTool);
  toolRegistry.register(returnListTool);
  toolRegistry.register(returnApproveTool);
  toolRegistry.register(returnRejectTool);

  // Approvals
  toolRegistry.register(approvalGetTool);
  toolRegistry.register(approvalListTool);
  toolRegistry.register(approvalDecideTool);

  // Customers
  toolRegistry.register(customerGetTool);
  toolRegistry.register(customerListTool);

  // Knowledge
  toolRegistry.register(knowledgeSearchTool);
  toolRegistry.register(workflowListTool);
  toolRegistry.register(workflowGetTool);
  toolRegistry.register(workflowPublishTool);
  toolRegistry.register(reportOverviewTool);
  toolRegistry.register(reportIntentsTool);
  toolRegistry.register(reportAgentsTool);
  toolRegistry.register(reportApprovalsTool);
  toolRegistry.register(reportCostsTool);
  toolRegistry.register(reportSlaTool);

  // Agent Delegates
  toolRegistry.register(agentDraftReplyTool);
  toolRegistry.register(agentTriageTool);
  toolRegistry.register(agentFraudCheckTool);
  toolRegistry.register(agentEscalateTool);
  toolRegistry.register(agentRunTool);
}
