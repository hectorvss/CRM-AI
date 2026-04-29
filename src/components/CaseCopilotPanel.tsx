import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { aiApi } from '../api/client';

type CopilotMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
};

type CaseCopilotPanelProps = {
  caseId?: string | null;
  entityLabel: string;
  subjectLabel: string;
  summary: string;
  conflict?: string | null;
  recommendation?: string | null;
  riskLabel?: string;
  suggestedQuestions?: string[];
  isLoading?: boolean;
  onOpenModule?: () => void;
  moduleButtonLabel?: string;
  onApply?: () => void;
  applyButtonLabel?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
};

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function CaseCopilotPanel({
  caseId,
  entityLabel,
  subjectLabel,
  summary,
  conflict,
  recommendation,
  riskLabel = 'Low',
  suggestedQuestions,
  isLoading = false,
  onOpenModule,
  moduleButtonLabel = 'View module',
  onApply,
  applyButtonLabel = 'Apply to Composer',
  emptyTitle = `Ask me anything about this ${entityLabel.toLowerCase()}`,
  emptySubtitle = 'I have full context: state, blockers and history.',
}: CaseCopilotPanelProps) {
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([]);
  const [copilotInput, setCopilotInput] = useState('');
  const [isCopilotSending, setIsCopilotSending] = useState(false);
  const copilotBottomRef = useRef<HTMLDivElement>(null);

  const effectiveSuggestions = useMemo(() => {
    if (suggestedQuestions && suggestedQuestions.length > 0) return suggestedQuestions;

    const qs = [conflict ? "What's causing the conflict?" : 'What is the current status?', 'What should I do next?'];
    if (/payment/i.test(subjectLabel)) qs.push("What's wrong with the payment?");
    else if (/return/i.test(subjectLabel)) qs.push("What's the return status?");
    else qs.push(`Walk me through this ${entityLabel.toLowerCase()}`);
    if (riskLabel.toLowerCase() === 'high' || riskLabel.toLowerCase() === 'critical') {
      qs.push(`Why is this ${riskLabel.toLowerCase()} risk?`);
    }
    return qs.slice(0, 4);
  }, [conflict, entityLabel, riskLabel, suggestedQuestions, subjectLabel]);

  useEffect(() => {
    setCopilotMessages([]);
    setCopilotInput('');
  }, [caseId]);

  useEffect(() => {
    copilotBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [copilotMessages, isCopilotSending]);

  const handleCopilotSubmit = useCallback(async (questionOverride?: string) => {
    const question = (questionOverride !== undefined ? questionOverride : copilotInput).trim();
    if (!caseId || !question || isCopilotSending || isLoading) return;

    const userMsg: CopilotMessage = { id: `u-${Date.now()}`, role: 'user', content: question, time: nowTime() };
    const history = copilotMessages.map(m => ({ role: m.role, content: m.content }));
    setCopilotMessages(prev => [...prev, userMsg]);
    setCopilotInput('');
    setIsCopilotSending(true);

    try {
      const result = await aiApi.copilot(caseId, question, history);
      const answer = result?.answer || 'No response available.';
      setCopilotMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: answer,
        time: nowTime(),
      }]);
    } catch {
      const localParts = [
        summary || null,
        conflict ? `Active blocker: ${conflict}` : null,
        recommendation ? `Recommendation: ${recommendation}` : null,
      ].filter(Boolean);
      const fallbackContent = localParts.length
        ? `The AI server isn't reachable right now, but here's what the canonical state shows:\n\n${localParts.join('\n\n')}`
        : 'The AI server is currently unreachable and there is no local canonical data for this item yet.';
      setCopilotMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: fallbackContent,
        time: nowTime(),
      }]);
    } finally {
      setIsCopilotSending(false);
    }
  }, [caseId, copilotInput, copilotMessages, conflict, isLoading, recommendation, summary, isCopilotSending]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 space-y-3 min-h-0">
        {copilotMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 px-4">
            {isLoading ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="h-2 w-24 rounded-full bg-black/5 dark:bg-white/10 animate-pulse" />
                <p className="text-xs text-gray-400">{`Reading ${entityLabel.toLowerCase()} data...`}</p>
              </div>
            ) : (
              <>
                <div className="relative">
                  <div className="super-agent-title-glow pointer-events-none absolute -inset-x-6 -inset-y-4 rounded-full bg-sky-500/5 blur-2xl dark:bg-sky-400/5" />
                  <h1 className="relative flex flex-wrap justify-center gap-x-2 gap-y-1 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                    {['Ask', 'about', 'this', entityLabel.toLowerCase()].map((word, index) => (
                      <span
                        key={`${word}-${index}`}
                        className="super-agent-title-word inline-block"
                        style={{ animationDelay: `${120 + index * 80}ms` }}
                      >
                        {word}
                      </span>
                    ))}
                  </h1>
                </div>
                <div className="flex flex-wrap justify-center gap-2 max-w-md">
                  {effectiveSuggestions.map(q => (
                    <button
                      key={q}
                      onClick={() => handleCopilotSubmit(q)}
                      className="text-[11px] px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-white transition-all font-medium"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          copilotMessages.map((message) => (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start items-end gap-2'}`}>
              {message.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 shadow-sm shadow-secondary/20">
                  <span className="material-symbols-outlined text-white text-[14px]">auto_awesome</span>
                </div>
              )}
              <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed border ${
                message.role === 'user'
                  ? 'bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700 rounded-br-sm'
                  : 'bg-white dark:bg-card-dark text-gray-700 dark:text-gray-200 border-gray-100 dark:border-gray-700 rounded-bl-sm shadow-card'
              }`}>
                <p className="whitespace-pre-wrap">{message.content}</p>
                <span className={`block mt-2 text-[10px] ${message.role === 'user' ? 'text-gray-500' : 'text-gray-400'}`}>{message.time}</span>
              </div>
            </div>
          ))
        )}

        {isCopilotSending && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-card-dark border border-gray-100 dark:border-gray-700 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5 shadow-card">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"></span>
            </div>
          </div>
        )}
        <div ref={copilotBottomRef} />
      </div>

      <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-card-dark flex-shrink-0">
        <div className="relative bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center p-2 focus-within:ring-2 focus-within:ring-secondary/20 focus-within:border-secondary transition-all shadow-card">
          <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg" title="Copilot">
            <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
          </button>
          <input
            value={copilotInput}
            onChange={e => setCopilotInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCopilotSubmit();
              }
            }}
            disabled={!caseId || isCopilotSending || isLoading}
            className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-sm text-gray-800 dark:text-gray-200 px-2 h-9 disabled:opacity-50"
            placeholder={isLoading ? `Reading ${entityLabel.toLowerCase()} data...` : `Ask Copilot about this ${entityLabel.toLowerCase()}...`}
            type="text"
          />
          <div className="flex items-center gap-1">
            {onApply && (
              <button
                onClick={onApply}
                disabled={isLoading}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg disabled:opacity-40"
                title={applyButtonLabel}
              >
                <span className="material-symbols-outlined text-[20px]">open_in_new</span>
              </button>
            )}
            <button
              onClick={() => handleCopilotSubmit()}
              disabled={!copilotInput.trim() || isCopilotSending || isLoading}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
