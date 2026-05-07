/**
 * server/runtime/adapters/core.ts
 *
 * Adapter handlers for `core.*` and `policy.evaluate` node keys.
 *
 * Phase 3b of the workflow extraction (Turno 5b/D2). Each handler is a
 * byte-for-byte transcription of the inline branch that previously lived
 * in `server/routes/workflows.ts`.
 *
 * Service dependencies
 * ────────────────────
 *   - `core.audit_log`           uses auditRepository (singleton import)
 *   - `core.idempotency_check`   uses ctx.services?.supabase + clock
 *   - `core.rate_limit`          uses ctx.services?.supabase + clock
 *   - `core.code`                uses node:vm sandbox + logger
 *   - `core.data_table_op`       uses workspaceRepository (singleton import)
 *   - `core.respond_webhook`     pure (mutates context.webhookResponse)
 *   - `policy.evaluate`          uses knowledgeRepository (singleton import)
 */

import vm from 'node:vm';
import type { NodeAdapter } from '../workflowExecutor.js';
import {
  cloneJson,
  compareValues,
  parseMaybeJsonObject,
  readContextPath,
  resolveTemplateValue,
} from '../nodeHelpers.js';
import {
  createAuditRepository,
  createKnowledgeRepository,
  createWorkspaceRepository,
} from '../../data/index.js';
import { logger } from '../../utils/logger.js';

const auditRepository = createAuditRepository();
const knowledgeRepository = createKnowledgeRepository();
const workspaceRepository = createWorkspaceRepository();

const policyEvaluate: NodeAdapter = async ({ scope, context }, _node, config) => {
  const policyKey = config.policy || config.policyKey || config.policy_key || 'default';
  const proposedAction = String(config.action || config.proposedAction || config.proposed_action || context.agent?.intent || '');
  const amount = Number(readContextPath(context, config.amountField || config.amount_field || 'payment.amount') ?? context.payment?.amount ?? 0);
  const riskLevel = String(readContextPath(context, config.riskField || config.risk_field || 'agent.riskLevel') ?? context.agent?.riskLevel ?? context.payment?.risk_level ?? 'low');

  let policyDecision: 'allow' | 'review' | 'block' = 'allow';
  let policyReason = `Policy ${policyKey}: default allow`;
  let policySource = 'default';

  try {
    const articles = await knowledgeRepository.listArticles(scope, { q: policyKey, status: 'published', type: 'policy' });
    const policyArticle = articles?.[0];
    if (policyArticle) {
      const policyText = String(policyArticle.content ?? policyArticle.summary ?? policyArticle.title ?? '').toLowerCase();
      policySource = policyArticle.title ?? policyKey;
      const blockedTerms = ['forbidden', 'not allowed', 'manager required', 'escalate', 'reject'];
      const reviewTerms = ['review required', 'approval needed', 'check with', 'verify'];
      if (blockedTerms.some((term) => policyText.includes(term)) || riskLevel === 'high') {
        policyDecision = 'block';
        policyReason = `Policy ${policySource}: blocked (risk=${riskLevel})`;
      } else if (reviewTerms.some((term) => policyText.includes(term)) || amount > Number(config.reviewThreshold || config.review_threshold || 500)) {
        policyDecision = 'review';
        policyReason = `Policy ${policySource}: requires review (amount=${amount}, risk=${riskLevel})`;
      } else {
        policyDecision = 'allow';
        policyReason = `Policy ${policySource}: allowed`;
      }
    } else {
      const fieldValue = readContextPath(context, config.field || 'agent.riskLevel');
      const fieldDecision = compareValues(fieldValue, config.operator || '!=', config.blockValue || 'critical') ? 'allow' : 'block';
      policyDecision = fieldDecision as typeof policyDecision;
      policyReason = `Policy ${policyKey}: field-based decision (${config.field}=${fieldValue})`;
    }
  } catch {
    policyDecision = riskLevel === 'high' ? 'block' : amount > 1000 ? 'review' : 'allow';
    policyReason = `Policy ${policyKey}: heuristic (risk=${riskLevel}, amount=${amount})`;
  }

  if (config.decision) {
    policyDecision = config.decision as typeof policyDecision;
    policyReason = `Policy ${policyKey}: config override`;
  }

  const result = { decision: policyDecision, policy: policyKey, source: policySource, reason: policyReason, proposedAction, amount, riskLevel };
  context.policy = result;
  return {
    status: policyDecision === 'block' ? 'blocked' : policyDecision === 'review' ? 'waiting_approval' : 'completed',
    output: result,
  };
};

