/**
 * server/runtime/adapters/ai.ts
 *
 * Adapter handlers for `ai.*` and `agent.*` node keys.
 * Phase 3g of the workflow extraction (Turno 5b/D2). Byte-for-byte
 * transcription of the inline branches that previously lived in
 * `server/routes/workflows.ts`.
 *
 * Includes:
 *   - agent.classify / agent.sentiment / agent.summarize / agent.draft_reply
 *     (Gemini-powered with keyword fallback)
 *   - agent.run (delegates to runAgent dispatcher)
 *   - ai.generate_text (Gemini)
 *   - ai.gemini (explicit provider node)
 *   - ai.anthropic / ai.openai / ai.ollama (provider HTTP calls)
 *   - ai.information_extractor (structured Gemini extraction)
 *   - ai.guardrails (PII / toxicity / prompt injection / off-topic)
 *
 * Provider key resolution prefers connector auth_config (per-workspace)
 * → env / appConfig (global). For testability, services?.aiKeys.* takes
 * precedence over appConfig when caller injected services explicitly.
 */

import type { NodeAdapter } from '../workflowExecutor.js';
import {
  parseMaybeJsonObject,
  resolveTemplateValue,
} from '../nodeHelpers.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withGeminiRetry } from '../../ai/geminiRetry.js';
import { config as appConfig } from '../../config.js';
import { runAgent } from '../../agents/runner.js';
import { createIntegrationRepository } from '../../data/index.js';

const integrationRepository = createIntegrationRepository();

async function resolveAiProviderKey(
  scope: { tenantId: string },
  system: string,
  envFallback: string | undefined,
): Promise<string | null> {
  try {
    const allConnectors = await integrationRepository.listConnectors({ tenantId: scope.tenantId });
    const connector = allConnectors.find((c: any) => String(c.system || '').toLowerCase() === system);
    if (connector) {
      const auth = typeof connector.auth_config === 'object' && connector.auth_config
        ? connector.auth_config as Record<string, any>
        : {};
      const fromConnector = auth.api_key || auth.access_token || auth.secret_key || auth.token || auth.apiKey;
      if (fromConnector) return String(fromConnector);
    }
  } catch { /* ignore — fall through to env */ }
  return envFallback || null;
}

