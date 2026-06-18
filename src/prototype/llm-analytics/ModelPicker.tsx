// ── ModelPicker ───────────────────────────────────────────────────────────────
// Provider-grouped popover for selecting a model. Mirrors PostHog's
// products/llm_analytics/frontend/playground/ModelPicker.
//
// Fetches /api/projects/{pid}/llm_proxy/models/ on mount and falls back to a
// hardcoded list when the endpoint is unavailable (older PostHog builds).

import React from 'react'
import * as ph from '../../api/posthog'

export type Provider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'openrouter'
  | 'fireworks'
  | 'azure_openai'

export interface PlaygroundModel {
  id:            string
  display_name?: string
  provider:      Provider
  context_window?: number
  is_trial?:     boolean
  provider_key_id?: string | null
  description?: string
}

const FALLBACK_MODELS: PlaygroundModel[] = [
  { id: 'gpt-5-mini',                  provider: 'openai',    display_name: 'gpt-5-mini',                  is_trial: true },
  { id: 'gpt-4o',                       provider: 'openai',    display_name: 'GPT-4o',                       is_trial: true },
  { id: 'gpt-4o-mini',                  provider: 'openai',    display_name: 'GPT-4o mini',                  is_trial: true },
  { id: 'gpt-4-turbo',                  provider: 'openai',    display_name: 'GPT-4 Turbo' },
  { id: 'o1-mini',                      provider: 'openai',    display_name: 'o1 mini' },
  { id: 'claude-3-5-sonnet-20241022',   provider: 'anthropic', display_name: 'Claude 3.5 Sonnet',            is_trial: true },
  { id: 'claude-3-5-haiku-20241022',    provider: 'anthropic', display_name: 'Claude 3.5 Haiku' },
  { id: 'claude-3-opus-20240229',       provider: 'anthropic', display_name: 'Claude 3 Opus' },
  { id: 'gemini-2.0-flash-exp',         provider: 'gemini',    display_name: 'Gemini 2.0 Flash' },
  { id: 'gemini-1.5-pro',               provider: 'gemini',    display_name: 'Gemini 1.5 Pro' },
]

const PROVIDER_LABELS: Record<Provider, string> = {
  openai:       'OpenAI',
  anthropic:    'Anthropic',
  gemini:       'Google Gemini',
  openrouter:   'OpenRouter',
  fireworks:    'Fireworks',
  azure_openai: 'Azure OpenAI',
}

const PROVIDER_DOT: Record<Provider, string> = {
  openai:       '#16a34a',
  anthropic:    '#e8572a',
  gemini:       '#3b59f6',
  openrouter:   '#a855f7',
  fireworks:    '#f59e0b',
  azure_openai: '#0078d4',
}

export function ModelPicker({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (modelId: string, model: PlaygroundModel) => void
  className?: string
}) {
  const [open, setOpen]       = React.useState(false)
  const [models, setModels]   = React.useState<PlaygroundModel[]>(FALLBACK_MODELS)
  const [search, setSearch]   = React.useState('')
  const [loaded, setLoaded]   = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (loaded) return
    let cancelled = false
    ;(async () => {
      try {
        if (!ph.getTeamId()) await ph.bootstrapPostHog()
        const res: any = await ph.posthog.llmProxy.models()
        if (cancelled) return
        const list: PlaygroundModel[] =
          Array.isArray(res) ? res :
          Array.isArray(res?.models) ? res.models :
          Array.isArray(res?.results) ? res.results :
          []
        if (list.length) setModels(list)
      } catch {
        // 401/404 → keep fallback list
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [loaded])

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const current = models.find(m => m.id === value) ?? { id: value, provider: 'openai' as Provider, display_name: value }
  const filtered = search
    ? models.filter(m => m.id.toLowerCase().includes(search.toLowerCase()) || (m.display_name ?? '').toLowerCase().includes(search.toLowerCase()))
    : models

  const grouped: Array<[Provider, PlaygroundModel[]]> = (
    ['openai', 'anthropic', 'gemini', 'openrouter', 'fireworks', 'azure_openai'] as Provider[]
  ).map(p => [p, filtered.filter(m => m.provider === p)]).filter(([, list]) => list.length) as any

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#e9eae6] rounded-lg text-xs text-[#1a1a18] hover:bg-[#fafaf9] w-full"
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PROVIDER_DOT[current.provider] }} />
        <span className="truncate font-mono">{current.display_name ?? current.id}</span>
        <svg viewBox="0 0 16 16" className="w-3 h-3 ml-auto flex-shrink-0 text-[#9ca3af]"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-[360px] bg-white border border-[#e9eae6] rounded-lg shadow-lg max-h-[420px] overflow-hidden flex flex-col">
          <div className="p-2 border-b border-[#e9eae6]">
            <input
              autoFocus
              placeholder="Search models..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-2 py-1 text-xs border border-[#e9eae6] rounded focus:outline-none focus:border-[#e8572a]"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {grouped.length === 0 && (
              <p className="px-3 py-4 text-xs text-[#9ca3af] text-center">No models match "{search}"</p>
            )}
            {grouped.map(([provider, list]) => (
              <div key={provider}>
                <div className="px-3 py-1 text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest bg-[#fafaf9] border-b border-[#e9eae6] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PROVIDER_DOT[provider] }} />
                  {PROVIDER_LABELS[provider]}
                </div>
                {list.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { onChange(m.id, m); setOpen(false); setSearch('') }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-[#fafaf9] text-xs flex items-center gap-2 ${m.id === value ? 'bg-[#fff5f2]' : ''}`}
                  >
                    <span className="font-mono text-[#1a1a18] truncate">{m.display_name ?? m.id}</span>
                    {m.is_trial && <span className="text-[9px] bg-[#fff5f2] text-[#e8572a] px-1 py-0.5 rounded font-semibold uppercase">Trial</span>}
                    {!m.is_trial && m.provider_key_id && <span className="text-[9px] bg-[#f3f3f1] text-[#646462] px-1 py-0.5 rounded font-semibold uppercase">BYOK</span>}
                    {m.id === value && (
                      <svg viewBox="0 0 16 16" className="w-3 h-3 ml-auto text-[#e8572a]"><path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="px-3 py-1.5 border-t border-[#e9eae6] text-[10px] text-[#9ca3af] bg-[#fafaf9]">
            {models.length} models · {loaded ? 'live' : 'loading...'}
          </div>
        </div>
      )}
    </div>
  )
}

export { PROVIDER_LABELS, PROVIDER_DOT, FALLBACK_MODELS }
