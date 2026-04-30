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
import {
  workflowCreateDraftTool,
  workflowGetTool,
  workflowListTool,
  workflowPublishTool,
  workflowTriggerTool,
  workflowFireEventTool,
  workflowUpdateDraftTool,
  workflowValidateTool,
  agentListTool,
} from './workflows.js';
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
import {
  caseBulkAddNoteTool,
  caseBulkAssignTool,
  caseBulkUpdatePriorityTool,
  caseBulkUpdateStatusTool,
  orderBulkCancelTool,
} from './bulk.js';
import { playbookExecuteTool, playbookGetTool, playbookListTool } from './playbooks.js';
import { searchGlobalTool } from './search.js';
import { rootCauseAnalyzeTool } from './analysis.js';
import { feedbackListTool, feedbackRecordDecisionTool } from './feedback.js';
import { scheduledActionCancelTool, scheduledActionCreateTool, scheduledActionListTool } from './scheduledActions.js';

export function registerAllTools(): void {
  // Orders
  toolRegistry.register(orderGetTool);
  toolRegistry.register(orderListTool);
  toolRegistry.register(orderCancelTool);
  toolRegistry.register(orderBulkCancelTool);

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
  toolRegistry.register(caseBulkUpdateStatusTool);
  toolRegistry.register(caseBulkUpdatePriorityTool);
  toolRegistry.register(caseBulkAssignTool);
  toolRegistry.register(caseBulkAddNoteTool);

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
  toolRegistry.register(workflowCreateDraftTool);
  toolRegistry.register(workflowUpdateDraftTool);
  toolRegistry.register(workflowValidateTool);
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

  // Analysis / explainability helpers
  toolRegistry.register(rootCauseAnalyzeTool);

  // Playbooks
  toolRegistry.register(playbookListTool);
  toolRegistry.register(playbookGetTool);
  toolRegistry.register(playbookExecuteTool);

  // Feedback loop
  toolRegistry.register(feedbackRecordDecisionTool);
  toolRegistry.register(feedbackListTool);

  // Scheduled actions
  toolRegistry.register(scheduledActionCreateTool);
  toolRegistry.register(scheduledActionListTool);
  toolRegistry.register(scheduledActionCancelTool);
}