const agentLightweight: NodeAdapter = async ({ context }, node, config) => {
  const text = String(
    resolveTemplateValue(config.text || config.content || '', context) ||
    context.case?.summary || context.case?.description || context.trigger?.message || '',
  );
  const lower = text.toLowerCase();

  if (appConfig.ai.geminiApiKey && text.length > 3) {
    const genAI = new GoogleGenerativeAI(appConfig.ai.geminiApiKey);
    const { pickGeminiModel } = await import('../../ai/modelSelector.js');
    const model = genAI.getGenerativeModel({ model: pickGeminiModel('workflow_ai_node', appConfig.ai.geminiModel) });

    if (node.key === 'agent.classify') {
      const prompt = `You are a CRM classification engine. Analyze the customer text and return ONLY valid JSON (no markdown fences).

Text: """${text.slice(0, 1500)}"""

JSON schema:
{
  "intent": "refund|return|cancellation|shipping|billing|fraud|general_support",
  "riskLevel": "low|medium|high",
  "priority": "low|normal|high|critical",
  "confidence": <float 0-1>,
  "tags": [<string>, ...]
}`;
      const result = await withGeminiRetry(
        () => model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 300 } }),
        { label: 'workflow.agent.classify' },
      );
      const raw = result.response.text().trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
      const parsed = JSON.parse(raw);
      context.agent = { ...(context.agent ?? {}), ...parsed };
      return { status: 'completed', output: context.agent };
    }

    if (node.key === 'agent.sentiment') {
      const prompt = `You are a customer-sentiment analyzer for a CRM. Analyze the text and return ONLY valid JSON (no markdown fences).

Text: """${text.slice(0, 1500)}"""

JSON schema:
{
  "sentiment": "positive|neutral|negative",
  "frustrationScore": <int 0-10>,
  "urgencyScore": <int 0-10>,
  "confidence": <float 0-1>,
  "signals": [<string>, ...]
}`;
      const result = await withGeminiRetry(
        () => model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 300 } }),
        { label: 'workflow.agent.sentiment' },
      );
      const raw = result.response.text().trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
      const parsed = JSON.parse(raw);
      context.agent = { ...(context.agent ?? {}), ...parsed };
      return { status: 'completed', output: context.agent };
    }

    if (node.key === 'agent.summarize') {
      const maxLen = Number(config.maxLength || 300);
      const prompt = `Summarize the following customer-service text in ${maxLen} characters or fewer. Be concise and factual. Output plain text, no JSON.

Text: """${text.slice(0, 2000)}"""`;
      const result = await withGeminiRetry(
        () => model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 200 } }),
        { label: 'workflow.agent.summarize' },
      );
      const summary = result.response.text().trim();
      context.agent = { ...(context.agent ?? {}), summary };
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), summary };
      return { status: 'completed', output: { summary } };
    }

    // agent.draft_reply
    const tone = config.tone || 'professional and empathetic';
    const instructions = config.instructions ? `\nAdditional instructions: ${config.instructions}` : '';
    const prompt = `You are a customer-support agent. Draft a reply to the following customer message.
Tone: ${tone}${instructions}

Customer message: """${text.slice(0, 1500)}"""

Write ONLY the reply text, no subject line, no JSON.`;
    const result = await withGeminiRetry(
      () => model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 512 } }),
      { label: 'workflow.agent.draft_reply' },
    );
    const draftReply = result.response.text().trim();
    context.agent = { ...(context.agent ?? {}), draftReply };
    return { status: 'completed', output: { draftReply } };
  }

  // Keyword fallback (no Gemini key)
  if (node.key === 'agent.classify') {
    const intent = config.intent || (lower.includes('refund') ? 'refund' : lower.includes('return') ? 'return' : lower.includes('cancel') ? 'cancellation' : 'support');
    const riskLevel = config.risk_level || (lower.includes('fraud') || lower.includes('chargeback') ? 'high' : lower.includes('angry') ? 'medium' : 'low');
    context.agent = { ...(context.agent ?? {}), intent, riskLevel, confidence: 0.55 };
    return { status: 'completed', output: context.agent };
  }
  if (node.key === 'agent.sentiment') {
    const sentiment = lower.includes('angry') || lower.includes('bad') || lower.includes('damaged') ? 'negative' : lower.includes('thanks') || lower.includes('great') ? 'positive' : 'neutral';
    context.agent = { ...(context.agent ?? {}), sentiment, confidence: 0.55 };
    return { status: 'completed', output: context.agent };
  }
  if (node.key === 'agent.summarize') {
    const summary = config.summary || text.slice(0, 240) || `Case ${context.case?.case_number ?? context.case?.id ?? 'context'} summarized by workflow.`;
    context.agent = { ...(context.agent ?? {}), summary };
    context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), summary };
    return { status: 'completed', output: { summary } };
  }
  const draft = config.content || config.template || `Thanks for reaching out. We have reviewed your case and will follow the next approved step.`;
  context.agent = { ...(context.agent ?? {}), draftReply: resolveTemplateValue(draft, context) };
  return { status: 'completed', output: { draftReply: context.agent.draftReply } };
};

const agentRun: NodeAdapter = async ({ scope, context }, node, config) => {
  const caseId = config.case_id || config.caseId || context.case?.id;
  const agentSlug = config.agent || config.agentSlug || 'triage-agent';
  if (!caseId) return { status: 'failed', error: 'agent.run requires case context' } as any;
  const result = await runAgent({
    agentSlug,
    caseId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    triggerEvent: config.trigger_event || config.triggerEvent || 'workflow_node',
    traceId: `workflow:${node.id}:${Date.now()}`,
    extraContext: {
      workflowNodeId: node.id,
      workflowNodeLabel: node.label,
      workflowTrigger: context.trigger,
    },
  });
  context.agent = {
    slug: agentSlug,
    success: result.success,
    confidence: result.confidence ?? null,
    summary: result.summary ?? result.error ?? null,
    output: result.output ?? {},
  };
  return {
    status: result.success ? 'completed' : 'failed',
    output: context.agent,
    error: result.success ? null : result.error ?? 'Agent execution failed',
  } as any;
};

const aiGenerateText: NodeAdapter = async ({ context, services }, _node, config) => {
  const prompt = resolveTemplateValue(config.prompt || config.content || config.input || '', context);
  if (!prompt) return { status: 'failed', error: 'ai.generate_text: prompt is required' } as any;
  const geminiKey = services?.aiKeys?.gemini ?? (services ? undefined : appConfig.ai.geminiApiKey);
  if (!geminiKey) {
    return {
      status: 'blocked',
      error: { code: 'TRANSPORT_NOT_CONFIGURED', message: 'Configura una API key para el proveedor de IA antes de usar este nodo.' },
    };
  }
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: appConfig.ai.geminiModel || 'gemini-2.5-pro' });
  const systemInstruction = resolveTemplateValue(config.system || config.systemPrompt || '', context);
  const fullPrompt = systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt;
  const maxTokens = Number(config.maxTokens || config.max_tokens || 512);
  const result = await withGeminiRetry(
    () => model.generateContent({ contents: [{ role: 'user', parts: [{ text: fullPrompt }] }], generationConfig: { maxOutputTokens: maxTokens } }),
    { label: 'workflow.ai.generate_text' },
  );
  const text = result.response.text().trim();
  const target = config.target || config.output || 'generatedText';
  context.agent = { ...(context.agent ?? {}), [target]: text };
  context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: text };
  return { status: 'completed', output: { text, target, length: text.length } };
};

