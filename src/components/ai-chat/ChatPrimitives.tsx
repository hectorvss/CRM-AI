import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Wrench, X as XIcon } from 'lucide-react';

// ── Markdown ──────────────────────────────────────────────────────────────
//
// Lightweight inline markdown renderer (no external dep).
// Supports: ``` fenced code, `inline code`, **bold**, *italic*, _italic_,
// unordered / ordered lists, blank-line paragraph breaks.
// Intentionally small — for richer content we can swap in react-markdown
// later without changing component callers.

type Block =
  | { type: 'code'; lang: string; content: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'p'; content: string };

function parseBlocks(input: string): Block[] {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const lang = fence[1] || '';
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: 'code', lang, content: buf.join('\n') });
      continue;
    }

    // Lists
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph: gather until blank or block boundary
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'p', content: buf.join('\n') });
  }
  return blocks;
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Order: inline code → bold → italic. Tokenize sequentially.
  const nodes: React.ReactNode[] = [];
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${idx++}`;
    if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="rounded bg-gray-100 px-1 py-0.5 text-[0.85em] font-mono text-gray-800 dark:bg-gray-800 dark:text-gray-200">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key} className="font-semibold">{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export const Markdown: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
  if (!text) return null;
  const blocks = parseBlocks(text);
  return (
    <div className={`space-y-3 text-[15px] leading-7 text-gray-900 dark:text-gray-100 ${className}`}>
      {blocks.map((block, bIdx) => {
        if (block.type === 'code') {
          return (
            <pre
              key={`b-${bIdx}`}
              className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[13px] font-mono text-gray-800 dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-200"
            >
              <code>{block.content}</code>
            </pre>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={`b-${bIdx}`} className="list-disc space-y-1 pl-5 marker:text-gray-400">
              {block.items.map((item, idx) => (
                <li key={`b-${bIdx}-${idx}`}>{renderInline(item, `b-${bIdx}-${idx}`)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={`b-${bIdx}`} className="list-decimal space-y-1 pl-5 marker:text-gray-400">
              {block.items.map((item, idx) => (
                <li key={`b-${bIdx}-${idx}`}>{renderInline(item, `b-${bIdx}-${idx}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={`b-${bIdx}`} className="whitespace-pre-wrap">
            {renderInline(block.content, `b-${bIdx}`)}
          </p>
        );
      })}
    </div>
  );
};

// ── Streaming caret ───────────────────────────────────────────────────────

export const StreamingCaret: React.FC = () => {
  return <span aria-hidden className="ai-chat-caret">▌</span>;
};

// ── Thinking indicator (flat, no pill) ────────────────────────────────────
// Renders the label and three pulsing dots inline, with no border/background.

export const ThinkingPill: React.FC<{ label?: string; detail?: string | null }> = ({ label = 'Thinking', detail }) => {
  return (
    <div className="ai-chat-message-in flex flex-col gap-1">
      <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 dark:text-gray-400">
        <span>{label}</span>
        <span className="inline-flex items-center gap-1 text-gray-400 dark:text-gray-500">
          <span className="ai-chat-thinking-dot" />
          <span className="ai-chat-thinking-dot" />
          <span className="ai-chat-thinking-dot" />
        </span>
      </span>
      {detail ? (
        <span className="text-[12px] text-gray-400 dark:text-gray-500">{detail}</span>
      ) : null}
    </div>
  );
};

// ── Tool call card ────────────────────────────────────────────────────────

export type ToolCallStatus = 'running' | 'completed' | 'failed';

export type ToolCallData = {
  id: string;
  name: string;
  status: ToolCallStatus;
  args?: unknown;
  result?: string;
  detail?: string | null;
};

function formatJson(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export const ToolCallCard: React.FC<{ call: ToolCallData; defaultOpen?: boolean }> = ({ call, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [resultExpanded, setResultExpanded] = useState(false);

  const argsString = formatJson(call.args);
  const resultString = call.result ?? '';
  const truncated = resultString.length > 200 ? `${resultString.slice(0, 200)}…` : resultString;

  const statusBadge =
    call.status === 'completed' ? (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
        <Check size={12} strokeWidth={3} />
      </span>
    ) : call.status === 'failed' ? (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300">
        <XIcon size={12} strokeWidth={3} />
      </span>
    ) : (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
        <span className="ai-chat-thinking-dot" style={{ width: '0.4rem', height: '0.4rem' }} />
      </span>
    );

  return (
    <div className="ai-chat-message-in overflow-hidden rounded-xl border border-gray-200 bg-white text-[13px] dark:border-gray-700 dark:bg-gray-900/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
      >
        <ChevronRight
          size={14}
          className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <Wrench size={13} className="text-gray-500 dark:text-gray-400" />
        <span className="font-mono text-[12.5px] text-gray-800 dark:text-gray-200">{call.name}</span>
        {call.detail ? (
          <span className="truncate text-[12px] text-gray-400 dark:text-gray-500">— {call.detail}</span>
        ) : null}
        <span className="ml-auto flex items-center gap-2">
          {statusBadge}
        </span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-gray-100 bg-gray-50/60 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-950/40">
          {argsString ? (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">Arguments</div>
              <pre className="max-h-48 overflow-auto rounded-lg bg-white px-2.5 py-2 font-mono text-[12px] text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                {argsString}
              </pre>
            </div>
          ) : null}
          {resultString ? (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">Result</span>
                {resultString.length > 200 ? (
                  <button
                    type="button"
                    onClick={() => setResultExpanded((v) => !v)}
                    className="text-[11px] text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {resultExpanded ? 'Collapse' : 'Expand'}
                  </button>
                ) : null}
              </div>
              <pre className="max-h-64 overflow-auto rounded-lg bg-white px-2.5 py-2 font-mono text-[12px] text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                {resultExpanded ? resultString : truncated}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

// ── Message bubble shells ─────────────────────────────────────────────────

export const UserMessage: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <div className="ai-chat-message-in flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-[15px] leading-7 text-gray-900 shadow-sm dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-100">
        {children}
      </div>
    </div>
  );
};

export const AssistantMessage: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <div className="ai-chat-message-in flex flex-col gap-2 px-1 text-gray-900 dark:text-gray-100">
      {children}
    </div>
  );
};

// ── Auto-scroll hook ──────────────────────────────────────────────────────
//
// Scrolls to bottom on dependency change unless the user has scrolled up.
// Returns the ref to attach to the scroll container and a sentinel ref.

export function useAutoScroll<T>(deps: T) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handle = () => {
      const slack = 64;
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < slack;
    };
    el.addEventListener('scroll', handle, { passive: true });
    return () => el.removeEventListener('scroll', handle);
  }, []);

  useEffect(() => {
    if (!stickRef.current) return;
    sentinelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps]);

  return { containerRef, sentinelRef };
}
