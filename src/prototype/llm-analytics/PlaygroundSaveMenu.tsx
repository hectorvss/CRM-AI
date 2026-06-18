// ── PlaygroundSaveMenu ────────────────────────────────────────────────────────
// Save / Load menu — mirrors PostHog's products/llm_analytics/frontend/playground
// PlaygroundSaveMenu.tsx.
//
// Options:
//   - Save as new prompt
//   - Save as new evaluation
//   - Load prompt
//   - Load evaluation
//   - Save to <linked source> (if sourceType set)
//   - Unlink from source

import React from 'react'
import * as ph from '../../api/posthog'

export type SourceType = 'prompt' | 'evaluation' | null

export interface PromptConfig {
  id?:                    string
  systemPrompt:           string
  messages:               Array<{ role: 'user' | 'assistant'; content: string }>
  model:                  string
  provider:               string
  settings:               any
  tools:                  any
  selectedProviderKeyId?: string | null
  sourceType:             SourceType
  sourcePromptName?:      string
  sourcePromptVersion?:   string | number
  sourceEvaluationId?:    string | number
  sourceEvaluationName?:  string
}

export function PlaygroundSaveMenu({
  config,
  onLink,
  onUnlink,
  onSavedCurrent,
  onTrack,
}: {
  config: PromptConfig
  onLink: (next: Partial<PromptConfig>) => void
  onUnlink: () => void
  onSavedCurrent: () => void
  onTrack: (event: string, props?: any) => void
}) {
  const [open,    setOpen]    = React.useState(false)
  const [dialog,  setDialog]  = React.useState<null | 'save-prompt' | 'save-eval' | 'load-prompt' | 'load-eval' | 'confirm-save'>(null)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e9eae6] rounded-lg text-xs text-[#1a1a18] hover:bg-[#fafaf9]"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M3 2h8l2 2v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M5 2v4h5V2M5 10h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          Save
          <svg viewBox="0 0 16 16" className="w-3 h-3 text-[#9ca3af]"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
        </button>
        {open && (
          <div className="absolute right-0 z-50 mt-1 w-[260px] bg-white border border-[#e9eae6] rounded-lg shadow-lg py-1">
            {config.sourceType === 'prompt' && config.sourcePromptName && (
              <button
                onClick={() => { setDialog('confirm-save'); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-xs text-[#1a1a18] hover:bg-[#fff5f2] flex items-center gap-2"
              >
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-[#e8572a]"><path d="M3 2h8l2 2v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" fill="none" stroke="currentColor" strokeWidth="1.3"/></svg>
                <div>
                  <div className="font-medium">Save to {config.sourcePromptName}</div>
                  <div className="text-[10px] text-[#9ca3af]">Creates new version</div>
                </div>
              </button>
            )}
            <button
              onClick={() => { setDialog('save-prompt'); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs text-[#1a1a18] hover:bg-[#fafaf9]"
            >Save as new prompt</button>
            <button
              onClick={() => { setDialog('save-eval'); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs text-[#1a1a18] hover:bg-[#fafaf9]"
            >Save as new evaluation</button>
            <div className="border-t border-[#e9eae6] my-1" />
            <button
              onClick={() => { setDialog('load-prompt'); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs text-[#1a1a18] hover:bg-[#fafaf9]"
            >Load prompt</button>
            <button
              onClick={() => { setDialog('load-eval'); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs text-[#1a1a18] hover:bg-[#fafaf9]"
            >Load evaluation</button>
            {config.sourceType && (
              <>
                <div className="border-t border-[#e9eae6] my-1" />
                <button
                  onClick={() => { onTrack('llma playground source unlinked'); onUnlink(); setOpen(false) }}
                  className="w-full text-left px-3 py-2 text-xs text-[#dc2626] hover:bg-[#fef2f2]"
                >Unlink from source</button>
              </>
            )}
          </div>
        )}
      </div>

      {dialog === 'save-prompt' && (
        <SavePromptDialog
          config={config}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            onTrack('llma playground prompt saved', { source: 'prompt', name: saved.name, version: saved.version })
            onLink({
              id:                  saved.id,
              sourceType:          'prompt',
              sourcePromptName:    saved.name,
              sourcePromptVersion: saved.version,
            })
            onSavedCurrent()
            setDialog(null)
          }}
        />
      )}
      {dialog === 'save-eval' && (
        <SaveEvaluationDialog
          config={config}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            onTrack('llma playground prompt saved', { source: 'evaluation', id: saved.id, name: saved.name })
            onLink({
              sourceType:           'evaluation',
              sourceEvaluationId:   saved.id,
              sourceEvaluationName: saved.name,
            })
            onSavedCurrent()
            setDialog(null)
          }}
        />
      )}
      {dialog === 'load-prompt' && (
        <LoadPromptDialog
          onClose={() => setDialog(null)}
          onPick={(p) => {
            onTrack('llma playground opened from source', { source: 'prompt', name: p.name, version: p.version })
            onLink({
              id:                  p.id,
              systemPrompt:        p.system ?? '',
              messages:            p.messages ?? [],
              model:               p.model ?? config.model,
              provider:            p.provider ?? config.provider,
              settings:            { ...config.settings, ...(p.settings ?? {}) },
              tools:               p.tools ?? null,
              sourceType:          'prompt',
              sourcePromptName:    p.name,
              sourcePromptVersion: p.version,
            })
            setDialog(null)
          }}
        />
      )}
      {dialog === 'load-eval' && (
        <LoadEvaluationDialog
          onClose={() => setDialog(null)}
          onPick={(e) => {
            onTrack('llma playground opened from source', { source: 'evaluation', id: e.id, name: e.name })
            onLink({
              systemPrompt:         e.system ?? config.systemPrompt,
              messages:             e.messages ?? config.messages,
              model:                e.model ?? config.model,
              provider:             e.provider ?? config.provider,
              settings:             { ...config.settings, ...(e.settings ?? {}) },
              tools:                e.tools ?? config.tools,
              sourceType:           'evaluation',
              sourceEvaluationId:   e.id,
              sourceEvaluationName: e.name,
            })
            setDialog(null)
          }}
        />
      )}
      {dialog === 'confirm-save' && config.sourcePromptName && (
        <ConfirmSaveDialog
          config={config}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            try {
              await ph.posthog.llmPrompts.update(config.id!, {
                name:    config.sourcePromptName,
                system:  config.systemPrompt,
                messages:config.messages,
                model:   config.model,
                provider:config.provider,
                settings:config.settings,
                tools:   config.tools,
              })
              onTrack('llma playground prompt saved', { source: 'prompt', name: config.sourcePromptName, kind: 'new-version' })
              onSavedCurrent()
            } catch (e: any) {
              alert(`Could not save: ${e?.message ?? 'unknown error'}`)
            }
            setDialog(null)
          }}
        />
      )}
    </>
  )
}

// ── Dialogs ──────────────────────────────────────────────────────────────────

function SavePromptDialog({ config, onClose, onSaved }: {
  config: PromptConfig
  onClose: () => void
  onSaved: (p: { id: string; name: string; version: number | string }) => void
}) {
  const [name, setName] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [err, setErr]   = React.useState<string | null>(null)
  async function save() {
    if (!name.trim()) { setErr('Name is required'); return }
    setBusy(true); setErr(null)
    try {
      const res: any = await ph.posthog.llmPrompts.create({
        name:     name.trim(),
        system:   config.systemPrompt,
        messages: config.messages,
        model:    config.model,
        provider: config.provider,
        settings: config.settings,
        tools:    config.tools,
      })
      onSaved({ id: res.id, name: res.name ?? name.trim(), version: res.version ?? 1 })
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Save as new prompt" onClose={onClose}>
      <label className="block text-xs font-medium text-[#1a1a18] mb-1">Name</label>
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="onboarding-summary"
        className="w-full px-3 py-2 border border-[#e9eae6] rounded-lg text-sm focus:outline-none focus:border-[#e8572a]"
      />
      <p className="text-[10px] text-[#9ca3af] mt-1">Unique per project. Versions auto-increment.</p>
      {err && <div className="mt-3 bg-[#fef2f2] border border-[#fecaca] rounded p-2 text-xs text-[#991b1b]">{err}</div>}
      <Footer onClose={onClose} onAction={save} busy={busy} actionLabel="Save prompt" />
    </Modal>
  )
}

function SaveEvaluationDialog({ config, onClose, onSaved }: {
  config: PromptConfig
  onClose: () => void
  onSaved: (e: { id: string | number; name: string }) => void
}) {
  const [name, setName] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [err, setErr]   = React.useState<string | null>(null)
  async function save() {
    if (!name.trim()) { setErr('Name is required'); return }
    setBusy(true); setErr(null)
    try {
      const tid = ph.getTeamId()
      const res = await ph.phPost<any>(`/api/environments/${tid}/evaluations/`, {
        name:     name.trim(),
        system:   config.systemPrompt,
        messages: config.messages,
        model:    config.model,
        provider: config.provider,
        settings: config.settings,
        tools:    config.tools,
      })
      onSaved({ id: res.id, name: res.name ?? name.trim() })
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Save as new evaluation" onClose={onClose}>
      <label className="block text-xs font-medium text-[#1a1a18] mb-1">Evaluation name</label>
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="checkout-suggestions-q1"
        className="w-full px-3 py-2 border border-[#e9eae6] rounded-lg text-sm focus:outline-none focus:border-[#e8572a]"
      />
      {err && <div className="mt-3 bg-[#fef2f2] border border-[#fecaca] rounded p-2 text-xs text-[#991b1b]">{err}</div>}
      <Footer onClose={onClose} onAction={save} busy={busy} actionLabel="Save evaluation" />
    </Modal>
  )
}

function LoadPromptDialog({ onClose, onPick }: {
  onClose: () => void
  onPick: (p: any) => void
}) {
  const [search,  setSearch]  = React.useState('')
  const [items,   setItems]   = React.useState<any[] | null>(null)
  const [err,     setErr]     = React.useState<string | null>(null)
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res: any = await ph.posthog.llmPrompts.list({ limit: 100 })
        if (cancelled) return
        setItems(Array.isArray(res?.results) ? res.results : Array.isArray(res) ? res : [])
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? 'Could not load prompts')
      }
    })()
    return () => { cancelled = true }
  }, [])
  const filtered = (items ?? []).filter(p => !search || (p.name ?? '').toLowerCase().includes(search.toLowerCase()))
  return (
    <Modal title="Load prompt" onClose={onClose}>
      <input
        autoFocus
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search prompts..."
        className="w-full px-3 py-2 border border-[#e9eae6] rounded-lg text-sm focus:outline-none focus:border-[#e8572a] mb-3"
      />
      <div className="border border-[#e9eae6] rounded-lg max-h-[360px] overflow-y-auto">
        {items === null && !err && <p className="p-6 text-xs text-[#9ca3af] text-center">Loading...</p>}
        {err && <p className="p-6 text-xs text-[#dc2626] text-center">{err}</p>}
        {items && filtered.length === 0 && <p className="p-6 text-xs text-[#9ca3af] text-center">No prompts yet.</p>}
        {filtered.map(p => (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            className="w-full text-left px-4 py-2.5 hover:bg-[#fafaf9] border-b border-[#e9eae6] last:border-b-0"
          >
            <div className="text-sm font-medium text-[#1a1a18]">{p.name}</div>
            <div className="text-[10px] text-[#9ca3af]">
              {p.model && <span className="font-mono">{p.model}</span>}
              {p.version && <span className="ml-2">v{p.version}</span>}
              {p.updated_at && <span className="ml-2">{new Date(p.updated_at).toLocaleDateString('es-ES')}</span>}
            </div>
          </button>
        ))}
      </div>
      <Footer onClose={onClose} actionLabel="" onAction={undefined} />
    </Modal>
  )
}

function LoadEvaluationDialog({ onClose, onPick }: {
  onClose: () => void
  onPick: (e: any) => void
}) {
  const [items, setItems] = React.useState<any[] | null>(null)
  const [err,   setErr]   = React.useState<string | null>(null)
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res: any = await ph.posthog.llmAnalytics.listEvaluations({ limit: 100 })
        if (cancelled) return
        setItems(Array.isArray(res?.results) ? res.results : Array.isArray(res) ? res : [])
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? 'Could not load evaluations')
      }
    })()
    return () => { cancelled = true }
  }, [])
  return (
    <Modal title="Load evaluation" onClose={onClose}>
      <div className="border border-[#e9eae6] rounded-lg max-h-[360px] overflow-y-auto">
        {items === null && !err && <p className="p-6 text-xs text-[#9ca3af] text-center">Loading...</p>}
        {err && <p className="p-6 text-xs text-[#dc2626] text-center">{err}</p>}
        {items && items.length === 0 && <p className="p-6 text-xs text-[#9ca3af] text-center">No evaluations yet.</p>}
        {items?.map(e => (
          <button
            key={e.id}
            onClick={() => onPick(e)}
            className="w-full text-left px-4 py-2.5 hover:bg-[#fafaf9] border-b border-[#e9eae6] last:border-b-0"
          >
            <div className="text-sm font-medium text-[#1a1a18]">{e.name ?? `Evaluation ${e.id}`}</div>
            <div className="text-[10px] text-[#9ca3af]">
              {e.model && <span className="font-mono">{e.model}</span>}
              {e.created_at && <span className="ml-2">{new Date(e.created_at).toLocaleDateString('es-ES')}</span>}
            </div>
          </button>
        ))}
      </div>
      <Footer onClose={onClose} actionLabel="" onAction={undefined} />
    </Modal>
  )
}