const aiInformationExtractor: NodeAdapter = async ({ context }, _node, config) => {
  const text = resolveTemplateValue(config.text || '', context);
  if (!text) return { status: 'failed', error: 'ai.information_extractor: text is required' } as any;
  const schemaRaw = config.schema || '';
  const schema = parseMaybeJsonObject(schemaRaw);
  if (Object.keys(schema).length === 0) return { status: 'failed', error: 'ai.information_extractor: a JSON schema is required' } as any;
  const geminiKey = appConfig.ai.geminiApiKey;
  if (!geminiKey) return { status: 'failed', error: 'ai.information_extractor: GEMINI_API_KEY not configured' } as any;
  const target = String(config.target || 'extracted');
  const modelName = String(config.model || appConfig.ai.geminiModel || 'gemini-2.5-flash');
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const prompt = `Extract structured information from the following text and return ONLY a JSON object that matches this schema:\n\nSchema: ${JSON.stringify(schema)}\n\nText:\n${text}\n\nReturn valid JSON only.`;
  const result = await withGeminiRetry(
    () => model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1024 },
    }),
    { label: 'workflow.ai.information_extractor' },
  );
  const raw = result.response.text().trim();
  let extracted: any = {};
  try { extracted = JSON.parse(raw); } catch { extracted = { _raw: raw, _error: 'Model did not return valid JSON' }; }
  context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: extracted };
  return { status: 'completed', output: { data: context.data, target, model: modelName } };
};

const aiAnthropic: NodeAdapter = async ({ scope, context, services }, _node, config) => {
  const fetchImpl = services?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const apiKey = await resolveAiProviderKey(scope, 'anthropic', appConfig.ai.anthropicApiKey);
  if (!apiKey) {
    return { status: 'failed', error: 'ai.anthropic: API key not configured. Go to Integrations → Connect Anthropic Claude and enter your API key.' } as any;
  }
  const operation = String(config.operation || 'message');
  const prompt = resolveTemplateValue(config.prompt || config.content || config.input || '', context);
  if (!prompt) return { status: 'failed', error: 'ai.anthropic: prompt is required' } as any;
  const model = String(config.model || 'claude-3-5-sonnet-latest');
  const systemInstruction = resolveTemplateValue(config.systemInstruction || '', context);
  const maxTokens = Math.max(1, Number(config.maxTokens || 1024));
  const temperature = config.temperature !== undefined && config.temperature !== '' ? Number(config.temperature) : undefined;
  const target = String(config.target || 'anthropicResult');

  try {
    const body: any = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    };
    if (systemInstruction) body.system = systemInstruction;
    if (temperature !== undefined && Number.isFinite(temperature)) body.temperature = temperature;
    const resp = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { status: 'failed', error: `ai.anthropic: ${resp.status} ${json?.error?.message ?? resp.statusText}` } as any;
    }
    const text = Array.isArray(json.content)
      ? json.content.map((c: any) => c.text || '').join('').trim()
      : String(json.content ?? '');
    context.agent = { ...(context.agent ?? {}), [target]: text };
    context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: text };
    return { status: 'completed', output: { text, target, model, operation, length: text.length } };
  } catch (err: any) {
    return { status: 'failed', error: `ai.anthropic call failed: ${err?.message ?? String(err)}` } as any;
  }
};

