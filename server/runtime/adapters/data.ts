/**
 * server/runtime/adapters/data.ts
 *
 * Adapter handlers for `data.*` node keys.
 *
 * Phase 3a of the workflow extraction (Turno 5b/D2). Each handler is a
 * byte-for-byte transcription of the inline branch that previously lived
 * in `server/routes/workflows.ts` inside `executeWorkflowNode`. No
 * behavior change — the dispatch in the route file still computes
 * `config = resolveNodeConfig(...)` and the trigger/idempotency/rate-limit
 * preamble before delegating to these adapters.
 *
 * Notes
 * ─────
 *   - The route's previous `data.*` block had a shared preamble computing
 *     `source` and `base = cloneJson(...)`. Adapters that need `base`
 *     replicate it locally so each one is self-contained.
 *   - `data.ai_transform` uses Gemini (appConfig + GoogleGenerativeAI +
 *     withGeminiRetry). Imports are local to keep the adapter file
 *     standalone.
 */

import type { NodeAdapter } from '../workflowExecutor.js';
import {
  asArray,
  cloneJson,
  parseMaybeJsonObject,
  readContextPath,
  resolveTemplateValue,
} from '../nodeHelpers.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withGeminiRetry } from '../../ai/geminiRetry.js';
import { config as appConfig } from '../../config.js';

function makeBase(context: any, config: any) {
  const source = readContextPath(context, config.source || config.path || 'data');
  return cloneJson(source && typeof source === 'object' ? source : context.data && typeof context.data === 'object' ? context.data : {});
}

const dataCleanContext: NodeAdapter = async ({ context }, _node, config) => {
  const fields = asArray(config.fields || config.keys);
  const mode = config.mode || 'remove';
  if (mode === 'keep_only') {
    const cleaned: Record<string, any> = {};
    fields.forEach((f: any) => {
      if (context.data && context.data[f] !== undefined) cleaned[f] = context.data[f];
    });
    context.data = cleaned;
  } else {
    fields.forEach((f: any) => {
      if (context.data) delete context.data[f];
    });
  }
  return { status: 'completed', output: { cleaned: true, count: fields.length, mode } };
};

const dataSetFields: NodeAdapter = async ({ context }, _node, config) => {
  const base = makeBase(context, config);
  const field = String(config.field || config.target || 'value');
  const value = resolveTemplateValue(config.value ?? config.content ?? config.output ?? '', context);
  if (base && typeof base === 'object') {
    base[field] = value;
  }
  context.data = base;
  return { status: 'completed', output: { data: base, updated: { [field]: value } } };
};

const dataRenameFields: NodeAdapter = async ({ context }, _node, config) => {
  const base = makeBase(context, config);
  const mapping = parseMaybeJsonObject(config.mapping);
  const renamed: Record<string, any> = {};
  Object.entries(base && typeof base === 'object' ? base : {}).forEach(([key, value]) => {
    const targetKey = mapping[key] ?? mapping[String(key)] ?? (key === config.source ? config.target : key);
    renamed[String(targetKey ?? key)] = value;
  });
  context.data = renamed;
  return { status: 'completed', output: { data: renamed, renamed: true } };
};

const dataExtractJson: NodeAdapter = async ({ context }, _node, config) => {
  const raw = readContextPath(context, config.source || config.field || config.path || 'trigger');
  let extracted: any = raw;
  if (typeof raw === 'string') {
    try {
      extracted = JSON.parse(raw);
    } catch {
      extracted = { raw };
    }
  }
  if (config.path && extracted && typeof extracted === 'object') {
    extracted = readContextPath(extracted, config.path);
  }
  context.data = extracted ?? {};
  return { status: 'completed', output: { data: extracted, extracted: true } };
};

const dataNormalizeText: NodeAdapter = async ({ context }, _node, config) => {
  const raw = readContextPath(context, config.source || config.field || 'trigger.message') ?? config.value ?? '';
  const normalized = String(raw).trim().replace(/\s+/g, ' ').toLowerCase();
  context.data = { text: normalized };
  return { status: 'completed', output: { data: { text: normalized }, normalized: true } };
};

const dataFormatDate: NodeAdapter = async ({ context }, _node, config) => {
  const raw = readContextPath(context, config.source || config.field || 'trigger.date') ?? config.value ?? new Date().toISOString();
  const date = new Date(raw);
  const formatted = Number.isNaN(date.getTime())
    ? String(raw)
    : (config.format === 'date' ? date.toLocaleDateString() : config.format === 'time' ? date.toLocaleTimeString() : date.toISOString());
  context.data = { date: formatted };
  return { status: 'completed', output: { data: { date: formatted }, formatted: true } };
};