function ConfirmSaveDialog({ config, onClose, onConfirm }: {
  config: PromptConfig
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Modal title={`Save to ${config.sourcePromptName}`} onClose={onClose}>
      <p className="text-sm text-[#1a1a18]">
        This will create a new version of <strong className="font-mono">{config.sourcePromptName}</strong> (currently v{String(config.sourcePromptVersion ?? '?')}).
      </p>
      <p className="text-xs text-[#646462] mt-2">
        Previous versions remain available via the API.
      </p>
      <Footer onClose={onClose} onAction={onConfirm} actionLabel="Save new version" />
    </Modal>
  )
}

// ── Shared modal shell ───────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-[540px] max-w-[92vw] max-h-[88vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-bold text-[#1a1a18]">{title}</h2>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#1a1a18]">
            <svg viewBox="0 0 16 16" className="w-4 h-4"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function Footer({ onClose, onAction, actionLabel, busy }: {
  onClose: () => void
  onAction?: () => void
  actionLabel: string
  busy?: boolean
}) {
  return (
    <div className="mt-5 flex justify-end items-center gap-2">
      <button onClick={onClose} className="px-3 py-1.5 text-xs text-[#646462] hover:text-[#1a1a18]">
        {onAction ? 'Cancel' : 'Close'}
      </button>
      {onAction && actionLabel && (
        <button
          onClick={onAction}
          disabled={busy}
          className="px-3 py-1.5 bg-[#e8572a] text-white text-xs rounded-lg hover:bg-[#d44a1f] disabled:opacity-60"
        >{busy ? 'Saving...' : actionLabel}</button>
      )}
    </div>
  )
}