const coreAuditLog: NodeAdapter = async ({ scope, context }, node, config) => {
  const entityType = config.entity_type || config.entityType || (context.case ? 'case' : 'workflow');
  const entityId = config.entity_id || config.entityId || context.case?.id || node.id;
  await auditRepository.logEvent({ tenantId: scope.tenantId, workspaceId: scope.workspaceId }, {
    actorId: scope.userId ?? 'workflow',
    actorType: 'system',
    action: config.action || 'WORKFLOW_NODE_AUDIT',
    entityType,
    entityId,
    metadata: { nodeId: node.id, label: node.label, message: config.message || null, data: context.data ?? {} },
  });
  return { status: 'completed', output: { audited: true, entityType, entityId } };
};

const coreIdempotencyCheck: NodeAdapter = async ({ scope, context, services }, node, config) => {
  const rawKey = String(config.key || config.idempotencyKey || `${node.id}:${context.case?.id ?? context.order?.id ?? context.trigger?.id ?? 'manual'}`);
  const ttlSeconds = Number(config.ttlSeconds ?? config.ttl_seconds ?? 86400);

  if (services?.supabase) {
    const crypto = await import('node:crypto');
    const hashed = crypto
      .createHash('sha256')
      .update(`${scope.tenantId}:${scope.workspaceId}:${rawKey}`)
      .digest('hex');
    const now = services.clock?.now?.() ?? new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    const { error } = await services.supabase.from('workflow_runtime_state').insert({
      tenant_id: scope.tenantId,
      workspace_id: scope.workspaceId,
      key_namespace: 'idempotency',
      key: hashed,
      value: { run_id: context.runId ?? null, step_id: node.id, completed_at: null },
      expires_at: expiresAt,
    });
    if (error && (error as any).code === '23505') {
      return {
        status: 'blocked',
        error: {
          code: 'IDEMPOTENT_DUPLICATE',
          message: 'Esta clave de idempotencia ya está siendo procesada o se procesó recientemente.',
        },
      };
    }
    if (error) {
      return {
        status: 'failed',
        error: { code: 'IDEMPOTENCY_STORE_ERROR', message: (error as any).message ?? String(error) },
      };
    }
    return { status: 'completed', output: { idempotency_key: hashed, first_seen: true } };
  }

  console.warn('[workflow] cross-run idempotency/rate-limit requires services injection; running in per-run mode');
  context.idempotency = context.idempotency ?? {};
  if (context.idempotency[rawKey]) return { status: 'skipped', output: { duplicate: true, key: rawKey } };
  context.idempotency[rawKey] = true;
  return { status: 'completed', output: { duplicate: false, key: rawKey } };
};

