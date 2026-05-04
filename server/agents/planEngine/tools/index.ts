/**
 * server/agents/planEngine/tools/index.ts
 *
 * Tool manifest — registers ALL ToolSpecs into the global toolRegistry.
 * Import this file exactly once via planEngine/index.ts at startup.
 */

import { toolRegistry } from '../registry.js';

// ── Orders
import { orderGetTool, orderListTool, orderCancelTool } from './orders.js';
// ── Analysis
import { rootCauseAnalyzeTool, interoperabilityCheckTool } from './analysis.js';
// ── Payments
import { paymentGetTool, paymentRefundTool } from './payments.js';
// ── Cases
import {
  caseGetTool,
  caseUpdateStatusTool,
  caseAddNoteTool,
  caseListTool,
  caseUpdatePriorityTool,
  caseUpdateAssignmentTool,
} from './cases.js';
// ── Returns
import { returnGetTool, returnListTool, returnApproveTool, returnRejectTool, returnUpdateStatusTool } from './returns.js';
// ── Approvals
import { approvalGetTool, approvalListTool, approvalDecideTool } from './approvals.js';
// ── Customers
import { customerGetTool, customerListTool, customerUpdateTool } from './customers.js';
// ── Messaging
import { messageSendTool } from './messaging.js';
// ── Knowledge
import { knowledgeSearchTool } from './knowledge.js';
import {
  knowledgeCreateTool,
  knowledgeGetTool,
  knowledgeListDomainsTool,
  knowledgeListPoliciesTool,
  knowledgeListTool,
  knowledgePublishTool,
  knowledgeUpdateTool,
} from './knowledgeWrite.js';
import {
  settingsGetWorkspaceTool,
  settingsUpdateWorkspaceTool,
  settingsListFeatureFlagsTool,
  settingsUpdateFeatureFlagTool,
  systemHealthTool,
} from './settings.js';
import {
  integrationListConnectorsTool,
  integrationGetConnectorTool,
  integrationListCapabilitiesTool,
  integrationListWebhooksTool,
  integrationGetWebhookTool,
  integrationCreateWebhookTool,
  integrationUpdateWebhookTool,
  integrationGetCanonicalEventTool,
  integrationCreateCanonicalEventTool,
  integrationUpdateCanonicalEventTool,
} from './integrations.js';
import { workflowGetTool, workflowListTool, workflowPublishTool, workflowTriggerTool, workflowFireEventTool, agentListTool } from './workflows.js';
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
import { reconListIssuesTool, reconResolveIssueTool } from './reconciliation.js';
// ── Cross-entity search
import { searchGlobalTool } from './search.js';
// ── Bulk operations
import {
  caseBulkUpdateStatusTool,
  caseBulkUpdatePriorityTool,
  caseBulkAssignTool,
  caseBulkAddNoteTool,
  orderBulkCancelTool,
} from './bulk.js';
// ── Playbooks
import { playbookListTool, playbookGetTool, playbookExecuteTool } from './playbooks.js';
// ── Scheduled actions
import {
  scheduledActionCreateTool,
  scheduledActionListTool,
  scheduledActionCancelTool,
} from './scheduledActions.js';
// ── Feedback / decision capture
import { feedbackRecordDecisionTool, feedbackListTool } from './feedback.js';
// ── Per-integration action tools (Linear, Jira, GitHub, Asana, Confluence, GDrive, Front, Aircall, GCal, Zoom, Pipedrive, Mailchimp)
import { ALL_INTEGRATION_ACTION_TOOLS } from './integrationActions.js';

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
  toolRegistry.register(caseListTool);
  toolRegistry.register(caseUpdateStatusTool);
  toolRegistry.register(caseUpdatePriorityTool);
  toolRegistry.register(caseUpdateAssignmentTool);
  toolRegistry.register(caseAddNoteTool);

  // Returns
  toolRegistry.register(returnGetTool);
  toolRegistry.register(returnListTool);
  toolRegistry.register(returnApproveTool);
  toolRegistry.register(returnRejectTool);
  toolRegistry.register(returnUpdateStatusTool);

  // Approvals
  toolRegistry.register(approvalGetTool);
  toolRegistry.register(approvalListTool);
  toolRegistry.register(approvalDecideTool);

  // Customers
  toolRegistry.register(customerGetTool);
  toolRegistry.register(customerListTool);
  toolRegistry.register(customerUpdateTool);

  // Messaging
  toolRegistry.register(messageSendTool);

  // Knowledge
  toolRegistry.register(knowledgeSearchTool);
  toolRegistry.register(knowledgeListTool);
  toolRegistry.register(knowledgeGetTool);
  toolRegistry.register(knowledgeCreateTool);
  toolRegistry.register(knowledgeUpdateTool);
  toolRegistry.register(knowledgePublishTool);
  toolRegistry.register(knowledgeListDomainsTool);
  toolRegistry.register(knowledgeListPoliciesTool);
  toolRegistry.register(settingsGetWorkspaceTool);
  toolRegistry.register(settingsUpdateWorkspaceTool);
  toolRegistry.register(settingsListFeatureFlagsTool);
  toolRegistry.register(settingsUpdateFeatureFlagTool);
  toolRegistry.register(systemHealthTool);
  toolRegistry.register(integrationListConnectorsTool);
  toolRegistry.register(integrationGetConnectorTool);
  toolRegistry.register(integrationListCapabilitiesTool);
  toolRegistry.register(integrationListWebhooksTool);
  toolRegistry.register(integrationGetWebhookTool);
  toolRegistry.register(integrationCreateWebhookTool);
  toolRegistry.register(integrationUpdateWebhookTool);
  toolRegistry.register(integrationGetCanonicalEventTool);
  toolRegistry.register(integrationCreateCanonicalEventTool);
  toolRegistry.register(integrationUpdateCanonicalEventTool);

  // Workflows
  toolRegistry.register(workflowListTool);
  toolRegistry.register(workflowGetTool);
  toolRegistry.register(workflowPublishTool);
  toolRegistry.register(workflowTriggerTool);
  toolRegistry.register(workflowFireEventTool);

  // Agents
  toolRegistry.register(agentListTool);

  // Reports
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

  // Reconciliation
  toolRegistry.register(reconListIssuesTool);
  toolRegistry.register(reconResolveIssueTool);

  // Cross-entity search
  toolRegistry.register(searchGlobalTool);
  toolRegistry.register(rootCauseAnalyzeTool);
  toolRegistry.register(interoperabilityCheckTool);

  // Bulk operations
  toolRegistry.register(caseBulkUpdateStatusTool);
  toolRegistry.register(caseBulkUpdatePriorityTool);
  toolRegistry.register(caseBulkAssignTool);
  toolRegistry.register(caseBulkAddNoteTool);
  toolRegistry.register(orderBulkCancelTool);

  // Playbooks
  toolRegistry.register(playbookListTool);
  toolRegistry.register(playbookGetTool);
  toolRegistry.register(playbookExecuteTool);

  // Scheduled actions
  toolRegistry.register(scheduledActionCreateTool);
  toolRegistry.register(scheduledActionListTool);
  toolRegistry.register(scheduledActionCancelTool);

  // Feedback / decision capture
  toolRegistry.register(feedbackRecordDecisionTool);
  toolRegistry.register(feedbackListTool);

  // Per-integration action tools (one ToolSpec per high-impact action across
  // Linear/Jira/GitHub/Asana/Confluence/GDrive/Front/Aircall/GCalendar/Zoom/
  // Pipedrive/Mailchimp). Each resolves the per-tenant adapter at runtime
  // and short-circuits to INTEGRATION_NOT_CONNECTED if the connector is
  // missing — the planner can branch on that.
  for (const tool of ALL_INTEGRATION_ACTION_TOOLS) {
    toolRegistry.register(tool);
  }
}
