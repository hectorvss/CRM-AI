// ── ToolsModal ────────────────────────────────────────────────────────────────
// JSON editor for OpenAI function-calling tool definitions. Mirrors PostHog's
// products/llm_analytics/frontend/playground tools modal — exact copy:
// "OpenAI function calling format" + Insert example + Clear tools.

import React from 'react'

const EXAMPLE_TOOLS = JSON.stringify(
  [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get current weather for a city',
        parameters: {
          type: 'object',
          properties: {
            city:    { type: 'string', description: 'City name, e.g. Madrid' },
            unit:    { type: 'string', enum: ['celsius', 'fahrenheit'], description: 'Temperature unit' },
          },
          required: ['city'],
        },
      },
    },
  ],
  null,
  2,
)

export function ToolsModal({
  initial,
  onClose,
  onSave,
}: {
  initial: any
  onClose: () => void
  onSave: (tools: any) => void
}) {
  const [text, setText] = React.useState(() => initial ? JSON.stringify(initial, null, 2) : '')
  const [error, setError] = React.useState<string | null>(null)

  function save() {
    if (!text.trim()) { onSave(null); onClose(); return }
    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) {
        setError('Tools must be a JSON array of function definitions.')
        return
      }
      onSave(parsed)
      onClose()
    } catch (e: any) {
      setError(`Invalid JSON: ${e?.message ?? 'parse error'}`)
    }
  }

  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-[720px] max-w-[92vw] max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#1a1a18]">Tools</h2>
            <p className="text-xs text-[#646462] mt-0.5">OpenAI function calling format</p>
          </div>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#1a1a18]">
            <svg viewBox="0 0 16 16" className="w-4 h-4"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col min-h-0">
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setError(null) }}
            placeholder='[{ "type": "function", "function": { ... } }]'
            spellCheck={false}
            className="flex-1 min-h-[300px] px-3 py-2 border border-[#e9eae6] rounded-lg text-xs font-mono focus:outline-none focus:border-[#e8572a] resize-y"
          />
          {error && (
            <div className="mt-2 bg-[#fef2f2] border border-[#fecaca] rounded p-2 text-xs text-[#991b1b]">{error}</div>
          )}
        </div>
        <div className="px-5 py-3 bg-[#fafaf9] border-t border-[#e9eae6] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setText(EXAMPLE_TOOLS); setError(null) }}
              className="px-3 py-1.5 bg-white border border-[#e9eae6] text-xs text-[#1a1a18] rounded-lg hover:bg-[#fafaf9]"
            >Insert example</button>
            <button
              onClick={() => { setText(''); setError(null) }}
              className="px-3 py-1.5 text-xs text-[#dc2626] rounded-lg hover:bg-[#fef2f2]"
            >Clear tools</button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-[#646462] hover:text-[#1a1a18]">Cancel</button>
            <button onClick={save} className="px-3 py-1.5 bg-[#e8572a] text-white text-xs rounded-lg hover:bg-[#d44a1f]">Save tools</button>
          </div>
        </div>
      </div>
    </div>
  )
}