const coreRateLimit: NodeAdapter = async ({ scope, context, services }, node, config) => {
  const rawKey = String(config.key || config.bucket || node.id);
  const max = Number(config.max ?? config.limit ?? 10);
  const windowSeconds = Number(config.window ?? config.windowSeconds ?? config.window_seconds ?? 60);

  if (services?.supabase) {
    const crypto = await import('node:crypto');
    const hashed = crypto
      .createHash('sha256')
      .update(`${scope.tenantId}:${scope.workspaceId}:${rawKey}`)
      .digest('hex');
    const now = services.clock?.now?.() ?? new Date();
    const nowMs = now.getTime();

    const { data: existing } = await services.supabase
      .from('workflow_runtime_state')
      .select('value')
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .eq('key_namespace', 'rate_limit')
      .eq('key', hashed)
      .maybeSingle();

    const value = existing?.value as
      | { tokens?: number; refilled_at?: string; max?: number; window_seconds?: number }
      | undefined;
    const refilledAt = value?.refilled_at ? new Date(value.refilled_at).getTime() : 0;
    const expired = !value || nowMs - refilledAt > windowSeconds * 1000;

    if (expired) {
      const newValue = {
        tokens: max - 1,
        refilled_at: now.toISOString(),
        max,
        window_seconds: windowSeconds,
      };
      await services.supabase.from('workflow_runtime_state').upsert({
        tenant_id: scope.tenantId,
        workspace_id: scope.workspaceId,
        key_namespace: 'rate_limit',
        key: hashed,
        value: newValue,
        expires_at: new Date(nowMs + windowSeconds * 1000).toISOString(),
      });
      return { status: 'completed', output: { tokens_remaining: newValue.tokens, max, window_seconds: windowSeconds } };
    }

    const tokens = Number(value?.tokens ?? 0);
    if (tokens <= 0) {
      return {
        status: 'blocked',
        error: {
          code: 'RATE_LIMITED',
          message: 'Límite de frecuencia alcanzado para este nodo. Espera unos segundos y vuelve a intentarlo.',
        },
      };
    }

    const newValue = {
      tokens: tokens - 1,
      refilled_at: value?.refilled_at ?? now.toISOString(),
      max,
      window_seconds: windowSeconds,
    };
    await services.supabase
      .from('workflow_runtime_state')
      .update({ value: newValue, updated_at: now.toISOString() })
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .eq('key_namespace', 'rate_limit')
      .eq('key', hashed);
    return { status: 'completed', output: { tokens_remaining: newValue.tokens, max, window_seconds: windowSeconds } };
  }

  console.warn('[workflow] cross-run idempotency/rate-limit requires services injection; running in per-run mode');
  const limit = Number(config.limit || 1);
  const bucket = String(config.bucket || node.id);
  context.rateLimits = context.rateLimits ?? {};
  context.rateLimits[bucket] = Number(context.rateLimits[bucket] || 0) + 1;
  const allowed = context.rateLimits[bucket] <= limit;
  return { status: allowed ? 'completed' : 'waiting', output: { bucket, count: context.rateLimits[bucket], limit, allowed } };
};

const coreCode: NodeAdapter = async ({ context }, node, config) => {
  const language = String(config.language || 'javascript').toLowerCase();
  if (language !== 'javascript') {
    return { status: 'failed', error: `core.code: language '${language}' not supported. Only 'javascript' is available.` } as any;
  }
  const code = String(config.code || '').trim();
  if (!code) return { status: 'failed', error: 'core.code: code is required' } as any;
  const timeoutMs = Math.min(30_000, Math.max(50, Number(config.timeoutMs || 2000)));
  const target = String(config.target || 'codeResult');
  try {
    const sandboxContext = {
      context: cloneJson(context ?? {}),
      data: cloneJson(context.data ?? {}),
      trigger: cloneJson(context.trigger ?? {}),
      JSON,
      Math,
      Date,
      Number,
      String,
      Array,
      Object,
      Boolean,
      console: {
        log: (...args: any[]) => logger.info('core.code log', { nodeId: node.id, args }),
      },
    };
    const wrappedSource = `(function userCode() { ${code} })()`;
    const script = new vm.Script(wrappedSource, { filename: `workflow-node-${node.id}.js` });
    const ctx = vm.createContext(sandboxContext);
    const value = script.runInContext(ctx, { timeout: timeoutMs, breakOnSigint: true });
    const safeValue = (() => {
      try { return JSON.parse(JSON.stringify(value ?? null)); } catch { return null; }
    })();
    context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: safeValue };
    return { status: 'completed', output: { data: context.data, target, value: safeValue } };
  } catch (err: any) {
    return { status: 'failed', error: `core.code execution failed: ${err?.message ?? String(err)}` } as any;
  }
};

