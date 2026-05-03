import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ExternalLink, Sparkles } from 'lucide-react';
import { aiApi } from '../api/client';
import {
  AssistantMessage,
  Markdown,
  StreamingCaret,
  ThinkingPill,
  UserMessage,
  useAutoScroll,
} from './ai-chat/ChatPrimitives';

type CopilotMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
  pending?: boolean;
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
  onApply,
  applyButtonLabel = 'Apply to Composer',
}: CaseCopilotPanelProps) {
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([]);
  const [copilotInput, setCopilotInput] = useState('');
  const [isCopilotSending, setIsCopilotSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const { containerRef, sentinelRef } = useAutoScroll([copilotMessages, isCopilotSending]);

  // Autosize textarea.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 38), 140)}px`;
  }, [copilotInput]);

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
      <div ref={containerRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4 min-h-0">
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
                      className="text-[12px] px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-white transition-all font-medium"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          copilotMessages.map((message) =>
            message.role === 'user' ? (
              <UserMessage key={message.id}>{message.content}</UserMessage>
            ) : (
              <AssistantMessage key={message.id}>
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                  <Sparkles size={12} className="text-secondary" />
                  <span>Copilot</span>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <span className="normal-case tracking-normal text-gray-400">{message.time}</span>
                </div>
                <Markdown text={message.content} />
              </AssistantMessage>
            ),
          )
        )}

        {isCopilotSending && (
          <ThinkingPill detail={`Reading ${entityLabel.toLowerCase()} context…`} />
        )}
        <div ref={sentinelRef} />
      </div>

      <div className="p-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-card-dark flex-shrink-0">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow focus-within:shadow-md focus-within:border-secondary/40 dark:border-gray-700 dark:bg-gray-900">
          <textarea
            ref={inputRef}
            value={copilotInput}
            onChange={e => setCopilotInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCopilotSubmit();
              }
            }}
            disabled={!caseId || isCopilotSending || isLoading}
            rows={1}
            className="block w-full resize-none bg-transparent border-0 outline-none px-4 pt-3 pb-1 text-[14px] leading-6 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 disabled:opacity-50"
            placeholder={isLoading ? `Reading ${entityLabel.toLowerCase()} data...` : `Ask about this ${entityLabel.toLowerCase()}...`}
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-1 pl-1 text-[11px] text-gray-400">
              <Sparkles size={12} className="text-secondary" />
              <span>Copilot</span>
            </div>
            <div className="flex items-center gap-1">
              {onApply && (
                <button
                  onClick={onApply}
                  disabled={isLoading}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200 disabled:opacity-40"
                  title={applyButtonLabel}
                >
                  <ExternalLink size={14} />
                </button>
              )}
              <button
                onClick={() => handleCopilotSubmit()}
                disabled={!copilotInput.trim() || isCopilotSending || isLoading}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-black text-white transition-opacity hover:opacity-80 disabled:opacity-30 dark:bg-white dark:text-black"
              >
                {isCopilotSending ? <StreamingCaret /> : <ArrowUp size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
