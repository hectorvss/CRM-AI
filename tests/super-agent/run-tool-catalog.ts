import assert from 'node:assert/strict';
import { registerAllTools } from '../../server/agents/planEngine/tools/index.js';
import { toolRegistry } from '../../server/agents/planEngine/registry.js';

toolRegistry._resetForTests();
registerAllTools();

const expectedTools = [
  'case.get',
  'case.update_status',
  'order.get',
  'order.cancel',
  'payment.get',
  'payment.refund',
  'return.get',
  'return.approve',
  'approval.get',
  'approval.decide',
  'customer.get',
  'knowledge.search',
  'knowledge.list',
  'knowledge.get',
  'knowledge.create',
  'knowledge.update',
  'knowledge.publish',
  'knowledge.list_domains',
  'knowledge.list_policies',
  'settings.workspace.get',
  'settings.workspace.update',
  'settings.feature_flags.list',
  'settings.feature_flags.update',
  'integration.connectors.list',
  'integration.connectors.get',
  'integration.capabilities.list',
  'integration.webhooks.list',
  'integration.webhooks.get',
  'integration.webhooks.create',
  'integration.webhooks.update',
  'integration.canonical.get',
  'integration.canonical.create',
  'integration.canonical.update',
  'workflow.list',
  'workflow.get',
  'workflow.publish',
  'report.overview',
  'report.intents',
  'report.agents',
  'report.approvals',
  'report.costs',
  'report.sla',
  'agent.run',
];

for (const name of expectedTools) {
  assert.ok(toolRegistry.get(name), `Missing PlanEngine tool: ${name}`);
}

const readCatalog = toolRegistry.listForCaller((permission) => ['cases.read', 'workflows.read', 'reports.read'].includes(permission));
assert.ok(readCatalog.some((tool) => tool.name === 'workflow.list'), 'workflow.list should be visible with workflows.read');
assert.ok(readCatalog.some((tool) => tool.name === 'report.overview'), 'report.overview should be visible with reports.read');
assert.ok(!readCatalog.some((tool) => tool.name === 'workflow.publish'), 'workflow.publish should be hidden without workflows.write');

const writeCatalog = toolRegistry.listForCaller((permission) => ['workflows.write', 'workflows.read', 'reports.read'].includes(permission));
assert.ok(writeCatalog.some((tool) => tool.name === 'workflow.publish'), 'workflow.publish should be visible with workflows.write');

console.log(`Super Agent tool catalog: ${expectedTools.length}/${expectedTools.length} registered`);
