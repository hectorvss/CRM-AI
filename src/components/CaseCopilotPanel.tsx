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
  const copilotInputRef = useRef<HTMLInputElement>(null);
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
      <div className="px-3 pt-3 pb-2.5 flex items-center gap-2 flex-wrap border-b border-gray-100 dark:border-gray-700/60 flex-shrink-0">
        <button
          onClick={() => setShowCaseBrief(prev => !prev)}
          title="Toggle case brief"
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
            showCaseBrief
              ? 'bg-purple-100 dark:bg-purple-900/30 text-secondary border-purple-200 dark:border-purple-700'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700 hover:border-secondary/50 hover:text-secondary'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">description</span>
          Brief
        </button>

        {onOpenModule && (
          <button
            onClick={onOpenModule}
            title={moduleButtonLabel}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700 hover:border-secondary/50 hover:text-secondary transition-all"
          >
            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            {moduleButtonLabel}
          </button>
        )}

        <div className={`ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
          riskLabel.toLowerCase() === 'high' || riskLabel.toLowerCase() === 'critical'
            ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-800/30'
            : riskLabel.toLowerCase() === 'medium'
            ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-100 dark:border-yellow-800/30'
            : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-800/30'
        }`}>
          <span className="material-symbols-outlined text-[13px]">trending_up</span>
          {riskLabel}
        </div>
      </div>

      {showCaseBrief && (
        <div className="mx-3 mt-2.5 bg-white dark:bg-card-dark rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-xs space-y-2 flex-shrink-0 shadow-card">
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{summary}</p>
          {conflict && (
            <div className="flex items-start gap-1.5 bg-white dark:bg-card-dark rounded-lg p-2 border border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400">
              <span className="material-symbols-outlined text-red-500 text-[13px] flex-shrink-0 mt-0.5">warning</span>
              <span>{conflict}</span>
            </div>
          )}
          {recommendation && (
            <div className="flex items-start gap-1.5 bg-white dark:bg-card-dark rounded-lg p-2 border border-gray-100 dark:border-gray-700">
              <span className="material-symbols-outlined text-secondary text-[13px] flex-shrink-0 mt-0.5">bolt</span>
              <span className="italic text-gray-600 dark:text-gray-400">{recommendation}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 space-y-3 min-h-0">
        {copilotMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-10">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center mb-3 border border-purple-100 dark:border-purple-800/30 shadow-sm">
              <span className={`material-symbols-outlined text-secondary text-2xl ${isLoading ? 'animate-pulse' : ''}`}>auto_awesome</span>
            </div>
            {isLoading ? (
              <p className="text-sm text-gray-400">{`Reading ${entityLabel.toLowerCase()} data...`}</p>
            ) : (
              <>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{emptyTitle}</p>
                <p className="text-[11px] text-gray-400 max-w-[220px] leading-relaxed">{emptySubtitle}</p>
              </>
            )}
          </div>
        ) : (
          copilotMessages.map((message, idx) => (
            <React.Fragment key={message.id}>
              <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start items-end gap-2'}`}>
                {message.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 shadow-sm shadow-secondary/20">
                    <span className="material-symbols-outlined text-white text-[13px]">auto_awesome</span>
                  </div>
                )}
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed border ${
                  message.role === 'user'
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600 rounded-br-sm'
                    : 'bg-white dark:bg-card-dark text-gray-700 dark:text-gray-200 border-gray-100 dark:border-gray-700 rounded-bl-sm shadow-card'
                }`}>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <span className={`block mt-1 text-[10px] ${message.role === 'user' ? 'text-gray-500' : 'text-gray-400'}`}>{message.time}</span>
                </div>
              </div>

              {message.role === 'assistant' && idx === 0 && copilotMessages.length === 1 && !isCopilotSending && (
                <div className="flex flex-wrap gap-1.5 pl-8 pt-0.5">
                  {effectiveSuggestions.map(q => (
                    <button
                      key={q}
                      onClick={() => handleCopilotSubmit(q)}
                      className="text-[11px] px-2.5 py-1.5 rounded-full border border-secondary/30 text-secondary hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-secondary transition-all font-medium"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </React.Fragment>
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
          <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg">
            <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
          </button>
          <input
            ref={copilotInputRef}
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
                <span className="material-symbols-outlined text-[20px]">drive_file_move</span>
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
