// FixWithAIPanel — "Corregir errores con IA" inline action. Mirrors PostHog's
// `frontend/src/scenes/data-warehouse/editor/MaxAITools.tsx`.
//
// PostHog asks Max AI to fix the active query when it errored. We re-use the
// existing Max AI streaming endpoint (`posthog.max.stream`) by sending the
// current query + error as the user message, and stream the assistant's reply
// back into a side panel. The user can accept the suggested fix (replaces the
// active query) or dismiss it.

import React from 'react';
import { HogQLHighlight } from './HogQLHighlight';

interface FixWithAIPanelProps {
  open: boolean;
  onClose: () => void;
  /** Current SQL of the active tab. */
  currentQuery: string;
  /** Latest error string (if any). */
  errorMessage: string | null;
  /** Replace the editor's content with the suggested fix. */
  onApply: (next: string) => void;
}

interface StreamMsg {
  role: 'human' | 'assistant';
  content: string;
}

export function FixWithAIPanel({ open, onClose, currentQuery, errorMessage, onApply }: FixWithAIPanelProps): React.ReactElement | null {
  const [messages, setMessages] = React.useState<StreamMsg[]>([]);
  const [streaming, setStreaming] = React.useState(false);
  const [suggested, setSuggested] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  React.useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      setMessages([]);
      setSuggested(null);
      setStreaming(false);
    }
  }, [open]);

  if (!open) return null;

  async function start(): Promise<void> {
    if (streaming) return;
    setMessages([{ role: 'human', content: prompt() }, { role: 'assistant', content: '' }]);
    setSuggested(null);
    setStreaming(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getTeamId()) await ph.bootstrapPostHog();
      await ph.posthog.max.stream(
        {
          content: prompt(),
          conversation: null,
          trace_id: crypto.randomUUID(),
          agent_mode: null,
        },
        (event) => {
          if (event.type === 'message' && event.data?.content) {
            const text = String(event.data.content);
            setMessages(prev => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'assistant') next[next.length - 1] = { ...last, content: text };
              return next;
            });
            const block = extractSqlBlock(text);
            if (block) setSuggested(block);
          }
        },
        ac.signal,
      );
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e?.message ?? 'desconocido'}` }]);
      }
    } finally {
      setStreaming(false);
    }
  }

  function prompt(): string {
    return `Tengo esta consulta HogQL que falla con el siguiente error. Devuélveme la consulta corregida en un bloque \`\`\`sql ... \`\`\`. Sé conciso.\n\n--- CONSULTA ---\n${currentQuery}\n\n--- ERROR ---\n${errorMessage ?? '(sin error reciente — sugiere mejoras)'}`;
  }

  return (
    <div className="w-80 border-l border-[#e9eae6] bg-white flex flex-col flex-shrink-0">
      <div className="px-3 py-2 border-b border-[#e9eae6] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#e8572a]">
            <path d="M9 1L3 9h4l-2 6 6-8H7l2-6z" />
          </svg>
          <span className="text-[12px] font-semibold text-[#1a1a18]">Corregir con IA</span>
        </div>
        <button onClick={onClose} className="text-[#9a9a98] hover:text-[#1a1a18] text-xs">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 min-h-0">
        {messages.length === 0 ? (
          <div className="text-[11px] text-[#646462]">
            <p className="mb-2">Max AI analizará tu consulta y el error reciente para sugerirte una corrección.</p>
            {errorMessage && (
              <div className="bg-[#fef2f2] border border-[#fecaca] rounded p-2 mb-2">
                <p className="text-[10px] font-mono text-[#991b1b] whitespace-pre-wrap">{errorMessage.slice(0, 200)}</p>
              </div>
            )}
            <button
              onClick={start}
              className="w-full px-3 py-1.5 bg-[#e8572a] text-white text-[12px] font-semibold rounded-lg hover:bg-[#c4471f]"
            >
              Analizar y sugerir
            </button>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`text-[11px] ${m.role === 'human' ? 'text-[#9ca3af]' : 'text-[#1a1a18]'}`}
            >
              <p className="text-[9px] uppercase font-semibold tracking-wide mb-1 text-[#9ca3af]">
                {m.role === 'human' ? 'Tú' : 'Max AI'}
              </p>
              <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
            </div>
          ))
        )}
        {streaming && (
          <div className="flex items-center gap-1.5 text-[10px] text-[#9ca3af]">
            <div className="w-2 h-2 rounded-full bg-[#9ca3af] animate-pulse" />
            Pensando…
          </div>
        )}
      </div>

      {suggested && (
        <div className="border-t border-[#e9eae6] p-3 flex-shrink-0">
          <p className="text-[10px] font-semibold text-[#9ca3af] uppercase mb-1.5">Sugerencia</p>
          <div className="max-h-32 overflow-auto bg-[#fafaf9] border border-[#e9eae6] rounded p-2 mb-2 font-mono text-[11px]">
            <HogQLHighlight text={suggested} />
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => { onApply(suggested); onClose(); }}
              className="flex-1 px-2 py-1.5 bg-[#16a34a] text-white text-[11px] font-semibold rounded hover:bg-[#15803d]"
            >
              Aplicar
            </button>
            <button
              onClick={() => setSuggested(null)}
              className="px-2 py-1.5 text-[11px] text-[#1a1a18] hover:bg-[#f3f3f1] rounded"
            >
              Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Pull out the first ```sql ... ``` (or ```hogql ... ```, ```...```) fenced block. */
function extractSqlBlock(text: string): string | null {
  const match = text.match(/```(?:sql|hogql)?\n?([\s\S]+?)```/i);
  return match ? match[1].trim() : null;
}

export default FixWithAIPanel;
