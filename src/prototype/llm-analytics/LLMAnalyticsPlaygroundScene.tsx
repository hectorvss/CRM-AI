// ── LLMAnalyticsPlaygroundScene ──────────────────────────────────────────────
// 1:1 structural parity with PostHog's products/llm_analytics/frontend/playground.
//
// Layout:
//   Header: Title · BETA · Quick start · Save menu · Compare toggle · Run/Stop
//   Body:
//     ┌──────────────────────────────────────────────────┐
//     │ Model selector · Settings dropdown · Provider key │
//     ├──────────────────────────────────────────────────┤
//     │ [System]   prompt textarea                        │
//     │ [Messages] user/assistant turns · Add message     │
//     │ [Tools]    button → modal (OpenAI fn-calling)     │
//     ├──────────────────────────────────────────────────┤
//     │ [Result]   streamed output panel(s)               │
//     └──────────────────────────────────────────────────┘
//
// Endpoints used (all via src/api/posthog.ts):
//   POST /api/projects/{pid}/llm_proxy/completion/   (SSE streaming)
//   GET  /api/projects/{pid}/llm_proxy/models/
//   *    /api/projects/{pid}/llm_prompts/...
//   *    /api/projects/{pid}/llm_provider_keys/...
//   GET  /api/environments/{tid}/llm_analytics/evaluation_config/
//
// All events fired match PostHog exactly:
//   llma playground prompt submitted / aborted / completed
//   llma playground rate limited / subscription required
//   llma playground reset
//   llma playground prompt config added / removed
//   llma playground message added / removed
//   llma playground tools configured
//   llma playground opened from source / source unlinked

import React from 'react'
import * as ph from '../../api/posthog'
import { ModelPicker, FALLBACK_MODELS, type Provider } from './ModelPicker'
import { ToolsModal } from './ToolsModal'
import { SettingsDropdown, DEFAULT_SETTINGS, type PlaygroundSettings } from './SettingsDropdown'
import { PlaygroundSaveMenu, type PromptConfig } from './PlaygroundSaveMenu'
import { ProviderKeysManager } from './ProviderKeysManager'

type MessageRole = 'user' | 'assistant'

interface Message {
  id:      string
  role:    MessageRole
  content: string
}

interface ResultState {
  id:        string
  modelId:   string
  provider:  Provider
  status:    'idle' | 'running' | 'done' | 'error' | 'aborted'
  output:    string
  error?:    string
  tokens_in?: number
  tokens_out?: number
  cost?:     number
  latency?:  number
  startedAt?: number
}

// ── Templates (Clain extension, not in PostHog) ───────────────────────────────
const PROMPT_TEMPLATES = [
  { id: 'summarize', name: 'Resumir texto',       description: 'Resume un texto largo en 3 puntos clave.',                  system: 'Eres un asistente que resume textos de forma concisa.', user: 'Resume este texto en 3 puntos clave:\n\n{{texto}}' },
  { id: 'classify',  name: 'Clasificar feedback', description: 'Clasifica feedback como positivo/negativo/neutro.',          system: 'Eres un experto en análisis de sentimiento.',           user: 'Clasifica este feedback como positivo, negativo o neutro y explica por qué:\n\n{{feedback}}' },
  { id: 'translate', name: 'Traducir',            description: 'Traduce texto a otro idioma.',                                system: 'Eres un traductor profesional.',                         user: 'Traduce a {{idioma}}:\n\n{{texto}}' },
  { id: 'extract',   name: 'Extraer datos JSON',  description: 'Extrae información estructurada como JSON.',                  system: 'Devuelves solo JSON válido sin explicaciones.',          user: 'Extrae nombre, email y teléfono de este texto como JSON:\n\n{{texto}}' },
  { id: 'code',      name: 'Revisar código',      description: 'Revisa código y sugiere mejoras.',                            system: 'Eres un senior software engineer experto en revisiones de código.', user: 'Revisa este código y sugiere mejoras concretas:\n\n```\n{{codigo}}\n```' },
  { id: 'email',     name: 'Borrador de email',   description: 'Redacta un email profesional.',                                system: 'Escribes emails profesionales en español, claros y concisos.', user: 'Redacta un email a {{destinatario}} sobre:\n\n{{tema}}' },
]

