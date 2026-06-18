// ── SettingsDropdown ──────────────────────────────────────────────────────────
// Model-call parameters dropdown. Mirrors PostHog's LemonDropdown in the
// Playground header — exact fields: temperature, top_p, max_tokens, seed,
// thinking, reasoning_level.

import React from 'react'

export interface PlaygroundSettings {
  temperature?:    number
  top_p?:          number
  max_tokens?:     number
  seed?:           number
  thinking:        boolean
  reasoning_level?: 'minimal' | 'low' | 'medium' | 'high'
}

export const DEFAULT_SETTINGS: PlaygroundSettings = {
  temperature:     1,
  top_p:           1,
  max_tokens:      1024,
  seed:            undefined,
  thinking:        false,
  reasoning_level: undefined,
}

export function SettingsDropdown({
  settings,
  onChange,
}: {
  settings: PlaygroundSettings
  onChange: (next: PlaygroundSettings) => void
}) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function patch<K extends keyof PlaygroundSettings>(key: K, value: PlaygroundSettings[K]) {
    onChange({ ...settings, [key]: value })
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e9eae6] rounded-lg text-xs text-[#1a1a18] hover:bg-[#fafaf9]"
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M8 1v2M8 13v2M14 8h-2M4 8H2M12 4l-1.4 1.4M5.4 10.6L4 12M12 12l-1.4-1.4M5.4 5.4L4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        Settings
        <svg viewBox="0 0 16 16" className="w-3 h-3 text-[#9ca3af]"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-[340px] bg-white border border-[#e9eae6] rounded-lg shadow-lg p-4 space-y-3">
          <SliderRow label="Temperature" value={settings.temperature ?? 1} min={0} max={2} step={0.05}
            onChange={v => patch('temperature', v)} />
          <SliderRow label="Top P" value={settings.top_p ?? 1} min={0} max={1} step={0.01}
            onChange={v => patch('top_p', v)} />
          <div>
            <label className="block text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">Max tokens</label>
            <input
              type="number"
              min={1}
              max={32768}
              value={settings.max_tokens ?? 1024}
              onChange={e => patch('max_tokens', Number(e.target.value))}
              className="w-full px-2 py-1 border border-[#e9eae6] rounded text-xs font-mono focus:outline-none focus:border-[#e8572a]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">Seed (optional)</label>
            <input
              type="number"
              value={settings.seed ?? ''}
              onChange={e => patch('seed', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="Random"
              className="w-full px-2 py-1 border border-[#e9eae6] rounded text-xs font-mono focus:outline-none focus:border-[#e8572a]"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-[#1a1a18] cursor-pointer">
            <input
              type="checkbox"
              checked={settings.thinking}
              onChange={e => patch('thinking', e.target.checked)}
              className="accent-[#e8572a]"
            />
            Enable thinking
          </label>
          <div>
            <label className="block text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">Reasoning level</label>
            <select
              value={settings.reasoning_level ?? ''}
              onChange={e => patch('reasoning_level', (e.target.value || undefined) as PlaygroundSettings['reasoning_level'])}
              className="w-full px-2 py-1 border border-[#e9eae6] rounded text-xs bg-white focus:outline-none focus:border-[#e8572a]"
            >
              <option value="">Default</option>
              <option value="minimal">minimal</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </div>
          <div className="pt-2 border-t border-[#e9eae6] flex justify-end">
            <button
              onClick={() => onChange(DEFAULT_SETTINGS)}
              className="text-[10px] text-[#9ca3af] hover:text-[#dc2626]"
            >Reset to defaults</button>
          </div>
        </div>
      )}
    </div>
  )
}

function SliderRow({ label, value, min, max, step, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest">{label}</label>
        <span className="text-[11px] font-mono text-[#1a1a18]">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-[#e8572a]"
      />
    </div>
  )
}