const aiOpenai: NodeAdapter = async ({ scope, context, services }, _node, config) => {
  const fetchImpl = services?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const apiKey = await resolveAiProviderKey(scope, 'openai', appConfig.ai.openaiApiKey);
  if (!apiKey) {
    return { status: 'failed', error: 'ai.openai: API key not configured. Go to Integrations → Connect OpenAI and enter your API key.' } as any;
  }
  const operation = String(config.operation || 'chat');
  const prompt = resolveTemplateValue(config.prompt || config.content || config.input || '', context);
  if (!prompt) return { status: 'failed', error: 'ai.openai: prompt is required' } as any;
  const model = String(config.model || 'gpt-4o-mini');
  const systemInstruction = resolveTemplateValue(config.systemInstruction || '', context);
  const maxTokens = Math.max(1, Number(config.maxTokens || 1024));
  const temperature = config.temperature !== undefined && config.temperature !== '' ? Number(config.temperature) : undefined;
  const target = String(config.target || 'openaiResult');

  try {
    let endpoint = 'https://api.openai.com/v1/chat/completions';
    let body: any;
    if (operation === 'embeddings') {
      endpoint = 'https://api.openai.com/v1/embeddings';
      body = { model, input: prompt };
    } else {
      const messages: any[] = [];
      if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
      messages.push({ role: 'user', content: prompt });
      body = { model, messages, max_tokens: maxTokens };
      if (temperature !== undefined && Number.isFinite(temperature)) body.temperature = temperature;
    }
    const resp = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { status: 'failed', error: `ai.openai: ${resp.status} ${json?.error?.message ?? resp.statusText}` } as any;
    }
    let result: any;
    if (operation === 'embeddings') {
      result = json?.data?.[0]?.embedding ?? [];
    } else {
      result = String(json?.choices?.[0]?.message?.content ?? '').trim();
    }
    context.agent = { ...(context.agent ?? {}), [target]: result };
    context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: result };
    return { status: 'completed', output: { result, target, model, operation } };
  } catch (err: any) {
    return { status: 'failed', error: `ai.openai call failed: ${err?.message ?? String(err)}` } as any;
  }
};

const aiOllama: NodeAdapter = async ({ scope, context, services }, _node, config) => {
  const fetchImpl = services?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  let baseUrl = appConfig.ai.ollamaBaseUrl;
  try {
    const allConnectors = await integrationRepository.listConnectors({ tenantId: scope.tenantId });
    const ollamaConnector = allConnectors.find((c: any) => String(c.system || '').toLowerCase() === 'ollama');
    if (ollamaConnector) {
      const auth = typeof ollamaConnector.auth_config === 'object' && ollamaConnector.auth_config
        ? ollamaConnector.auth_config as Record<string, any>
        : {};
      if (auth.base_url) baseUrl = String(auth.base_url);
    }
  } catch { /* ignore */ }
  if (!baseUrl) {
    return { status: 'failed', error: 'ai.ollama: base URL not configured. Go to Integrations → Connect Ollama and enter your Ollama server URL.' } as any;
  }
  const prompt = resolveTemplateValue(config.prompt || '', context);
  const model = String(config.model || '');
  if (!prompt) return { status: 'failed', error: 'ai.ollama: prompt is required' } as any;
  if (!model) return { status: 'failed', error: 'ai.ollama: model is required (must be installed on the Ollama server)' } as any;
  const systemInstruction = resolveTemplateValue(config.systemInstruction || '', context);
  const temperature = config.temperature !== undefined && config.temperature !== '' ? Number(config.temperature) : undefined;
  const target = String(config.target || 'ollamaResult');

  try {
    const body: any = { model, prompt, stream: false };
    if (systemInstruction) body.system = systemInstruction;
    if (temperature !== undefined && Number.isFinite(temperature)) body.options = { temperature };
    const resp = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { status: 'failed', error: `ai.ollama: ${resp.status} ${json?.error ?? resp.statusText}` } as any;
    }
    const text = String(json?.response ?? '').trim();
    context.agent = { ...(context.agent ?? {}), [target]: text };
    context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: text };
    return { status: 'completed', output: { text, target, model } };
  } catch (err: any) {
    return { status: 'failed', error: `ai.ollama call failed: ${err?.message ?? String(err)}` } as any;
  }
};

