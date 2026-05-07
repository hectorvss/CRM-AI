/**
 * server/runtime/adapters/connectors.ts
 *
 * Adapter handlers for `connector.*` node keys.
 * Phase 3h of the workflow extraction (Turno 5b/D2). Byte-for-byte
 * transcription of the inline branches.
 *
 * Includes: connector.call, connector.check_health, connector.emit_event.
 */

import type { NodeAdapter } from '../workflowExecutor.js';
import {
  parseMaybeJsonObject,
  resolveTemplateValue,
} from '../nodeHelpers.js';
import {
  createApprovalRepository,
  createIntegrationRepository,
} from '../../data/index.js';
import { integrationRegistry } from '../../integrations/registry.js';

const integrationRepository = createIntegrationRepository();
const approvalRepository = createApprovalRepository();

const connectorCall: NodeAdapter = async ({ scope, context, services }, node, config) => {
  const fetchImpl = services?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const registry: { get: (k: any) => any } = (services?.integrations ?? integrationRegistry) as any;
  const connectorId = config.connector_id || config.connectorId || config.connector;
  if (!connectorId) return { status: 'failed', error: 'connector.call requires connector id' } as any;
  const connector = await integrationRepository.getConnector({ tenantId: scope.tenantId }, connectorId);
  if (!connector) return { status: 'failed', error: 'Connector not found' } as any;
  const capabilities = await integrationRepository.listCapabilities({ tenantId: scope.tenantId }, connectorId);
  const capabilityKey = config.capability || config.capability_key || config.action || capabilities.find((cap: any) => cap.is_enabled !== false)?.capability_key || 'workflow.call';
  const capability = capabilities.find((cap: any) => cap.capability_key === capabilityKey);
  if (capability && capability.is_enabled === false) {
    return { status: 'blocked', output: { reason: 'Connector capability is disabled', connectorId, capabilityKey } };
  }
  if (capability?.requires_approval) {
    const approval = await approvalRepository.create(scope, {
      caseId: context.case?.id ?? null,
      actionType: 'connector.call',
      actionPayload: { connectorId, capabilityKey, nodeId: node.id, config },
      riskLevel: 'medium',
      priority: 'normal',
      evidencePackage: { workflowNode: node.label, connector: connector.system },
    });
    return { status: 'waiting_approval', output: { approvalId: approval.id, connectorId, capabilityKey } };
  }

  const auth = (() => {
    const raw = connector.auth_config;
    if (!raw) return {} as Record<string, any>;
    if (typeof raw === 'object') return raw as Record<string, any>;
    try { return JSON.parse(String(raw)); } catch { return {}; }
  })();
  const inputPayload = parseMaybeJsonObject(config.input ?? config.payload ?? config.body ?? {}) || {};
  const resolvedInput: Record<string, any> = {};
  for (const [k, v] of Object.entries(inputPayload)) {
    resolvedInput[k] = typeof v === 'string' ? resolveTemplateValue(v, context) : v;
  }

  let dispatchResult: { ok: boolean; result?: any; error?: string; via: 'adapter' | 'http' | 'persisted-only' } = { ok: false, via: 'persisted-only' };
  try {
    const adapter: any = registry.get(String(connector.system) as any);
    const candidateMethods = [
      capabilityKey,
      capabilityKey.replace(/[._-](\w)/g, (_: string, c: string) => c.toUpperCase()),
      `run${capabilityKey.charAt(0).toUpperCase()}${capabilityKey.slice(1)}`,
      `call${capabilityKey.charAt(0).toUpperCase()}${capabilityKey.slice(1)}`,
    ];
    const method = adapter ? candidateMethods.find((m) => typeof adapter[m] === 'function') : null;
    if (adapter && method) {
      const result = await adapter[method](resolvedInput);
      dispatchResult = { ok: true, result, via: 'adapter' };
    } else {
      const httpMethod = String(capability?.http_method || config.http_method || config.method || 'POST').toUpperCase();
      const pathTemplate = String(capability?.http_path || config.http_path || config.path || `/${capabilityKey.replace(/\./g, '/')}`);
      const baseUrl = String(auth.base_url || auth.api_base || connector.base_url || capability?.base_url || '').replace(/\/+$/, '');
      if (!baseUrl) {
        dispatchResult = { ok: false, error: `Conector ${connector.system}: falta base_url y no hay adaptador registrado para la capacidad "${capabilityKey}".`, via: 'persisted-only' };
      } else {
        const url = `${baseUrl}${pathTemplate.startsWith('/') ? '' : '/'}${pathTemplate}`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (auth.access_token) headers['Authorization'] = `Bearer ${auth.access_token}`;
        else if (auth.api_key)  headers['Authorization'] = `Bearer ${auth.api_key}`;
        else if (auth.token)    headers['Authorization'] = `Bearer ${auth.token}`;
        const resp = await fetchImpl(url, {
          method: httpMethod,
          headers,
          body: ['GET', 'HEAD'].includes(httpMethod) ? undefined : JSON.stringify(resolvedInput),
          signal: AbortSignal.timeout(20_000),
        });
        const text = await resp.text();
        let parsed: any = text;
        try { parsed = JSON.parse(text); } catch { /* keep as text */ }
        dispatchResult = resp.ok
          ? { ok: true, result: parsed, via: 'http' }
          : { ok: false, error: `HTTP ${resp.status} ${resp.statusText}: ${typeof parsed === 'string' ? parsed.slice(0, 200) : JSON.stringify(parsed).slice(0, 200)}`, via: 'http' };
      }
    }
  } catch (err: any) {
    dispatchResult = { ok: false, error: `Dispatch failed: ${err?.message ?? String(err)}`, via: dispatchResult.via };
  }

  const canonicalEvent = await integrationRepository.createCanonicalEvent({ tenantId: scope.tenantId }, {
    sourceSystem: connector.system,
    sourceEntityType: config.source_entity_type || config.sourceEntityType || 'workflow',
    sourceEntityId: config.source_entity_id || config.sourceEntityId || node.id,
    eventType: capabilityKey,
    eventCategory: 'workflow',
    canonicalEntityType: config.entity_type || config.entityType || (context.case ? 'case' : 'workflow'),
    canonicalEntityId: config.entity_id || config.entityId || context.case?.id || node.id,
    normalizedPayload: {
      nodeId: node.id,
      config,
      trigger: context.trigger,
      input: resolvedInput,
      result: dispatchResult.ok ? dispatchResult.result : null,
      dispatchError: dispatchResult.error ?? null,
      dispatchVia: dispatchResult.via,
    },
    dedupeKey: config.dedupe_key || `${node.id}:${Date.now()}`,
    caseId: context.case?.id ?? null,
    workspaceId: scope.workspaceId,
    status: dispatchResult.ok ? 'processed' : 'failed',
  });
  context.integration = {
    connectorId, system: connector.system, capabilityKey,
    canonicalEventId: canonicalEvent.id,
    result: dispatchResult.ok ? dispatchResult.result : null,
    via: dispatchResult.via,
  };
  if (!dispatchResult.ok) {
    return { status: 'failed', error: dispatchResult.error || `Connector call failed (${connector.system}.${capabilityKey})`, output: context.integration } as any;
  }
  return { status: 'completed', output: { ...context.integration, ok: true, result: dispatchResult.result } };
};