const dataSplitItems: NodeAdapter = async ({ context }, _node, config) => {
  const raw = readContextPath(context, config.source || config.field || 'trigger.items') ?? config.value ?? '';
  const delimiter = config.delimiter || '\n';
  const items = Array.isArray(raw)
    ? raw
    : String(raw)
      .split(delimiter)
      .map((value) => value.trim())
      .filter(Boolean);
  context.data = { items };
  return { status: 'completed', output: { data: { items }, split: true, count: items.length } };
};

const dataDedupe: NodeAdapter = async ({ context }, _node, config) => {
  const raw = asArray(readContextPath(context, config.source || config.field || 'trigger.items'));
  const seen = new Set<string>();
  const items = raw.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  context.data = { items };
  return { status: 'completed', output: { data: { items }, deduped: true, count: items.length } };
};

const dataMapFields: NodeAdapter = async ({ context }, _node, config) => {
  const base = makeBase(context, config);
  const mapping = parseMaybeJsonObject(config.mapping);
  const payload = base && typeof base === 'object' ? base : {};
  const mapped = Object.fromEntries(Object.entries(mapping).map(([targetKey, sourcePath]) => [targetKey, readContextPath(context, String(sourcePath)) ?? payload[String(sourcePath)] ?? null]));
  context.data = mapped;
  return { status: 'completed', output: { data: mapped, mapped: true } };
};

const dataPickFields: NodeAdapter = async ({ context }, _node, config) => {
  const base = makeBase(context, config);
  const fields = asArray(config.fields || config.field || config.keys).map((field: any) => String(field));
  const payload = base && typeof base === 'object' ? base : {};
  const picked = Object.fromEntries(fields.map((field: any) => [field, readContextPath(payload, field) ?? readContextPath(context, field)]));
  context.data = picked;
  return { status: 'completed', output: { data: picked, fields } };
};

const dataMergeObjects: NodeAdapter = async ({ context }, _node, config) => {
  const left = readContextPath(context, config.left || 'data') ?? {};
  const right = readContextPath(context, config.right || 'trigger') ?? {};
  const merged = {
    ...(left && typeof left === 'object' && !Array.isArray(left) ? left : {}),
    ...(right && typeof right === 'object' && !Array.isArray(right) ? right : {}),
  };
  context.data = merged;
  return { status: 'completed', output: { data: merged, merged: true } };
};

const dataValidateRequired: NodeAdapter = async ({ context }, _node, config) => {
  const base = makeBase(context, config);
  const fields = asArray(config.fields || config.required || config.field).map((field: any) => String(field));
  const payload = base && typeof base === 'object' ? base : context;
  const missing = fields.filter((field: any) => {
    const value = readContextPath(payload, field) ?? readContextPath(context, field);
    return value === undefined || value === null || String(value).trim() === '';
  });
  context.validation = { requiredFields: fields, missing };
  return {
    status: missing.length ? 'blocked' : 'completed',
    output: { valid: missing.length === 0, missing, fields },
    error: missing.length ? `Missing required fields: ${missing.join(', ')}` : null,
  } as any;
};

const dataCalculate: NodeAdapter = async ({ context }, _node, config) => {
  const left = Number(readContextPath(context, config.left || config.source || 'data.amount') ?? config.leftValue ?? 0);
  const right = Number(readContextPath(context, config.right || 'data.value') ?? config.rightValue ?? config.value ?? 0);
  const operation = String(config.operation || config.operator || '+');
  const result = operation === '-' ? left - right : operation === '*' ? left * right : operation === '/' ? (right === 0 ? 0 : left / right) : left + right;
  const target = String(config.target || 'calculated');
  context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: result };
  return { status: 'completed', output: { data: context.data, result, operation, target } };
};

const dataAggregate: NodeAdapter = async ({ context }, _node, config) => {
  const items = asArray(readContextPath(context, config.source || 'data.items'));
  const field = config.field ? String(config.field) : '';
  const operation = String(config.operation || 'list');
  const target = String(config.target || 'aggregated');
  const values = field
    ? items.map((item: any) => readContextPath(item, field) ?? (item && typeof item === 'object' ? item[field] : item))
    : items;
  let result: any;
  if (operation === 'sum') result = values.reduce((acc: number, v: any) => acc + (Number(v) || 0), 0);
  else if (operation === 'average') result = values.length ? values.reduce((acc: number, v: any) => acc + (Number(v) || 0), 0) / values.length : 0;
  else if (operation === 'min') result = values.length ? Math.min(...values.map((v: any) => Number(v) || 0)) : null;
  else if (operation === 'max') result = values.length ? Math.max(...values.map((v: any) => Number(v) || 0)) : null;
  else if (operation === 'count') result = values.length;
  else result = values; // 'list'
  context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: result };
  return { status: 'completed', output: { data: context.data, result, operation, count: values.length, target } };
};

