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
  const [showCaseBrief, setShowCaseBrief] = useState(false);
  const copilotBottomRef = useRef<HTMLDivElement>(null);
  const welcomeSentForRef = useRef<string | null>(null);

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
    setShowCaseBrief(false);
    welcomeSentForRef.current = null;
  }, [caseId]);

  useEffect(() => {
    copilotBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [copilotMessages, isCopilotSending]);

  useEffect(() => {
    if (!caseId || isLoading) return;
    if (welcomeSentForRef.current === caseId) return;
    welcomeSentForRef.current = caseId;

    const parts: string[] = [];
    parts.push(`I've loaded the full state for ${subjectLabel}.`);
    if (summary) parts.push(summary);
    if (conflict) parts.push(`Active blocker: ${conflict}`);
    if (recommendation) parts.push(`Recommendation: ${recommendation}`);
    parts.push('What would you like to dig into?');

    setCopilotMessages([{
      id: `welcome-${caseId}`,
      role: 'assistant',
      content: parts.join('\n\n'),
      time: nowTime(),
    }]);
  }, [caseId, conflict, isLoading, recommendation, subjectLabel, summary]);

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
      <div className="px-4 pt-3 pb-3 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCaseBrief(true)}
            className={`text-xs font-medium transition-colors ${
              showCaseBrief
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setShowCaseBrief(false)}
            className={`text-xs font-medium transition-colors ${
              !showCaseBrief
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Copilot
          </button>
        </div>
        {showCaseBrief && (
          <span className="ml-2 inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5">
            Details
          </span>
        )}
        {!showCaseBrief && (
          <span className="ml-2 inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5">
            Copilot
          </span>
        )}
      </div>

      {showCaseBrief && (
        <div className="mx-3 mt-2.5 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-card-dark p-4 text-sm space-y-3 flex-shrink-0 shadow-card">
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{summary}</p>
          {conflict && (
            <div className="flex items-start gap-2 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 text-gray-600 dark:text-gray-400">
              <span className="material-symbols-outlined text-red-500 text-[14px] flex-shrink-0 mt-0.5">warning</span>
              <span>{conflict}</span>
            </div>
          )}
          {recommendation && (
            <div className="flex items-start gap-2 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
              <span className="material-symbols-outlined text-secondary text-[14px] flex-shrink-0 mt-0.5">bolt</span>
              <span className="italic text-gray-600 dark:text-gray-400">{recommendation}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 space-y-3 min-h-0">
        {copilotMessages.length === 0 ? (
          <div className="flex flex-col gap-3">
            {isLoading ? (
              <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-card-dark p-4 shadow-card">
                <div className="space-y-2">
                  <div className="h-3.5 w-2/3 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
                  <div className="h-3.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
                  <div className="h-3.5 w-5/6 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
                  <div className="h-3.5 w-3/5 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
                </div>
                <p className="mt-4 text-xs text-gray-400">{`Reading ${entityLabel.toLowerCase()} data...`}</p>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 shadow-sm shadow-secondary/20">
                  <span className="material-symbols-outlined text-white text-[14px]">auto_awesome</span>
                </div>
                <div className="max-w-[88%] rounded-2xl rounded-bl-sm border border-gray-100 dark:border-gray-700 bg-white dark:bg-card-dark p-4 shadow-card">
                  <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                    {`I've loaded the full state for ${subjectLabel}.\n\n${summary}${conflict ? `\n\nActive blocker: ${conflict}` : ''}${recommendation ? `\n\nRecommendation: ${recommendation}` : ''}\n\nWhat would you like to dig into?`}
                  </p>
                  <span className="mt-2 block text-[10px] text-gray-400">{nowTime()}</span>
                </div>
              </div>
            )}
            {!isLoading && (
              <div className="flex flex-wrap gap-2 pl-9">
                {effectiveSuggestions.map(q => (
                  <button
                    key={q}
                    onClick={() => handleCopilotSubmit(q)}
                    className="text-[11px] px-3 py-1.5 rounded-full border border-secondary/30 text-secondary hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-secondary transition-all font-medium"
                  >
                    {q}
                  </button>
                ))}
              </div>
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
