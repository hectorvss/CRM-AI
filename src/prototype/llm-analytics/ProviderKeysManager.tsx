// ── ProviderKeysManager ───────────────────────────────────────────────────────
// BYOK provider keys CRUD. Backed by /api/projects/{pid}/llm_provider_keys/.
// Mirrors PostHog's llmProviderKeysLogic + UI sliver in the playground settings.

import React from 'react'
import * as ph from '../../api/posthog'
import { PROVIDER_LABELS, PROVIDER_DOT, type Provider } from './ModelPicker'

interface ProviderKey {
  id:         string
  provider:   Provider
  nickname?:  string
  masked_key?: string
  is_default?: boolean
  created_at?: string
}

export function ProviderKeysManager({ onClose }: { onClose: () => void }) {
  const [items, setItems] = React.useState<ProviderKey[] | null>(null)
  const [err,   setErr]   = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [provider, setProvider] = React.useState<Provider>('openai')
  const [nickname, setNickname] = React.useState('')
  const [apiKey,   setApiKey]   = React.useState('')
  const [saving,   setSaving]   = React.useState(false)

  async function reload() {
    try {
      const res: any = await ph.posthog.llmProviderKeys.list()
      setItems(Array.isArray(res?.results) ? res.results : Array.isArray(res) ? res : [])
      setErr(null)
    } catch (e: any) {
      setErr(e?.message ?? 'Could not load keys')
    }
  }

  React.useEffect(() => { reload() }, [])

  async function create() {
    if (!apiKey.trim()) { setErr('API key is required'); return }
    setSaving(true); setErr(null)
    try {
      await ph.posthog.llmProviderKeys.create({
        provider,
        nickname: nickname.trim() || undefined,
        api_key:  apiKey.trim(),
      })
      setApiKey(''); setNickname(''); setAdding(false)
      await reload()
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this provider key? Models using it will revert to trial.')) return
    try {
      await ph.posthog.llmProviderKeys.delete(id)
      await reload()
    } catch (e: any) {
      alert(e?.message ?? 'Could not delete')
    }
  }

  async function setDefault(id: string) {
    try {
      await ph.posthog.llmProviderKeys.update(id, { is_default: true })
      await reload()
    } catch (e: any) {
      alert(e?.message ?? 'Could not update')
    }
  }

  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-[640px] max-w-[92vw] max-h-[88vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#1a1a18]">Provider keys (BYOK)</h2>
            <p className="text-xs text-[#646462] mt-0.5">Keys are stored encrypted server-side. The playground proxies through PostHog — your browser never sees them.</p>
          </div>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#1a1a18]">
            <svg viewBox="0 0 16 16" className="w-4 h-4"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {err && <div className="bg-[#fef2f2] border border-[#fecaca] rounded p-2 text-xs text-[#991b1b] mb-3">{err}</div>}

          <div className="border border-[#e9eae6] rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-[#e9eae6] bg-[#fafaf9] text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest flex">
              <span className="flex-1">Provider</span>
              <span className="w-[180px]">Nickname</span>
              <span className="w-[120px]">Key</span>
              <span className="w-[60px]"></span>
            </div>
            {items === null && <p className="p-6 text-xs text-[#9ca3af] text-center">Loading...</p>}
            {items && items.length === 0 && <p className="p-6 text-xs text-[#9ca3af] text-center">No provider keys yet. Trial models still work.</p>}
            {items?.map(k => (
              <div key={k.id} className="px-4 py-2.5 border-b border-[#e9eae6] last:border-b-0 flex items-center text-xs">
                <div className="flex-1 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PROVIDER_DOT[k.provider] }} />
                  <span className="font-medium text-[#1a1a18]">{PROVIDER_LABELS[k.provider] ?? k.provider}</span>
                  {k.is_default && <span className="text-[9px] bg-[#fff5f2] text-[#e8572a] px-1 py-0.5 rounded font-semibold uppercase">Default</span>}
                </div>
                <div className="w-[180px] text-[#646462] truncate">{k.nickname ?? '—'}</div>
                <div className="w-[120px] font-mono text-[#9ca3af]">{k.masked_key ?? '••••••••'}</div>
                <div className="w-[60px] flex items-center gap-1 justify-end">
                  {!k.is_default && (
                    <button onClick={() => setDefault(k.id)} className="text-[#9ca3af] hover:text-[#e8572a]" title="Make default">
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M8 1l2 5h5l-4 3 1.5 5L8 11l-4.5 3L5 9 1 6h5z" fill="none" stroke="currentColor" strokeWidth="1.3"/></svg>
                    </button>
                  )}
                  <button onClick={() => remove(k.id)} className="text-[#9ca3af] hover:text-[#dc2626]" title="Delete">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M3 4h10M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {!adding ? (
            <button
              onClick={() => setAdding(true)}
              className="mt-4 flex items-center gap-1.5 px-3 py-2 bg-white border border-[#e9eae6] rounded-lg text-xs text-[#1a1a18] hover:bg-[#fafaf9]"
            >
              <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Add provider key
            </button>
          ) : (
            <div className="mt-4 p-4 border border-[#e9eae6] rounded-lg space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">Provider</label>
                <select
                  value={provider}
                  onChange={e => setProvider(e.target.value as Provider)}
                  className="w-full px-2 py-1.5 border border-[#e9eae6] rounded text-xs bg-white focus:outline-none focus:border-[#e8572a]"
                >
                  {(Object.keys(PROVIDER_LABELS) as Provider[]).map(p => (
                    <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">Nickname (optional)</label>
                <input
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  placeholder="production-key"
                  className="w-full px-2 py-1.5 border border-[#e9eae6] rounded text-xs focus:outline-none focus:border-[#e8572a]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">API key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                  className="w-full px-2 py-1.5 border border-[#e9eae6] rounded text-xs font-mono focus:outline-none focus:border-[#e8572a]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setAdding(false); setApiKey(''); setNickname('') }} className="px-3 py-1.5 text-xs text-[#646462] hover:text-[#1a1a18]">Cancel</button>
                <button onClick={create} disabled={saving} className="px-3 py-1.5 bg-[#e8572a] text-white text-xs rounded-lg hover:bg-[#d44a1f] disabled:opacity-60">{saving ? 'Saving...' : 'Save key'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
