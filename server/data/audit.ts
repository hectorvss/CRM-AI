import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';
import crypto from 'crypto';
import { redactForWorkspacePolicy } from '../services/privacyRedaction.js';

export interface AuditScope {
  tenantId: string;
  workspaceId: string;
}

export interface AuditEvent {
  actorId: string;
  actorType?: 'human' | 'system';
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: any;
  newValue?: any;
  metadata?: any;
}

export interface AuditRepository {
  logEvent(scope: AuditScope, event: AuditEvent): Promise<void>;
  log(scopeOrEvent: AuditScope | (Partial<AuditEvent> & AuditScope), event?: Partial<AuditEvent>): Promise<void>;
  listByEntity(scope: AuditScope, entityType: string, entityId: string): Promise<any[]>;
  listByWorkspace(scope: AuditScope, limit?: number): Promise<any[]>;
}

class SQLiteAuditRepository implements AuditRepository {
  async log(scopeOrEvent: AuditScope | (Partial<AuditEvent> & AuditScope), event?: Partial<AuditEvent>) {
    const scope = event
      ? scopeOrEvent as AuditScope
      : { tenantId: (scopeOrEvent as any).tenantId, workspaceId: (scopeOrEvent as any).workspaceId };
    const payload = event ?? {
      actorId: (scopeOrEvent as any).actorId ?? 'system',
      actorType: (scopeOrEvent as any).actorType,
      action: (scopeOrEvent as any).action,
      entityType: (scopeOrEvent as any).entityType,
      entityId: (scopeOrEvent as any).entityId,
      oldValue: (scopeOrEvent as any).oldValue,
      newValue: (scopeOrEvent as any).newValue,
      metadata: (scopeOrEvent as any).metadata,
    };
    await this.logEvent(scope, { actorId: 'system', ...payload } as AuditEvent);
  }

  async logEvent(scope: AuditScope, event: AuditEvent) {
    const db = getDb();
    const id = crypto.randomUUID();
    const redactedEvent = await redactForWorkspacePolicy(scope, event);
    db.prepare(`
      INSERT INTO audit_events 
      (id, tenant_id, workspace_id, actor_id, actor_type, action, entity_type, entity_id, old_value, new_value, metadata, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      id, scope.tenantId, scope.workspaceId, 
      redactedEvent.actorId, redactedEvent.actorType || 'human', 
      redactedEvent.action, redactedEvent.entityType || null, redactedEvent.entityId || null,
      redactedEvent.oldValue ? JSON.stringify(redactedEvent.oldValue) : null,
      redactedEvent.newValue ? JSON.stringify(redactedEvent.newValue) : null,
      JSON.stringify(redactedEvent.metadata || {})
    );
  }

  async listByEntity(scope: AuditScope, entityType: string, entityId: string) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM audit_events 
      WHERE tenant_id = ? AND entity_type = ? AND entity_id = ?
      ORDER BY occurred_at DESC
    `).all(scope.tenantId, entityType, entityId).map(parseRow);
  }

  async listByWorkspace(scope: AuditScope, limit = 100) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM audit_events 
      WHERE tenant_id = ? AND workspace_id = ?
      ORDER BY occurred_at DESC
      LIMIT ?
    `).all(scope.tenantId, scope.workspaceId, limit).map(parseRow);
  }
}

class SupabaseAuditRepository implements AuditRepository {
  async log(scopeOrEvent: AuditScope | (Partial<AuditEvent> & AuditScope), event?: Partial<AuditEvent>) {
    const scope = event
      ? scopeOrEvent as AuditScope
      : { tenantId: (scopeOrEvent as any).tenantId, workspaceId: (scopeOrEvent as any).workspaceId };
    const payload = event ?? {
      actorId: (scopeOrEvent as any).actorId ?? 'system',
      actorType: (scopeOrEvent as any).actorType,
      action: (scopeOrEvent as any).action,
      entityType: (scopeOrEvent as any).entityType,
      entityId: (scopeOrEvent as any).entityId,
      oldValue: (scopeOrEvent as any).oldValue,
      newValue: (scopeOrEvent as any).newValue,
      metadata: (scopeOrEvent as any).metadata,
    };
    await this.logEvent(scope, { actorId: 'system', ...payload } as AuditEvent);
  }

  async logEvent(scope: AuditScope, event: AuditEvent) {
    const supabase = getSupabaseAdmin();
    const redactedEvent = await redactForWorkspacePolicy(scope, event);
    const { error } = await supabase.from('audit_events').insert({
      id: crypto.randomUUID(),
      tenant_id: scope.tenantId,
      workspace_id: scope.workspaceId,
      actor_id: redactedEvent.actorId,
      actor_type: redactedEvent.actorType || 'human',
      action: redactedEvent.action,
      entity_type: redactedEvent.entityType || null,
      entity_id: redactedEvent.entityId || null,
      old_value: redactedEvent.oldValue,
      new_value: redactedEvent.newValue,
      metadata: redactedEvent.metadata || {}
    });
    if (error) throw error;
  }

  async listByEntity(scope: AuditScope, entityType: string, entityId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('audit_events')
      .select('*')
      .eq('tenant_id', scope.tenantId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('occurred_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async listByWorkspace(scope: AuditScope, limit = 100) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('audit_events')
      .select('*')
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .order('occurred_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }
}

let instance: AuditRepository | null = null;

export function createAuditRepository(): AuditRepository {
  if (instance) return instance;
  const provider = getDatabaseProvider();
  instance = provider === 'supabase' ? new SupabaseAuditRepository() : new SQLiteAuditRepository();
  return instance;
}
