import type { Database } from 'better-sqlite3';
import type { PermissionProfile, ReasoningProfile, SafetyProfile } from './types.js';
import { AGENT_CATALOG, type AgentCatalogEntry } from './catalog.js';

const READ_ONLY_PERMS: PermissionProfile = {
  canCallShopify: false,
  canCallStripe: false,
  canSendMessages: false,
  canIssueRefunds: false,
  canModifyCase: true,
  canRequestApproval: false,
  canWriteAuditLog: true,
  maxAutonomousRefundAmount: 0,
};

const ANALYSIS_PERMS: PermissionProfile = {
  ...READ_ONLY_PERMS,
  canRequestApproval: true,
};

const COMMUNICATION_PERMS: PermissionProfile = {
  ...ANALYSIS_PERMS,
  canSendMessages: true,
};

const RESOLUTION_PERMS: PermissionProfile = {
  canCallShopify: true,
  canCallStripe: true,
  canSendMessages: true,
  canIssueRefunds: true,
  canModifyCase: true,
  canRequestApproval: true,
  canWriteAuditLog: true,
  maxAutonomousRefundAmount: 50,
};

const SUPERVISOR_PERMS: PermissionProfile = {
  ...RESOLUTION_PERMS,
  maxAutonomousRefundAmount: 500,
};

const FAST_REASONING: ReasoningProfile = {
  model: 'gemini-1.5-flash',
  temperature: 0.1,
  maxOutputTokens: 1024,
  useJsonMode: true,
};

const BALANCED_REASONING: ReasoningProfile = {
  model: 'gemini-1.5-flash',
  temperature: 0.2,
  maxOutputTokens: 2048,
  useJsonMode: true,
};

const THOROUGH_REASONING: ReasoningProfile = {
  model: 'gemini-1.5-pro',
  temperature: 0.1,
  maxOutputTokens: 4096,
  useJsonMode: true,
};

const CREATIVE_REASONING: ReasoningProfile = {
  model: 'gemini-1.5-pro',
  temperature: 0.35,
  maxOutputTokens: 3072,
  useJsonMode: true,
};

const STANDARD_SAFETY: SafetyProfile = {
  requiresHumanApproval: false,
  maxConsecutiveFailures: 5,
  minConfidenceThreshold: 0.5,
  staleSilenceAlertHours: 24,
  alwaysApproveActions: [],
};

const STRICT_SAFETY: SafetyProfile = {
  requiresHumanApproval: false,
  maxConsecutiveFailures: 3,
  minConfidenceThreshold: 0.7,
  staleSilenceAlertHours: 12,
  alwaysApproveActions: ['issue_refund', 'cancel_order'],
};

const CRITICAL_SAFETY: SafetyProfile = {
  requiresHumanApproval: true,
  maxConsecutiveFailures: 2,
  minConfidenceThreshold: 0.8,
  staleSilenceAlertHours: 6,
  alwaysApproveActions: ['issue_refund', 'cancel_order', 'send_external_message'],
};

function getDefaultPermissionProfile(entry: AgentCatalogEntry): PermissionProfile {
  switch (entry.slug) {
    case 'supervisor':
      return SUPERVISOR_PERMS;
    case 'composer-translator':
      return COMMUNICATION_PERMS;
    case 'resolution-executor':
    case 'stripe-agent':
    case 'shopify-agent':
    case 'oms-erp-agent':
    case 'returns-agent':
    case 'subscription-agent':
    case 'helpdesk-agent':
      return RESOLUTION_PERMS;
    case 'approval-gatekeeper':
    case 'qa-policy-check':
    case 'case-resolution-planner':
    case 'customer-communication-agent':
    case 'sla-escalation-agent':
      return ANALYSIS_PERMS;
    default:
      return READ_ONLY_PERMS;
  }
}

function getDefaultReasoningProfile(entry: AgentCatalogEntry): ReasoningProfile {
  if (entry.modelTier === 'none') return FAST_REASONING;
  if (entry.modelTier === 'advanced') {
    return entry.slug === 'composer-translator' ? CREATIVE_REASONING : THOROUGH_REASONING;
  }
  return BALANCED_REASONING;
}

function getDefaultSafetyProfile(entry: AgentCatalogEntry): SafetyProfile {
  if (entry.slug === 'supervisor' || entry.slug === 'resolution-executor') return CRITICAL_SAFETY;
  if (entry.runtimeKind === 'connector' || entry.slug === 'approval-gatekeeper' || entry.slug === 'qa-policy-check') {
    return STRICT_SAFETY;
  }
  return STANDARD_SAFETY;
}

