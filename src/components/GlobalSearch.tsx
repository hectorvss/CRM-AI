import React, { useCallback, useEffect, useRef, useState } from 'react';
import { casesApi, customersApi, ordersApi, paymentsApi } from '../api/client';
import type { NavigateFn } from '../types';

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  onNavigate: NavigateFn;
}

type ResultKind = 'case' | 'customer' | 'order' | 'payment';

interface SearchResult {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle: string;
  meta?: string;
  icon: string;
  iconColor: string;
}

const KIND_PAGE: Record<ResultKind, string> = {
  case:     'inbox',
  customer: 'customers',
  order:    'orders',
  payment:  'payments',
};

const KIND_LABEL: Record<ResultKind, string> = {
  case:     'Case',
  customer: 'Customer',
  order:    'Order',
  payment:  'Payment',
};

const titleCase = (s?: string | null) =>
  s ? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';

function matchesQuery(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function caseToResult(c: any): SearchResult {
  return {
    id:         c.id,
    kind:       'case',
    title:      c.case_number ? `${c.case_number} — ${titleCase(c.type)}` : titleCase(c.type) || 'Case',
    subtitle:   c.ai_diagnosis || c.customer_name || '',
    meta:       titleCase(c.status),
    icon:       'inbox',
    iconColor:  'text-blue-500',
  };
}

function customerToResult(c: any): SearchResult {
  return {
    id:        c.id,
    kind:      'customer',
    title:     c.name || c.email || 'Customer',
    subtitle:  c.email || c.company || '',
    meta:      titleCase(c.segment),
    icon:      'person',
    iconColor: 'text-green-500',
  };
}

function orderToResult(o: any): SearchResult {
  return {
    id:        o.id,
    kind:      'order',
    title:     o.order_number || o.id?.slice(0, 12),
    subtitle:  o.customer_name || titleCase(o.status),
    meta:      o.total_amount != null ? `$${Number(o.total_amount).toFixed(2)}` : undefined,
    icon:      'shopping_bag',
    iconColor: 'text-orange-500',
  };
}

function paymentToResult(p: any): SearchResult {
  return {
    id:        p.id,
    kind:      'payment',
    title:     p.payment_reference || p.id?.slice(0, 12),
    subtitle:  titleCase(p.status),
    meta:      p.amount != null ? `$${Number(p.amount).toFixed(2)}` : undefined,
    icon:      'payments',
    iconColor: 'text-purple-500',
  };
}

export default function GlobalSearch({ open, onClose, onNavigate }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [cases, customers, orders, payments] = await Promise.allSettled([
        casesApi.list({ limit: '50' }),
        customersApi.list({ limit: '50' }),
        ordersApi.list({ limit: '50' }),
        paymentsApi.list({ limit: '50' }),
      ]);

      const allResults: SearchResult[] = [];

      if (cases.status === 'fulfilled') {
        const list = Array.isArray(cases.value) ? cases.value : [];
        list.filter((c: any) =>
          matchesQuery(c.case_number || '', q) ||
          matchesQuery(c.ai_diagnosis || '', q) ||
          matchesQuery(c.type || '', q) ||
          matchesQuery(c.customer_name || '', q)
        ).slice(0, 5).forEach((c: any) => allResults.push(caseToResult(c)));
      }

      if (customers.status === 'fulfilled') {
        const list = Array.isArray(customers.value) ? customers.value : [];
        list.filter((c: any) =>
          matchesQuery(c.name || '', q) ||
          matchesQuery(c.email || '', q) ||
          matchesQuery(c.company || '', q)
        ).slice(0, 4).forEach((c: any) => allResults.push(customerToResult(c)));
      }

      if (orders.status === 'fulfilled') {
        const list = Array.isArray(orders.value) ? orders.value : [];
        list.filter((o: any) =>
          matchesQuery(o.order_number || '', q) ||
          matchesQuery(o.customer_name || '', q) ||
          matchesQuery(o.id || '', q)
        ).slice(0, 4).forEach((o: any) => allResults.push(orderToResult(o)));
      }

      if (payments.status === 'fulfilled') {
        const list = Array.isArray(payments.value) ? payments.value : [];
        list.filter((p: any) =>
          matchesQuery(p.payment_reference || '', q) ||
          matchesQuery(p.id || '', q)
        ).slice(0, 3).forEach((p: any) => allResults.push(paymentToResult(p)));
      }

      setResults(allResults);
      setSelectedIdx(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => search(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  const handleSelect = (result: SearchResult) => {
    onNavigate({ page: KIND_PAGE[result.kind] as any, entityId: result.id, entityType: result.kind });
    onClose();
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      e.preventDefault();
      handleSelect(results[selectedIdx]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Quick navigation shortcuts (when query is empty)
  const quickLinks = [
    { label: 'Inbox',        icon: 'inbox',          page: 'inbox' },
    { label: 'Approvals',    icon: 'check_circle',   page: 'approvals' },
    { label: 'Super Agent',  icon: 'auto_awesome',   page: 'super_agent' },
    { label: 'Workflows',    icon: 'account_tree',   page: 'workflows' },
    { label: 'Reports',      icon: 'bar_chart',      page: 'reports' },
    { label: 'Customers',    icon: 'people',         page: 'customers' },
  ];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 dark:border-gray-800">
          <span className="material-symbols-outlined text-gray-400 text-xl flex-shrink-0">search</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search cases, customers, orders, payments…"
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder:text-gray-400 outline-none"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}
          {!loading && query && (
            <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0">
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          )}
          <kbd className="hidden sm:block text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 flex-shrink-0">Esc</kbd>
        </div>

        {/* Results or quick links */}
        <div className="max-h-80 overflow-y-auto custom-scrollbar">
          {!query.trim() ? (
            <div className="p-3">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">Quick navigation</p>
              <div className="grid grid-cols-3 gap-1.5">
                {quickLinks.map(link => (
                  <button
                    key={link.page}
                    onClick={() => { onNavigate(link.page as any); onClose(); }}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-[18px] text-gray-400">{link.icon}</span>
                    {link.label}
                  </button>
                ))}
              </div>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="py-10 text-center">
              <span className="material-symbols-outlined text-3xl text-gray-300 dark:text-gray-600 block mb-2">search_off</span>
              <p className="text-sm text-gray-500 dark:text-gray-400">No results for <strong>"{query}"</strong></p>
            </div>
          ) : (
            <ul className="p-2">
              {results.map((result, idx) => (
                <li key={`${result.kind}-${result.id}`}>
                  <button
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      idx === selectedIdx
                        ? 'bg-indigo-50 dark:bg-indigo-900/30'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-100 dark:bg-gray-800`}>
                      <span className={`material-symbols-outlined text-[17px] ${result.iconColor}`}>{result.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{result.title}</p>
                      {result.subtitle && (
                        <p className="text-xs text-gray-400 truncate">{result.subtitle}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {result.meta && (
                        <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded font-medium">
                          {result.meta}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-300 dark:text-gray-600 font-medium uppercase tracking-wide">
                        {KIND_LABEL[result.kind]}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 flex items-center gap-4 text-[11px] text-gray-400">
          <span className="flex items-center gap-1"><kbd className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1">↵</kbd> open</span>
          <span className="flex items-center gap-1"><kbd className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