function newId(): string { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36) }
function estimateTokens(s: string): number { return Math.ceil((s ?? '').length / 4) }
function pgFormatCost(usd: number): string { return usd < 0.0001 ? '<$0.0001' : usd < 1 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}` }
function extractVars(t: string): string[] { const out = new Set<string>(); const re = /\{\{\s*(\w+)\s*\}\}/g; let m; while ((m = re.exec(t ?? '')) != null) out.add(m[1]); return Array.from(out) }
function substituteVars(t: string, vars: Record<string, string>): string { return (t ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, n) => vars[n] ?? `{{${n}}}`) }

function trackPlayground(event: string, props?: any) {
  // Mirrors PostHog `llma playground *` event names exactly. Best-effort —
  // event-capture endpoint may not accept POST writes in some configs.
  try {
    const tid = ph.getTeamId()
    if (!tid) return
    ph.phPost(`/api/environments/${tid}/events/`, {
      event,
      distinct_id: ph.getCurrentUser()?.uuid ?? 'playground',
      properties: { ...(props ?? {}), $ai_source: 'playground' },
    }).catch(() => { /* silent */ })
  } catch { /* silent */ }
}

// ── Scene ────────────────────────────────────────────────────────────────────

export function LLMAnalyticsPlaygroundScene() {
  // Prompt config
  const [systemPrompt, setSystemPrompt] = React.useState('You are a helpful AI assistant.')
  const [messages, setMessages] = React.useState<Message[]>([
    { id: newId(), role: 'user', content: '' },
  ])
  const [model, setModel] = React.useState('gpt-5-mini')
  const [provider, setProvider] = React.useState<Provider>('openai')
  const [settings, setSettings] = React.useState<PlaygroundSettings>(DEFAULT_SETTINGS)
  const [tools, setTools] = React.useState<any>(null)
  const [providerKeyId, setProviderKeyId] = React.useState<string | null>(null)

  // Variable substitution (Clain extension)
  const [variables, setVariables] = React.useState<Record<string, string>>({})

  // Source linking
  const [sourceType, setSourceType] = React.useState<'prompt' | 'evaluation' | null>(null)
  const [sourcePromptName, setSourcePromptName] = React.useState<string | undefined>()
  const [sourcePromptVersion, setSourcePromptVersion] = React.useState<string | number | undefined>()
  const [sourceEvaluationId, setSourceEvaluationId] = React.useState<string | number | undefined>()
  const [sourceEvaluationName, setSourceEvaluationName] = React.useState<string | undefined>()
  const [promptId, setPromptId] = React.useState<string | undefined>()

  // UI state
  const [showTools, setShowTools] = React.useState(false)
  const [showTemplates, setShowTemplates] = React.useState(false)
  const [showKeysManager, setShowKeysManager] = React.useState(false)
  const [showQuickStart, setShowQuickStart] = React.useState(false)
  const [compareMode, setCompareMode] = React.useState(false)
  const [extraModels, setExtraModels] = React.useState<string[]>([])

  // Results
  const [results, setResults] = React.useState<Record<string, ResultState>>({})
  const abortersRef = React.useRef<Map<string, AbortController>>(new Map())

  // ── Bootstrap PostHog session ──────────────────────────────────────────────
  React.useEffect(() => {
    (async () => {
      try { if (!ph.getTeamId()) await ph.bootstrapPostHog() } catch { /* ignore */ }
    })()
  }, [])

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeModels = compareMode ? [model, ...extraModels] : [model]
  const detectedVars = React.useMemo(() => {
    const all = new Set<string>()
    extractVars(systemPrompt).forEach(v => all.add(v))
    messages.forEach(m => extractVars(m.content).forEach(v => all.add(v)))
    return Array.from(all)
  }, [systemPrompt, messages])

  const finalSystem  = substituteVars(systemPrompt, variables)
  const finalMessages = messages
    .filter(m => m.content.trim())
    .map(m => ({ role: m.role, content: substituteVars(m.content, variables) }))

  const resultList: ResultState[] = Object.values(results)
  const canRun = finalMessages.length > 0 && !resultList.some(r => r.status === 'running')
  const isRunning = resultList.some(r => r.status === 'running')

  // ── Message ops ────────────────────────────────────────────────────────────
  function addMessage() {
    const last = messages[messages.length - 1]
    const nextRole: MessageRole = last?.role === 'user' ? 'assistant' : 'user'
    setMessages(prev => [...prev, { id: newId(), role: nextRole, content: '' }])
    trackPlayground('llma playground message added', { role: nextRole, count: messages.length + 1 })
  }
  function removeMessage(id: string) {
    if (messages.length === 1) return
    setMessages(prev => prev.filter(m => m.id !== id))
    trackPlayground('llma playground message removed', { count: messages.length - 1 })
  }
  function updateMessage(id: string, patch: Partial<Message>) {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
  }
  function toggleRole(id: string) {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, role: m.role === 'user' ? 'assistant' : 'user' } : m))
  }

  // ── Run / Stop ─────────────────────────────────────────────────────────────
  async function run() {
    // Reset prior results for this submission
    const newResults: Record<string, ResultState> = {}
    for (const m of activeModels) {
      const meta = FALLBACK_MODELS.find(x => x.id === m)
      newResults[m] = {
        id: m,
        modelId: m,
        provider: meta?.provider ?? provider,
        status: 'running',
        output: '',
        startedAt: performance.now(),
      }
    }
    setResults(newResults)

    trackPlayground('llma playground prompt submitted', {
      model,
      provider,
      compare: compareMode,
      compareCount: activeModels.length,
      hasTools: !!tools,
      hasSystem: !!finalSystem.trim(),
      messageCount: finalMessages.length,
      thinking: settings.thinking,
      sourceType,
    })

    await Promise.all(activeModels.map(modelId => runOne(modelId)))
  }

  async function runOne(modelId: string) {
    const meta = FALLBACK_MODELS.find(x => x.id === modelId)
    const modelProvider: Provider = meta?.provider ?? provider
    const ac = new AbortController()
    abortersRef.current.set(modelId, ac)

    let output = ''
    let tokens_in: number | undefined
    let tokens_out: number | undefined
    let cost: number | undefined
    const t0 = performance.now()

    try {
      await ph.posthog.llmProxy.completion(
        {
          system: finalSystem || undefined,
          messages: finalMessages,
          model: modelId,
          provider: modelProvider,
          temperature: settings.temperature,
          top_p: settings.top_p,
          max_tokens: settings.max_tokens,
          seed: settings.seed,
          thinking: settings.thinking,
          reasoning_level: settings.reasoning_level,
          tools: tools ?? undefined,
          provider_key_id: providerKeyId ?? undefined,
        },
        (event) => {
          // PostHog emits multiple SSE event shapes — handle the common ones:
          const d = event.data
          if (typeof d === 'string') {
            output += d
          } else if (d?.delta?.content) {
            output += d.delta.content
          } else if (d?.choices?.[0]?.delta?.content) {
            output += d.choices[0].delta.content
          } else if (d?.choices?.[0]?.message?.content && !output) {
            output = d.choices[0].message.content
          } else if (typeof d?.content === 'string') {
            output += d.content
          } else if (d?.text) {
            output += d.text
          }
          // Usage often arrives in final event
          if (d?.usage) {
            tokens_in  = d.usage.prompt_tokens ?? d.usage.input_tokens
            tokens_out = d.usage.completion_tokens ?? d.usage.output_tokens
            cost = d.usage.cost ?? d.usage.total_cost_usd
          }
          setResults(prev => ({ ...prev, [modelId]: { ...prev[modelId], output, status: 'running' } }))
        },
        ac.signal,
      )

      const latency = (performance.now() - t0) / 1000
      tokens_in  ??= estimateTokens(finalSystem + finalMessages.map(m => m.content).join('\n'))
      tokens_out ??= estimateTokens(output)

      setResults(prev => ({
        ...prev,
        [modelId]: { ...prev[modelId], status: 'done', output, tokens_in, tokens_out, cost, latency },
      }))

      trackPlayground('llma playground prompt completed', {
        model: modelId, provider: modelProvider, latency_s: latency, tokens_in, tokens_out, cost,
      })
    } catch (e: any) {
      const latency = (performance.now() - t0) / 1000
      const aborted = e?.name === 'AbortError' || ac.signal.aborted
      if (aborted) {
        setResults(prev => ({ ...prev, [modelId]: { ...prev[modelId], status: 'aborted', output: output + '\n\nGeneration stopped.', latency } }))
        trackPlayground('llma playground prompt aborted', { model: modelId, latency_s: latency })
      } else {
        const status = e?.status
        const msg = e?.message ?? 'Unknown error'
        setResults(prev => ({ ...prev, [modelId]: { ...prev[modelId], status: 'error', error: msg, latency } }))
        if (status === 429) {
          trackPlayground('llma playground rate limited', { model: modelId })
        } else if (status === 402 || /subscription/i.test(msg)) {
          trackPlayground('llma playground subscription required', { model: modelId })
        } else {
          trackPlayground('llma playground prompt completed', { model: modelId, error: true, error_message: msg })
        }
      }
    } finally {
      abortersRef.current.delete(modelId)
    }
  }

  function stop() {
    abortersRef.current.forEach(ac => ac.abort())
    abortersRef.current.clear()
  }

  function reset() {
    setSystemPrompt('You are a helpful AI assistant.')
    setMessages([{ id: newId(), role: 'user', content: '' }])
    setTools(null)
    setSettings(DEFAULT_SETTINGS)
    setResults({})
    setVariables({})
    setSourceType(null)
    setSourcePromptName(undefined)
    setSourcePromptVersion(undefined)
    setSourceEvaluationId(undefined)
    setSourceEvaluationName(undefined)
    setPromptId(undefined)
    trackPlayground('llma playground reset')
  }

  function applyTemplate(t: typeof PROMPT_TEMPLATES[number]) {
    setSystemPrompt(t.system)
    setMessages([{ id: newId(), role: 'user', content: t.user }])
    setVariables({})
    setShowTemplates(false)
    trackPlayground('llma playground opened from source', { source: 'template', templateId: t.id })
  }

  // ── Save menu wiring ──────────────────────────────────────────────────────
  const currentConfig: PromptConfig = {
    id: promptId,
    systemPrompt,
    messages: finalMessages,
    model,
    provider,
    settings,
    tools,
    selectedProviderKeyId: providerKeyId ?? null,
    sourceType,
    sourcePromptName,
    sourcePromptVersion,
    sourceEvaluationId,
    sourceEvaluationName,
  }

  function applySource(next: Partial<PromptConfig>) {
    if (next.id !== undefined) setPromptId(next.id)
    if (next.systemPrompt !== undefined) setSystemPrompt(next.systemPrompt)
    if (next.messages !== undefined) setMessages(next.messages.map(m => ({ id: newId(), role: m.role, content: m.content })))
    if (next.model !== undefined) setModel(next.model)
    if (next.provider !== undefined) setProvider(next.provider as Provider)
    if (next.settings !== undefined) setSettings({ ...DEFAULT_SETTINGS, ...next.settings })
    if (next.tools !== undefined) setTools(next.tools)
    if (next.sourceType !== undefined) setSourceType(next.sourceType)
    if (next.sourcePromptName !== undefined) setSourcePromptName(next.sourcePromptName)
    if (next.sourcePromptVersion !== undefined) setSourcePromptVersion(next.sourcePromptVersion)
    if (next.sourceEvaluationId !== undefined) setSourceEvaluationId(next.sourceEvaluationId)
    if (next.sourceEvaluationName !== undefined) setSourceEvaluationName(next.sourceEvaluationName)
  }

  function unlinkSource() {
    setSourceType(null)
    setSourcePromptName(undefined)
    setSourcePromptVersion(undefined)
    setSourceEvaluationId(undefined)
    setSourceEvaluationName(undefined)
    setPromptId(undefined)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-[#f9f9f7] min-h-0 overflow-hidden">
      {/* Header */}
      <div className="bg-white px-6 pt-4 pb-3 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <svg viewBox="0 0 16 16" className="w-4 h-4 text-[#a855f7]"><path d="M4 3l9 5-9 5z" fill="currentColor"/></svg>
              <h1 className="text-lg font-bold text-[#1a1a18]">Playground</h1>
              <span className="text-[10px] bg-[#fef3c7] text-[#92400e] px-2 py-0.5 rounded font-semibold">BETA</span>
              {sourceType === 'prompt' && sourcePromptName && (
                <span className="text-[10px] bg-[#fff5f2] text-[#e8572a] px-2 py-0.5 rounded font-mono flex items-center gap-1">
                  <svg viewBox="0 0 16 16" className="w-2.5 h-2.5"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {sourcePromptName} v{String(sourcePromptVersion ?? '?')}
                </span>
              )}
              {sourceType === 'evaluation' && sourceEvaluationName && (
                <span className="text-[10px] bg-[#f5f3ff] text-[#7c3aed] px-2 py-0.5 rounded font-mono flex items-center gap-1">
                  eval · {sourceEvaluationName}
                </span>
              )}
            </div>
            <p className="text-xs text-[#646462]">Test and experiment with LLM prompts in a sandbox environment.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setShowQuickStart(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e9eae6] rounded-lg text-xs text-[#1a1a18] hover:bg-[#fafaf9]">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-[#e8572a]"><path d="M8 1l1.8 5h5L10.6 9.5l1.8 5.5L8 11.5 3.6 15l1.8-5.5L1.2 6h5z" fill="currentColor"/></svg>
              Quick start
              <span className="text-[9px] bg-[#fff5f2] text-[#e8572a] px-1 py-0.5 rounded font-semibold">$</span>
            </button>
            <PlaygroundSaveMenu
              config={currentConfig}
              onLink={applySource}
              onUnlink={unlinkSource}
              onSavedCurrent={() => { /* could toast */ }}
              onTrack={trackPlayground}
            />
            <button onClick={() => setShowTemplates(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e9eae6] rounded-lg text-xs text-[#1a1a18] hover:bg-[#fafaf9]">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M3 1h7l3 3v11H3z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round"/></svg>
              Templates
            </button>
            <button onClick={() => setShowKeysManager(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e9eae6] rounded-lg text-xs text-[#1a1a18] hover:bg-[#fafaf9]">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><circle cx="5" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M7 8l6-6 1 1-2 2 1 1-2 2 1 1-1 1" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round"/></svg>
              API keys
            </button>
            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e9eae6] rounded-lg text-xs text-[#1a1a18] hover:bg-[#fafaf9] cursor-pointer">
              <input type="checkbox" checked={compareMode} onChange={e => setCompareMode(e.target.checked)} className="accent-[#e8572a]" />
              Compare
            </label>
            <button onClick={reset} className="px-3 py-1.5 text-xs text-[#646462] hover:text-[#1a1a18]">Reset</button>
            <button
              onClick={isRunning ? stop : run}
              disabled={!isRunning && !canRun}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg font-semibold ${isRunning ? 'bg-[#dc2626] text-white hover:bg-[#b91c1c]' : 'bg-[#e8572a] text-white hover:bg-[#d44a1f] disabled:opacity-50'}`}
            >
              {isRunning ? (
                <>
                  <svg viewBox="0 0 16 16" className="w-3 h-3"><rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor"/></svg>
                  Stop
                </>
              ) : (
                <>
                  <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M4 3l9 5-9 5z" fill="currentColor"/></svg>
                  Run
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Editor column */}
        <div className="w-[520px] border-r border-[#e9eae6] bg-white flex flex-col flex-shrink-0">
          {/* Model + settings row */}
          <div className="px-4 py-3 border-b border-[#e9eae6] flex items-center gap-2 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <ModelPicker value={model} onChange={(id, meta) => { setModel(id); setProvider(meta.provider); if (meta.provider_key_id) setProviderKeyId(meta.provider_key_id) }} />
            </div>
            <SettingsDropdown settings={settings} onChange={setSettings} />
          </div>

          {/* Editor scrollable */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* System */}
            <Section title="System">
              <textarea
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                rows={4}
                placeholder="You are a helpful AI assistant."
                className="w-full px-3 py-2 border border-[#e9eae6] rounded-lg text-xs font-mono focus:outline-none focus:border-[#e8572a] resize-y"
              />
            </Section>

            {/* Messages */}
            <Section
              title="Messages"
              action={
                <button
                  onClick={addMessage}
                  className="flex items-center gap-1 text-[10px] text-[#e8572a] hover:underline"
                >
                  <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  Add message
                </button>
              }
            >
              <div className="space-y-2">
                {messages.map((m, idx) => (
                  <div key={m.id} className="border border-[#e9eae6] rounded-lg overflow-hidden">
                    <div className="px-2 py-1 bg-[#fafaf9] border-b border-[#e9eae6] flex items-center justify-between">
                      <button
                        onClick={() => toggleRole(m.id)}
                        className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded ${m.role === 'user' ? 'bg-[#fff5f2] text-[#e8572a]' : 'bg-[#f5f3ff] text-[#7c3aed]'}`}
                        title="Toggle role"
                      >{m.role}</button>
                      {messages.length > 1 && (
                        <button onClick={() => removeMessage(m.id)} className="text-[#9ca3af] hover:text-[#dc2626]" title="Remove">
                          <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </button>
                      )}
                    </div>
                    <textarea
                      value={m.content}
                      onChange={e => updateMessage(m.id, { content: e.target.value })}
                      rows={idx === messages.length - 1 ? 5 : 3}
                      placeholder={m.role === 'user' ? 'User message...' : 'Assistant response...'}
                      className="w-full px-3 py-2 text-xs font-mono focus:outline-none resize-y border-0"
                    />
                  </div>
                ))}
              </div>
            </Section>

            {/* Tools */}
            <Section
              title="Tools"
              action={
                <button onClick={() => setShowTools(true)} className="text-[10px] text-[#e8572a] hover:underline">
                  {tools ? 'Edit tools' : 'Add tools'}
                </button>
              }
            >
              {tools && Array.isArray(tools) && tools.length > 0 ? (
                <div className="space-y-1">
                  {tools.map((t: any, i: number) => (
                    <div key={i} className="px-2 py-1 bg-[#fafaf9] border border-[#e9eae6] rounded text-[11px] font-mono text-[#1a1a18]">
                      {t?.function?.name ?? t?.name ?? `tool_${i}`}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-[#9ca3af] italic">No tools configured.</p>
              )}
            </Section>

            {/* Variables (Clain extension) */}
            {detectedVars.length > 0 && (
              <Section title="Variables">
                <div className="space-y-2">
                  {detectedVars.map(v => (
                    <div key={v}>
                      <label className="block text-[11px] font-mono text-[#e8572a] mb-0.5">{`{{ ${v} }}`}</label>
                      <input
                        value={variables[v] ?? ''}
                        onChange={e => setVariables(prev => ({ ...prev, [v]: e.target.value }))}
                        placeholder={`value for ${v}`}
                        className="w-full px-2 py-1 border border-[#e9eae6] rounded text-xs focus:outline-none focus:border-[#e8572a]"
                      />
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Compare extra models */}
            {compareMode && (
              <Section title="Compare against">
                <div className="space-y-2">
                  {extraModels.map((mid, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <ModelPicker
                          value={mid}
                          onChange={(id) => setExtraModels(prev => prev.map((x, idx) => idx === i ? id : x))}
                        />
                      </div>
                      <button onClick={() => setExtraModels(prev => prev.filter((_, idx) => idx !== i))} className="text-[#9ca3af] hover:text-[#dc2626]">
                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      </button>
                    </div>
                  ))}
                  {extraModels.length < 3 && (
                    <button
                      onClick={() => setExtraModels(prev => [...prev, 'gpt-4o-mini'])}
                      className="flex items-center gap-1 text-[10px] text-[#e8572a] hover:underline"
                    >
                      <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      Add model
                    </button>
                  )}
                </div>
              </Section>
            )}

            <div className="text-[10px] text-[#9ca3af] pt-2">
              ~{estimateTokens(finalSystem + finalMessages.map(m => m.content).join('\n'))} input tokens (estimate)
            </div>
          </div>
        </div>

        {/* Result column */}
        <div className="flex-1 overflow-auto p-4 min-w-0 bg-[#f9f9f7]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-[#1a1a18] uppercase tracking-widest">Result</h3>
            {activeModels.length > 1 && (
              <span className="text-[10px] text-[#9ca3af]">Comparing {activeModels.length} models</span>
            )}
          </div>
          {Object.keys(results).length === 0 ? (
            <div className="border border-dashed border-[#e9eae6] rounded-xl p-12 text-center bg-white">
              <svg viewBox="0 0 16 16" className="w-8 h-8 text-[#e9eae6] mx-auto mb-2"><path d="M4 3l9 5-9 5z" fill="currentColor"/></svg>
              <p className="text-xs text-[#9ca3af]">Run prompt to see result</p>
            </div>
          ) : (
            <div className={`grid gap-3 ${activeModels.length === 1 ? 'grid-cols-1' : activeModels.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
              {activeModels.map(mid => (
                <ResultPanel key={mid} state={results[mid] as ResultState} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showTools && (
        <ToolsModal
          initial={tools}
          onClose={() => setShowTools(false)}
          onSave={(t) => { setTools(t); trackPlayground('llma playground tools configured', { count: Array.isArray(t) ? t.length : 0 }) }}
        />
      )}
      {showTemplates && (
        <div className="fixed inset-0 bg-[#1a1a18]/30 z-50 flex items-center justify-center" onClick={() => setShowTemplates(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-[720px] max-w-[92vw] max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1a1a18]">Prompt templates</h2>
              <button onClick={() => setShowTemplates(false)} className="text-[#9ca3af] hover:text-[#1a1a18]"><svg viewBox="0 0 16 16" className="w-4 h-4"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3">
              {PROMPT_TEMPLATES.map(t => (
                <button key={t.id} onClick={() => applyTemplate(t)} className="text-left p-4 border border-[#e9eae6] rounded-xl hover:border-[#e8572a] hover:bg-[#fff5f2] transition-all">
                  <h3 className="text-sm font-semibold text-[#1a1a18] mb-1">{t.name}</h3>
                  <p className="text-xs text-[#646462]">{t.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {showKeysManager && <ProviderKeysManager onClose={() => setShowKeysManager(false)} />}
      {showQuickStart && <QuickStartPopover onClose={() => setShowQuickStart(false)} />}
    </div>
  )
}

// ── Section helper ────────────────────────────────────────────────────────────
function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest">{title}</label>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── ResultPanel ───────────────────────────────────────────────────────────────
function ResultPanel({ state }: { state: ResultState }) {
  if (!state) return null
  return (
    <div className="border border-[#e9eae6] rounded-xl bg-white overflow-hidden flex flex-col min-h-[300px]">
      <div className="px-4 py-2.5 border-b border-[#e9eae6] flex items-center gap-2 flex-shrink-0">
        <span className="text-xs font-mono font-medium text-[#1a1a18] truncate">{state.modelId}</span>
        <span className="text-[10px] text-[#9ca3af] uppercase tracking-widest">{state.provider}</span>
        {state.status === 'running' && (
          <div className="ml-auto w-3 h-3 border-2 border-[#e8572a] border-t-transparent rounded-full animate-spin" />
        )}
        {state.status === 'done' && (
          <span className="ml-auto text-[10px] bg-[#dcfce7] text-[#166534] px-1.5 py-0.5 rounded font-semibold">DONE</span>
        )}
        {state.status === 'error' && (
          <span className="ml-auto text-[10px] bg-[#fee2e2] text-[#dc2626] px-1.5 py-0.5 rounded font-semibold">ERROR</span>
        )}
        {state.status === 'aborted' && (
          <span className="ml-auto text-[10px] bg-[#fef3c7] text-[#92400e] px-1.5 py-0.5 rounded font-semibold">STOPPED</span>
        )}
      </div>
      <div className="flex-1 overflow-auto p-4 min-h-0">
        {state.status === 'error' ? (
          <div className="bg-[#fef2f2] border border-[#fecaca] rounded-lg p-3 text-xs text-[#991b1b]">
            <p className="font-semibold mb-1">**Error:**</p>
            <pre className="font-mono whitespace-pre-wrap break-words">{state.error}</pre>
          </div>
        ) : state.status === 'running' && !state.output ? (
          <div className="space-y-2">
            <div className="h-3 bg-[#f3f3f1] rounded animate-pulse w-full" />
            <div className="h-3 bg-[#f3f3f1] rounded animate-pulse w-5/6" />
            <div className="h-3 bg-[#f3f3f1] rounded animate-pulse w-4/6" />
          </div>
        ) : (
          <pre className="text-xs whitespace-pre-wrap break-words font-sans text-[#1a1a18]">
            {state.output}
            {state.status === 'running' && <span className="inline-block w-0.5 h-3 bg-[#e8572a] animate-pulse ml-0.5 align-middle" />}
          </pre>
        )}
      </div>
      {(state.status === 'done' || state.status === 'aborted') && (
        <div className="px-4 py-2 border-t border-[#e9eae6] flex items-center gap-3 text-[10px] text-[#9ca3af] flex-shrink-0">
          <span>{state.tokens_in ?? '~'} in</span>
          <span>·</span>
          <span>{state.tokens_out ?? '~'} out</span>
          {state.cost != null && <><span>·</span><span className="font-mono text-[#1a1a18]">{pgFormatCost(state.cost)}</span></>}
          {state.latency != null && <><span>·</span><span>{state.latency.toFixed(2)}s</span></>}
          <button
            onClick={() => navigator.clipboard.writeText(state.output)}
            className="ml-auto text-[#646462] hover:text-[#1a1a18]"
            title="Copy"
          >
            <svg viewBox="0 0 16 16" className="w-3 h-3"><rect x="4" y="4" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M11 4V3a1 1 0 00-1-1H4a1 1 0 00-1 1v6a1 1 0 001 1h1" stroke="currentColor" strokeWidth="1.3" fill="none"/></svg>
          </button>
        </div>
      )}
    </div>
  )
}

// ── Quick start popover ───────────────────────────────────────────────────────
function QuickStartPopover({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-[480px] max-w-[92vw] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between">
          <h2 className="text-base font-bold text-[#1a1a18]">Quick start</h2>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#1a1a18]">
            <svg viewBox="0 0 16 16" className="w-4 h-4"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="p-5 space-y-3 text-xs text-[#1a1a18]">
          <ol className="space-y-2 list-decimal list-inside">
            <li>Pick a model from the dropdown (trial models work without keys).</li>
            <li>Write a system prompt and one or more user/assistant turns.</li>
            <li>Optionally add tools (OpenAI function-calling JSON) or variables (<code className="bg-[#f3f3f1] px-1 rounded font-mono">{`{{var}}`}</code>).</li>
            <li>Hit <strong>Run</strong>. Use <strong>Compare</strong> to fan out across multiple models in parallel.</li>
            <li>Save the prompt or evaluation from the <strong>Save</strong> menu for reuse.</li>
          </ol>
          <p className="text-[10px] text-[#9ca3af] pt-2 border-t border-[#e9eae6]">Trial models burn shared credits. For production traffic add your own provider key in API keys.</p>
        </div>
      </div>
    </div>
  )
}