const coreDataTableOp: NodeAdapter = async ({ scope, context }, _node, config) => {
  const tableId = String(config.tableId || config.table_id || '');
  if (!tableId) return { status: 'failed', error: 'core.data_table_op: tableId is required' } as any;
  const operation = String(config.operation || 'list');
  const target = String(config.target || 'tableResult');

  const workspace = await workspaceRepository.getById(scope.workspaceId, scope.tenantId);
  if (!workspace) return { status: 'failed', error: 'core.data_table_op: workspace not found' } as any;
  const settings = (workspace.settings && typeof workspace.settings === 'object' ? workspace.settings : {}) as any;
  const wfSettings = (settings.workflows && typeof settings.workflows === 'object' ? settings.workflows : {}) as any;
  const tables: any[] = Array.isArray(wfSettings.dataTables) ? wfSettings.dataTables : [];
  const table = tables.find((t) => t && t.id === tableId);
  if (!table) {
    return { status: 'failed', error: `core.data_table_op: data table '${tableId}' not found in workspace. Create it under Workflows → Data tables.` } as any;
  }
  const rows: any[] = Array.isArray(table.rows) ? table.rows : [];
  const matchField = config.matchField ? String(config.matchField) : 'id';
  const matchValueRaw = config.matchValue !== undefined ? resolveTemplateValue(String(config.matchValue), context) : undefined;

  const persistTables = async (nextRows: any[]) => {
    const updatedTables = tables.map((t) => (t.id === tableId ? { ...t, rows: nextRows, updated_at: new Date().toISOString() } : t));
    const nextSettings = {
      ...settings,
      workflows: { ...wfSettings, dataTables: updatedTables },
    };
    await workspaceRepository.updateSettings(scope.workspaceId, nextSettings);
  };

  if (operation === 'list') {
    context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: rows };
    return { status: 'completed', output: { data: context.data, count: rows.length, target } };
  }
  if (operation === 'find') {
    const found = rows.find((r) => String(r?.[matchField] ?? '') === String(matchValueRaw ?? ''));
    context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: found ?? null };
    return { status: 'completed', output: { data: context.data, found: !!found, target } };
  }
  if (operation === 'insert') {
    const row = parseMaybeJsonObject(config.row);
    if (Object.keys(row).length === 0) return { status: 'failed', error: 'core.data_table_op insert: row data is required' } as any;
    const nextRows = [...rows, row];
    await persistTables(nextRows);
    context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: row };
    return { status: 'completed', output: { data: context.data, target, inserted: true } };
  }
  if (operation === 'update') {
    const row = parseMaybeJsonObject(config.row);
    const nextRows = rows.map((r) => (String(r?.[matchField] ?? '') === String(matchValueRaw ?? '') ? { ...r, ...row } : r));
    const updatedCount = nextRows.filter((r, i) => r !== rows[i]).length;
    if (updatedCount > 0) await persistTables(nextRows);
    context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: { updated: updatedCount } };
    return { status: 'completed', output: { data: context.data, target, updated: updatedCount } };
  }
  if (operation === 'upsert') {
    const row = parseMaybeJsonObject(config.row);
    const idx = rows.findIndex((r) => String(r?.[matchField] ?? '') === String(matchValueRaw ?? ''));
    const nextRows = idx >= 0 ? rows.map((r, i) => (i === idx ? { ...r, ...row } : r)) : [...rows, row];
    await persistTables(nextRows);
    context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: row };
    return { status: 'completed', output: { data: context.data, target, mode: idx >= 0 ? 'updated' : 'inserted' } };
  }
  if (operation === 'delete') {
    const before = rows.length;
    const nextRows = rows.filter((r) => String(r?.[matchField] ?? '') !== String(matchValueRaw ?? ''));
    const deleted = before - nextRows.length;
    if (deleted > 0) await persistTables(nextRows);
    context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: { deleted } };
    return { status: 'completed', output: { data: context.data, target, deleted } };
  }
  return { status: 'failed', error: `core.data_table_op: unsupported operation '${operation}'` } as any;
};

const coreRespondWebhook: NodeAdapter = async ({ context }, _node, config) => {
  const statusCode = Math.max(100, Math.min(599, Number(config.statusCode || 200)));
  const contentType = String(config.contentType || 'application/json');
  const bodyTemplate = config.body || '';
  const resolvedBody = resolveTemplateValue(bodyTemplate, context);
  let payload: any = resolvedBody;
  if (contentType === 'application/json') {
    try { payload = JSON.parse(resolvedBody); } catch { /* keep raw */ }
  }
  context.webhookResponse = { statusCode, contentType, body: payload };
  return { status: 'completed', output: { statusCode, contentType, body: payload } };
};

export const coreAdapters: Record<string, NodeAdapter> = {
  'policy.evaluate': policyEvaluate,
  'core.audit_log': coreAuditLog,
  'core.idempotency_check': coreIdempotencyCheck,
  'core.rate_limit': coreRateLimit,
  'core.code': coreCode,
  'core.data_table_op': coreDataTableOp,
  'core.respond_webhook': coreRespondWebhook,
};