const aiGuardrails: NodeAdapter = async ({ context }, _node, config) => {
  const text = resolveTemplateValue(config.text || '', context);
  if (!text) return { status: 'failed', error: 'ai.guardrails: text is required' } as any;
  const mode = String(config.mode || 'input');
  const checks = String(config.checks || 'pii,toxicity,prompt_injection')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const topic = config.topic ? resolveTemplateValue(String(config.topic), context) : '';
  const target = String(config.target || 'guardResult');

  const issues: Array<{ check: string; matched: boolean; detail?: string }> = [];
  if (checks.includes('pii')) {
    const piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/,
      /\b(?:\d[ -]*?){13,16}\b/,
      /\b[\w.-]+@[\w.-]+\.[a-z]{2,}\b/i,
    ];
    const matched = piiPatterns.some((p) => p.test(text));
    issues.push({ check: 'pii', matched });
  }
  if (checks.includes('prompt_injection') || checks.includes('jailbreak')) {
    const injectionPatterns = [
      /ignore (?:all|previous) instructions/i,
      /system prompt/i,
      /you are now/i,
      /developer mode/i,
      /jailbreak/i,
      /pretend (?:you are|to be)/i,
    ];
    const matched = injectionPatterns.some((p) => p.test(text));
    issues.push({ check: 'prompt_injection', matched });
  }
  if (checks.includes('toxicity')) {
    const toxicWords = /(\bhate\b|\bkill\b|\bfucking?\b|\bidiot\b|\bstupid\b)/i;
    issues.push({ check: 'toxicity', matched: toxicWords.test(text) });
  }
  if (checks.includes('off_topic') && topic && appConfig.ai.geminiApiKey) {
    try {
      const genAI = new GoogleGenerativeAI(appConfig.ai.geminiApiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const judgePrompt = `Is the following text relevant to the topic "${topic}"? Answer with a single word: YES or NO.\n\nText: ${text}`;
      const result = await withGeminiRetry(
        () => model.generateContent({ contents: [{ role: 'user', parts: [{ text: judgePrompt }] }], generationConfig: { maxOutputTokens: 8 } }),
        { label: 'workflow.ai.guardrails.off_topic' },
      );
      const verdict = result.response.text().trim().toUpperCase();
      issues.push({ check: 'off_topic', matched: verdict.startsWith('NO'), detail: `topic=${topic}, verdict=${verdict}` });
    } catch (err: any) {
      issues.push({ check: 'off_topic', matched: false, detail: `judge failed: ${err?.message ?? String(err)}` });
    }
  }

  const flagged = issues.filter((i) => i.matched);
  const safe = flagged.length === 0;
  const guardResult = { safe, mode, issues, flagged: flagged.map((f) => f.check) };
  context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: guardResult };
  return {
    status: safe ? 'completed' : 'blocked',
    output: { ...guardResult, target },
    error: safe ? null : `Guardrails blocked: ${flagged.map((f) => f.check).join(', ')}`,
  } as any;
};

const aiGemini: NodeAdapter = async ({ context }, _node, config) => {
  const prompt = resolveTemplateValue(config.prompt || config.content || config.input || '', context);
  if (!prompt) return { status: 'failed', error: 'ai.gemini: prompt is required' } as any;
  const geminiKey = appConfig.ai.geminiApiKey;
  if (!geminiKey) {
    return { status: 'failed', error: 'ai.gemini: GEMINI_API_KEY not configured. Add it under Integrations → AI providers.' } as any;
  }
  const operation = String(config.operation || 'generate_text');
  const systemInstruction = resolveTemplateValue(config.systemInstruction || config.system || '', context);
  const modelName = String(config.model || appConfig.ai.geminiModel || 'gemini-2.5-pro');
  const temperature = config.temperature !== undefined && config.temperature !== '' ? Number(config.temperature) : undefined;
  const maxTokens = Number(config.maxTokens || config.max_tokens || 1024);
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    ...(systemInstruction ? { systemInstruction } : {}),
  });
  const generationConfig: any = { maxOutputTokens: maxTokens };
  if (temperature !== undefined && Number.isFinite(temperature)) generationConfig.temperature = temperature;
  if (operation === 'extract_structured') {
    generationConfig.responseMimeType = 'application/json';
  }
  const result = await withGeminiRetry(
    () => model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }),
    { label: `workflow.ai.gemini.${operation}` },
  );
  const text = result.response.text().trim();
  let parsed: any = text;
  if (operation === 'extract_structured') {
    try { parsed = JSON.parse(text); } catch { /* keep as text */ }
  }
  const target = String(config.target || 'geminiResult');
  context.agent = { ...(context.agent ?? {}), [target]: parsed };
  context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: parsed };
  return { status: 'completed', output: { result: parsed, model: modelName, operation, target, length: text.length } };
};

export const aiAdapters: Record<string, NodeAdapter> = {
  'agent.classify': agentLightweight,
  'agent.sentiment': agentLightweight,
  'agent.summarize': agentLightweight,
  'agent.draft_reply': agentLightweight,
  'agent.run': agentRun,
  'ai.generate_text': aiGenerateText,
  'ai.gemini': aiGemini,
  'ai.anthropic': aiAnthropic,
  'ai.openai': aiOpenai,
  'ai.ollama': aiOllama,
  'ai.information_extractor': aiInformationExtractor,
  'ai.guardrails': aiGuardrails,
};