const dataLimit: NodeAdapter = async ({ context }, _node, config) => {
  const items = asArray(readContextPath(context, config.source || 'data.items'));
  const limit = Math.max(0, Number(config.limit ?? config.max ?? 10) || 0);
  const mode = String(config.mode || 'first');
  const result = mode === 'last' ? items.slice(-limit) : items.slice(0, limit);
  const target = String(config.target || 'items');
  context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: result };
  return { status: 'completed', output: { data: context.data, count: result.length, originalCount: items.length, target } };
};

const dataSplitOut: NodeAdapter = async ({ context }, _node, config) => {
  const items = asArray(readContextPath(context, config.source || 'data.items'));
  const target = String(config.target || 'splitItems');
  context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: items, currentBatch: items };
  return { status: 'completed', output: { data: context.data, count: items.length, target } };
};

const dataAiTransform: NodeAdapter = async ({ context }, _node, config) => {
  const instruction = resolveTemplateValue(config.instruction || config.prompt || '', context);
  if (!instruction) return { status: 'failed', error: 'data.ai_transform: instruction is required' } as any;
  const geminiKey = appConfig.ai.geminiApiKey;
  if (!geminiKey) return { status: 'failed', error: 'data.ai_transform: GEMINI_API_KEY not configured' } as any;
  const sourceValue = readContextPath(context, config.source || 'data') ?? context.data ?? {};
  const target = String(config.target || 'transformed');
  const modelName = String(config.model || appConfig.ai.geminiModel || 'gemini-2.5-flash');
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const fullPrompt = `You are a JSON transformer. Apply the following instruction to the input and return ONLY the transformed JSON output (no commentary, no code fences).\n\nInstruction: ${instruction}\n\nInput JSON:\n${JSON.stringify(sourceValue)}`;
  const result = await withGeminiRetry(
    () => model.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2048 },
    }),
    { label: 'workflow.data.ai_transform' },
  );
  const text = result.response.text().trim();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* keep as text */ }
  context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: parsed };
  return { status: 'completed', output: { data: context.data, target, model: modelName } };
};

const dataHttpRequest: NodeAdapter = async ({ context }, _node, config) => {
  const url = resolveTemplateValue(config.url || config.endpoint || '', context);
  if (!url) return { status: 'failed', error: 'data.http_request: url is required' } as any;
  const method = String(config.method || 'GET').toUpperCase();
  const rawHeaders = parseMaybeJsonObject(config.headers);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...rawHeaders };
  const bodyTemplate = config.body || config.payload || '';
  const bodyStr = bodyTemplate ? resolveTemplateValue(bodyTemplate, context) : undefined;
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: bodyStr && method !== 'GET' && method !== 'HEAD' ? bodyStr : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const responseText = await response.text();
    let responseData: any = responseText;
    try { responseData = JSON.parse(responseText); } catch { /* keep as string */ }
    const target = config.target || config.output || 'httpResponse';
    context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: responseData };
    return {
      status: response.ok ? 'completed' : 'failed',
      output: { status: response.status, ok: response.ok, data: responseData, target },
      ...(response.ok ? {} : { error: `HTTP ${response.status} ${response.statusText}` }),
    } as any;
  } catch (fetchErr: any) {
    return { status: 'failed', error: `HTTP request failed: ${fetchErr?.message ?? String(fetchErr)}` } as any;
  }
};

export const dataAdapters: Record<string, NodeAdapter> = {
  'data.clean_context': dataCleanContext,
  'data.set_fields': dataSetFields,
  'data.rename_fields': dataRenameFields,
  'data.extract_json': dataExtractJson,
  'data.normalize_text': dataNormalizeText,
  'data.format_date': dataFormatDate,
  'data.split_items': dataSplitItems,
  'data.dedupe': dataDedupe,
  'data.map_fields': dataMapFields,
  'data.pick_fields': dataPickFields,
  'data.merge_objects': dataMergeObjects,
  'data.validate_required': dataValidateRequired,
  'data.calculate': dataCalculate,
  'data.aggregate': dataAggregate,
  'data.limit': dataLimit,
  'data.split_out': dataSplitOut,
  'data.ai_transform': dataAiTransform,
  'data.http_request': dataHttpRequest,
};
