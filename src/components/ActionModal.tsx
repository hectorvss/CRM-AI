/**
 * ActionModal.tsx
 *
 * Rich confirmation modal used across Orders, Payments and Returns.
 * Design language matches Settings / Upgrade cards:
 *   rounded-2xl · border-gray-200 · shadow-card
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

export type ModalVariant = 'default' | 'warning' | 'danger';

export interface ModalContextItem {
  label: string;
  value: string;
  accent?: boolean;
}

export interface ModalStep {
  icon?: string;
  text: string;
  detail?: string;
}

export interface ModalConsideration {
  text: string;
  icon?: string;
}

export interface ActionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  variant?: ModalVariant;
  /** Material Symbol name */
  icon: string;
  title: string;
  subtitle: string;
  /** Key–value metadata about the current record */
  context?: ModalContextItem[];
  /** Ordered list of what the action will do */
  steps: ModalStep[];
  /** Caution notices (displayed in amber/red panel) */
  considerations?: ModalConsideration[];
  confirmLabel: string;
  /** When present, renders a textarea above the footer */
  noteLabel?: string;
  notePlaceholder?: string;
  noteValue?: string;
  onNoteChange?: (v: string) => void;
}

// ─── colour maps ────────────────────────────────────────────────────────────

const variantMap: Record<ModalVariant, {
  iconBg: string;
  iconColor: string;
  confirmBtn: string;
  badge: string;
  stepDot: string;
  considerationBg: string;
  considerationText: string;
  considerationBorder: string;
}> = {
  default: {
    iconBg:             'bg-indigo-50 dark:bg-indigo-900/20',
    iconColor:          'text-indigo-600 dark:text-indigo-400',
    confirmBtn:         'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100',
    badge:              'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300 border-indigo-100 dark:border-indigo-800/30',
    stepDot:            'bg-indigo-500',
    considerationBg:    'bg-blue-50 dark:bg-blue-950/20',
    considerationText:  'text-blue-800 dark:text-blue-300',
    considerationBorder:'border-blue-100 dark:border-blue-900/30',
  },
  warning: {
    iconBg:             'bg-amber-50 dark:bg-amber-900/20',
    iconColor:          'text-amber-600 dark:text-amber-400',
    confirmBtn:         'bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600',
    badge:              'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 border-amber-100 dark:border-amber-800/30',
    stepDot:            'bg-amber-500',
    considerationBg:    'bg-amber-50 dark:bg-amber-950/20',
    considerationText:  'text-amber-800 dark:text-amber-300',
    considerationBorder:'border-amber-100 dark:border-amber-900/30',
  },
  danger: {
    iconBg:             'bg-red-50 dark:bg-red-900/20',
    iconColor:          'text-red-600 dark:text-red-400',
    confirmBtn:         'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600',
    badge:              'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 border-red-100 dark:border-red-800/30',
    stepDot:            'bg-red-500',
    considerationBg:    'bg-red-50 dark:bg-red-950/20',
    considerationText:  'text-red-800 dark:text-red-300',
    considerationBorder:'border-red-100 dark:border-red-900/30',
  },
};

// ─── component ──────────────────────────────────────────────────────────────

export function ActionModal({
  open,
  onClose,
  onConfirm,
  loading = false,
  variant = 'default',
  icon,
  title,
  subtitle,
  context,
  steps,
  considerations,
  confirmLabel,
  noteLabel,
  notePlaceholder,
  noteValue,
  onNoteChange,
}: ActionModalProps) {
  const c = variantMap[variant];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[520px] bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden"
          >
            {/* ── Header ── */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${c.iconBg}`}>
                  <span className={`material-symbols-outlined text-[20px] ${c.iconColor}`}>{icon}</span>
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-gray-900 dark:text-white leading-snug">{title}</h2>
                  <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{subtitle}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* ── Scrollable body ── */}
            <div className="px-6 py-5 space-y-5 max-h-[58vh] overflow-y-auto custom-scrollbar">

              {/* Context: current record state */}
              {context && context.length > 0 && (
                <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800">
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Current state</p>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2.5">
                    {context.map((item) => (
                      <div key={item.label}>
                        <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">{item.label}</p>
                        <p className={`text-[13px] font-semibold truncate ${item.accent ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Steps: what will happen */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">What will happen</p>
                <div className="space-y-2.5">
                  {steps.map((step, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex-shrink-0 flex flex-col items-center">
                        <div className={`w-5 h-5 rounded-full ${c.stepDot} flex items-center justify-center`}>
                          <span className="text-[10px] font-bold text-white">{i + 1}</span>
                        </div>
                        {i < steps.length - 1 && (
                          <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 mt-1.5 min-h-[12px]" />
                        )}
                      </div>
                      <div className="pb-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-snug">{step.text}</p>
                        {step.detail && (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{step.detail}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Considerations */}
              {considerations && considerations.length > 0 && (
                <div className={`rounded-xl border ${c.considerationBg} ${c.considerationBorder} p-4`}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className={`material-symbols-outlined text-[16px] ${c.iconColor}`}>
                      {variant === 'danger' ? 'warning' : 'info'}
                    </span>
                    <p className={`text-[11px] font-semibold uppercase tracking-wider ${c.considerationText}`}>
                      {variant === 'danger' ? 'Important — read before confirming' : 'Keep in mind'}
                    </p>
                  </div>
                  <ul className="space-y-1.5">
                    {considerations.map((c2, i) => (
                      <li key={i} className={`flex items-start gap-2 text-[12px] ${c.considerationText} leading-snug`}>
                        <span className="mt-0.5 flex-shrink-0">·</span>
                        {c2.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Optional note textarea */}
              {noteLabel !== undefined && (
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    {noteLabel}
                  </label>
                  <textarea
                    rows={3}
                    value={noteValue ?? ''}
                    onChange={(e) => onNoteChange?.(e.target.value)}
                    placeholder={notePlaceholder}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3.5 py-2.5 text-[13px] text-gray-900 dark:text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 dark:focus:border-indigo-700 transition-all"
                  />
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={`px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 ${c.confirmBtn}`}
              >
                {loading && (
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                )}
                {loading ? 'Processing…' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
