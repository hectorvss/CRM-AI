/**
 * CRM AI — DB Utils
 * Shared utilities for standardizing DB interaction.
 */

/**
 * Standard mapping for SQLite stringified JSON columns to JS objects.
 */
export const JSON_COLUMNS = [
  'order_ids', 'payment_ids', 'return_ids',
  'ai_evidence_refs', 'tags', 'attachments',
  'settings', 'permissions', 'action_payload',
  'evidence_package', 'context', 'trigger_payload',
  'normalized_payload', 'system_states', 'badges',
  'permission_profile', 'reasoning_profile', 'safety_profile',
];

/**
 * parseRow: Maps SQLite result rows to typed objects with parsed JSON fields.
 */
export function parseRow<T = any>(row: any): T {
  if (!row) return row;
  const result = { ...row };
  
  JSON_COLUMNS.forEach(col => {
    if (result[col] && typeof result[col] === 'string') {
      try {
        result[col] = JSON.parse(result[col]);
      } catch {
        // Fallback for empty or malformed strings
        result[col] = col.endsWith('_ids')
          || col === 'tags'
          || col === 'attachments'
          || col === 'ai_evidence_refs'
          || col === 'linked_workflow_ids'
          || col === 'linked_approval_policy_ids'
          || col === 'nodes'
          || col === 'edges'
          || col === 'conditions'
          ? []
          : {};
      }
    }
  });

  return result as T;
}

/**
 * Standard Audit Logging Helper
 */
export function logAudit(db: any, params: {
  tenantId: string;
  workspaceId: string;
  actorId: string;
  actorType?: 'human' | 'system';
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: any;
  newValue?: any;
  metadata?: any;
}) {
  const { tenantId, workspaceId, actorId, actorType = 'human', action, entityType, entityId, oldValue, newValue, metadata } = params;
  
  const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  
  db.prepare(`
    INSERT INTO audit_events 
    (id, tenant_id, workspace_id, actor_id, actor_type, action, entity_type, entity_id, old_value, new_value, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, tenantId, workspaceId, actorId, actorType, action, entityType, entityId,
    oldValue ? JSON.stringify(oldValue) : null,
    newValue ? JSON.stringify(newValue) : null,
    metadata ? JSON.stringify(metadata) : '{}'
  );
}