const connectorCheckHealth: NodeAdapter = async ({ scope, context }, _node, config) => {
  const connectorId = config.connector_id || config.connectorId || config.connector;
  if (!connectorId) return { status: 'failed', error: 'connector.check_health requires connector id' } as any;
  const connector = await integrationRepository.getConnector({ tenantId: scope.tenantId }, connectorId);
  if (!connector) return { status: 'failed', error: 'Connector not found' } as any;
  const healthy = !['disabled', 'error', 'failed'].includes(String(connector.status || connector.health_status || '').toLowerCase());
  context.integration = { connectorId, system: connector.system, healthy, status: connector.status ?? connector.health_status ?? 'unknown' };
  return { status: healthy ? 'completed' : 'blocked', output: context.integration };
};

const connectorEmitEvent: NodeAdapter = async ({ scope, context, services }, node, config) => {
  const registry: { get: (k: any) => any } = (services?.integrations ?? integrationRegistry) as any;
  const connectorId = config.connector_id || config.connectorId || config.connector;
  const connector = connectorId ? await integrationRepository.getConnector({ tenantId: scope.tenantId }, connectorId) : null;
  const sourceSystem = connector?.system || config.source_system || config.sourceSystem || 'workflow';
  const eventType = config.event_type || config.eventType || config.capability || 'workflow.event';

  let emittedExternally = false;
  let emitError: string | null = null;
  let emitResult: any = null;
  if (connector) {
    try {
      const adapter: any = registry.get(String(connector.system) as any);
      const emitFn = adapter
        ? (typeof adapter.emitEvent === 'function' ? adapter.emitEvent
          : typeof adapter.publishEvent === 'function' ? adapter.publishEvent
          : typeof adapter.sendEvent === 'function' ? adapter.sendEvent
          : null)
        : null;
      if (emitFn) {
        emitResult = await emitFn.call(adapter, {
          eventType,
          payload: context.data ?? {},
          nodeId: node.id,
          trigger: context.trigger,
        });
        emittedExternally = true;
      }
    } catch (err: any) {
      emitError = err?.message ?? String(err);
    }
  }

  const canonicalEvent = await integrationRepository.createCanonicalEvent({ tenantId: scope.tenantId }, {
    sourceSystem,
    sourceEntityType: config.source_entity_type || config.sourceEntityType || 'workflow',
    sourceEntityId: config.source_entity_id || config.sourceEntityId || node.id,
    eventType,
    eventCategory: config.event_category || config.eventCategory || 'workflow',
    canonicalEntityType: config.entity_type || config.entityType || (context.case ? 'case' : 'workflow'),
    canonicalEntityId: config.entity_id || config.entityId || context.case?.id || node.id,
    normalizedPayload: {
      nodeId: node.id,
      trigger: context.trigger,
      data: context.data,
      emittedExternally,
      emitResult,
      emitError,
    },
    dedupeKey: config.dedupe_key || `${node.id}:${eventType}:${Date.now()}`,
    caseId: context.case?.id ?? null,
    workspaceId: scope.workspaceId,
    status: emitError ? 'failed' : 'processed',
  });
  context.integration = { sourceSystem, eventType, canonicalEventId: canonicalEvent.id, emittedExternally };
  if (emitError) {
    return { status: 'failed', error: `connector.emit_event: ${emitError}`, output: context.integration } as any;
  }
  return {
    status: emittedExternally ? 'completed' : 'blocked',
    output: emittedExternally
      ? context.integration
      : { ...context.integration, reason: 'Conector sin transporte para emitir eventos; sólo se registró el evento canónico.' },
  };
};

export const connectorsAdapters: Record<string, NodeAdapter> = {
  'connector.call': connectorCall,
  'connector.check_health': connectorCheckHealth,
  'connector.emit_event': connectorEmitEvent,
};
