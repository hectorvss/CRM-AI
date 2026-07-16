/** Seed E2E data for the F4 UI verification. Run: npx tsx tests/fin-agent/seed-ui-e2e.ts */
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
const s = getSupabaseAdmin();
const T = process.env.SEED_TENANT || 'org_default', W = process.env.SEED_WS || 'ws_default';
const CASE_ID = 'fin-ui-e2e-case';
const CONV_ID = 'fin-ui-e2e-conv';
const now = new Date().toISOString();

// idempotent cleanup
await s.from('messages').delete().eq('conversation_id', CONV_ID);
await s.from('fin_pending_actions').delete().eq('case_id', CASE_ID);
await s.from('fin_procedure_runs').delete().eq('case_id', CASE_ID);
await s.from('conversations').delete().eq('id', CONV_ID);
await s.from('cases').delete().eq('id', CASE_ID);
await s.from('fin_procedures').delete().eq('name', 'E2E Reembolso UI');
await s.from('fin_connectors').delete().eq('name', 'E2E CRM interno');

let r: any = await s.from('cases').insert({ id: CASE_ID, case_number: 'FIN-UI-1', tenant_id: T, workspace_id: W, type: 'question', status: 'open', priority: 'medium', created_at: now, updated_at: now, conversation_id: CONV_ID, last_activity_at: now, first_response_at: null });
if (r.error) throw new Error('case: ' + r.error.message);
r = await s.from('conversations').insert({ id: CONV_ID, case_id: CASE_ID, tenant_id: T, workspace_id: W, channel: 'chat', status: 'open', created_at: now, updated_at: now });
if (r.error) throw new Error('conv: ' + r.error.message);
r = await s.from('messages').insert([
  { id: crypto.randomUUID(), conversation_id: CONV_ID, case_id: CASE_ID, type: 'message', direction: 'inbound', content: '¿Cómo cambio la dirección de envío de mi pedido?', content_type: 'text', channel: 'chat', sent_at: now, created_at: now, tenant_id: T, author_type: 'customer', is_private: false },
  { id: 'fin-ui-e2e-draft', conversation_id: CONV_ID, case_id: CASE_ID, type: 'ai_draft', direction: 'outbound', sender_id: 'fin-agent', sender_name: 'Fin', content: 'Puedes cambiar la dirección desde Pedidos → Detalle → Editar dirección, siempre que el pedido no haya salido del almacén.', content_type: 'text', channel: 'chat', sent_at: now, created_at: now, tenant_id: T, is_private: true, author_type: 'ai', citations: ['kb-1', 'kb-2'], confidence: 0.87 },
]);
if (r.error) throw new Error('msgs: ' + r.error.message);

r = await s.from('fin_connectors').insert({ tenant_id: T, workspace_id: W, name: 'E2E CRM interno', kind: 'internal', active: true }).select('id').single();
if (r.error) throw new Error('connector: ' + r.error.message);
const connId = r.data.id;
r = await s.from('fin_connector_actions').insert({ connector_id: connId, tenant_id: T, workspace_id: W, name: 'Actualizar dirección', description: 'Actualiza la dirección de envío', tool_name: 'case.list', policy: 'write_approval' }).select('id').single();
if (r.error) throw new Error('action: ' + r.error.message);
const actionId = r.data.id;
r = await s.from('fin_procedures').insert({ tenant_id: T, workspace_id: W, name: 'E2E Reembolso UI', description: 'Procedimiento sembrado para verificar la UI', trigger_criteria: 'El cliente pide un reembolso', status: 'live', steps: [ { type: 'collect', variable: 'order_number', prompt: 'Pide el número de pedido' }, { type: 'action', action_id: actionId, args_template: { limit: '1' }, preview: 'Actualizar dirección {{order_number}}' }, { type: 'handoff', team: 'billing', note: 'Confirmar' } ] }).select('id').single();
if (r.error) throw new Error('procedure: ' + r.error.message);
r = await s.from('fin_procedure_runs').insert({ tenant_id: T, workspace_id: W, procedure_id: r.data.id, case_id: CASE_ID, conversation_id: CONV_ID, status: 'waiting_approval', current_step: 1, state: { order_number: 'PED-77' } }).select('id').single();
if (r.error) throw new Error('run: ' + r.error.message);
const runId = r.data.id;
r = await s.from('fin_pending_actions').insert({ tenant_id: T, workspace_id: W, run_id: runId, case_id: CASE_ID, action_id: actionId, args: { limit: '1' }, preview: 'Actualizar dirección del pedido PED-77' }).select('id').single();
if (r.error) throw new Error('pending: ' + r.error.message);
console.log(JSON.stringify({ caseId: CASE_ID, convId: CONV_ID, pendingId: r.data.id, runId, actionId }));
