import React, { useEffect, useState, useCallback } from 'react';
import { superAgentApi } from '../../api/client';

export interface ConversationSummary {
  id: string;
  title: string;
  preview: string;
  turnCount: number;
  updatedAt: string;
  createdAt: string;
}

interface Props {
  open: boolean;
  onToggle: () => void;
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNewConversation: () => void;
  /** Bumped by the parent after every assistant turn to refresh the list. */
  refreshKey?: number;
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const ConversationsSidebar: React.FC<Props> = ({
  open,
  onToggle,
  activeSessionId,
  onSelect,
  onNewConversation,
  refreshKey,
}) => {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await superAgentApi.listSessions(50);
      setItems(data.sessions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load, refreshKey]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await superAgentApi.deleteSession(id);
        setItems((prev) => prev.filter((item) => item.id !== id));
        if (id === activeSessionId) onNewConversation();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete');
      } finally {
        setConfirmDeleteId(null);
      }
    },
    [activeSessionId, onNewConversation],
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="Open conversations"
        // Match the SaaS brand mark used in the left nav (Sidebar.tsx):
        // black square + graphic_eq icon (inverted in dark mode).
        className="absolute right-5 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-md bg-black shadow-sm transition hover:opacity-80 dark:bg-white"
      >
        <span className="material-symbols-outlined text-[18px] text-white dark:text-black">graphic_eq</span>
      </button>
    );
  }

  return (
    <aside className="flex h-full w-[320px] flex-col border-l border-black/5 bg-white dark:border-white/10 dark:bg-[#171717]">
      <header className="flex items-center justify-between gap-2 border-b border-black/5 px-5 py-4 dark:border-white/10">
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Threads</span>
          <h2 className="text-[15px] font-semibold text-gray-950 dark:text-white">Conversations</h2>
        </div>
        <button
          type="button"
          onClick={onToggle}
          title="Hide sidebar"
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </header>

      <div className="px-5 py-3">
        <button
          type="button"
          onClick={onNewConversation}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-black/90 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/90"
        >
          <span className="material-symbols-outlined text-[16px]">edit_square</span>
          New conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {loading && items.length === 0 ? (
          <div className="flex flex-col gap-2 px-3 py-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />
            ))}
          </div>
        ) : error ? (
          <div className="px-3 py-6 text-center text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="material-symbols-outlined text-[28px] text-gray-300 dark:text-gray-600">forum</span>
            <p className="text-sm text-gray-500 dark:text-gray-400">No saved conversations yet.</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">Anything you ask the agent will appear here.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1 px-2">
            {items.map((item) => {
              const isActive = item.id === activeSessionId;
              const isConfirming = confirmDeleteId === item.id;
              return (
                <li key={item.id}>
                  <div
                    className={`group relative rounded-2xl border px-3 py-2.5 transition ${
                      isActive
                        ? 'border-black/10 bg-gray-50 dark:border-white/15 dark:bg-white/5'
                        : 'border-transparent hover:border-black/5 hover:bg-gray-50/70 dark:hover:border-white/10 dark:hover:bg-white/5'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(item.id)}
                      className="block w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-1 text-[13px] font-semibold text-gray-950 dark:text-white">
                          {item.title}
                        </p>
                        {/* Reserve space for the hover delete icon so the
                            timestamp doesn't sit underneath it. */}
                        <span className="shrink-0 text-[10px] text-gray-400 transition-opacity group-hover:opacity-0">
                          {formatRelative(item.updatedAt)}
                        </span>
                      </div>
                      {item.preview ? (
                        <p className="mt-0.5 line-clamp-1 pr-6 text-[11.5px] text-gray-500 dark:text-gray-400">
                          {item.preview}
                        </p>
                      ) : null}
                    </button>
                    {isConfirming ? (
                      <div className="mt-2 flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-full px-3 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item.id)}
                          className="rounded-full bg-red-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(item.id);
                        }}
                        title="Delete conversation"
                        className="absolute right-2 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-gray-400 opacity-0 shadow-sm transition group-hover:opacity-100 hover:text-red-600 dark:bg-[#1b1b1b] dark:hover:text-red-400"
                      >
                        <span className="material-symbols-outlined text-[14px]">delete</span>
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
};

export default ConversationsSidebar;