function buildCapabilities(entry: AgentCatalogEntry) {
  return {
    runtime_kind: entry.runtimeKind,
    implementation_mode: entry.implementationMode,
    model_tier: entry.modelTier,
    sort_order: entry.sortOrder,
    ui: {
      icon: entry.icon,
      iconColor: entry.iconColor,
      purpose: entry.purpose,
      triggers: entry.triggers,
      dependencies: entry.dependencies,
      ioLogic: entry.ioLogic,
    },
    architecture: {
      category: entry.category,
      owner: entry.runtimeKind === 'connector' ? 'integration-layer' : 'agent-runtime',
      configured_from_ai_studio: true,
    },
  };
}

function mergeProfile<T extends Record<string, any>>(existingRaw: unknown, defaults: T): T {
  let parsed = existingRaw;
  if (typeof existingRaw === 'string') {
    try {
      parsed = JSON.parse(existingRaw);
    } catch {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return defaults;
  return { ...defaults, ...(parsed as Record<string, any>) } as T;
}

export function seedAgents(db: Database, tenantId: string): void {
  const now = new Date().toISOString();

  for (const entry of AGENT_CATALOG) {
    const existingAgent = db.prepare(`
      SELECT *
      FROM agents
      WHERE tenant_id = ? AND (id = ? OR slug = ? OR name = ?)
      LIMIT 1
    `).get(tenantId, entry.id, entry.slug, entry.name) as any;

    const agentId = existingAgent?.id ?? entry.id;

    if (existingAgent) {
      db.prepare(`
        UPDATE agents
        SET name = ?, slug = ?, category = ?, description = ?, is_system = ?, is_locked = ?, is_active = ?, updated_at = COALESCE(updated_at, ?)
        WHERE id = ?
      `).run(
        entry.name,
        entry.slug,
        entry.category,
        entry.description,
        entry.isSystem,
        entry.isLocked,
        existingAgent.is_active ?? 1,
        now,
        agentId,
      );
    } else {
      db.prepare(`
        INSERT INTO agents
          (id, tenant_id, name, slug, category, description, is_system, is_locked, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        agentId,
        tenantId,
        entry.name,
        entry.slug,
        entry.category,
        entry.description,
        entry.isSystem,
        entry.isLocked,
        now,
        now,
      );
    }

    const currentVersion = (existingAgent?.current_version_id
      ? db.prepare('SELECT * FROM agent_versions WHERE id = ?').get(existingAgent.current_version_id)
      : db.prepare(`
          SELECT *
          FROM agent_versions
          WHERE agent_id = ?
          ORDER BY version_number DESC
          LIMIT 1
        `).get(agentId)) as any;

    const versionId = currentVersion?.id ?? `${agentId}_v1`;
    const permissionProfile = mergeProfile(currentVersion?.permission_profile, getDefaultPermissionProfile(entry));
    const reasoningProfile = mergeProfile(currentVersion?.reasoning_profile, getDefaultReasoningProfile(entry));
    const safetyProfile = mergeProfile(currentVersion?.safety_profile, getDefaultSafetyProfile(entry));
    const knowledgeProfile = mergeProfile(currentVersion?.knowledge_profile, {});
    const capabilities = {
      ...mergeProfile(currentVersion?.capabilities, {}),
      ...buildCapabilities(entry),
    };

    if (currentVersion) {
      db.prepare(`
        UPDATE agent_versions
        SET permission_profile = ?,
            reasoning_profile = ?,
            safety_profile = ?,
            knowledge_profile = ?,
            capabilities = ?,
            status = COALESCE(status, 'published'),
            rollout_percentage = COALESCE(rollout_percentage, 100),
            published_at = COALESCE(published_at, ?)
        WHERE id = ?
      `).run(
        JSON.stringify(permissionProfile),
        JSON.stringify(reasoningProfile),
        JSON.stringify(safetyProfile),
        JSON.stringify(knowledgeProfile),
        JSON.stringify(capabilities),
        now,
        versionId,
      );
    } else {
      db.prepare(`
        INSERT INTO agent_versions
          (id, agent_id, version_number, status, permission_profile, reasoning_profile, safety_profile, knowledge_profile, capabilities, rollout_percentage, published_at, tenant_id)
        VALUES (?, ?, 1, 'published', ?, ?, ?, ?, ?, 100, ?, ?)
      `).run(
        versionId,
        agentId,
        JSON.stringify(permissionProfile),
        JSON.stringify(reasoningProfile),
        JSON.stringify(safetyProfile),
        JSON.stringify(knowledgeProfile),
        JSON.stringify(capabilities),
        now,
        tenantId,
      );
    }

    db.prepare(`
      UPDATE agents
      SET current_version_id = ?, updated_at = COALESCE(updated_at, ?)
      WHERE id = ?
    `).run(versionId, now, agentId);
  }

  console.log(`Seeded/synchronized ${AGENT_CATALOG.length} agents`);
}
