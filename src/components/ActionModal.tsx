/**
 * ActionModal.tsx
 *
 * Rich confirmation modal used across Orders, Payments and Returns.
 * Design language matches Settings / Upgrade cards:
 *   rounded-[12px] · border-[#e9eae6] · shadow-[0px_1px_2px_rgba(20,20,20,0.04)]
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
    iconBg:             'bg-[#f8f8f7] dark:bg-[#f8f8f7]',
    iconColor:          'text-[#1a1a1a] dark:text-[#1a1a1a]',
    confirmBtn:         'bg-[#1a1a1a] text-white hover:bg-gray-800 dark:bg-white dark:text-[#1a1a1a] dark:hover:bg-[#ededea]',
    badge:              'bg-[#f8f8f7] text-[#1a1a1a] dark:bg-[#f8f8f7] dark:text-[#1a1a1a] border-indigo-100 dark:border-indigo-800/30',
    stepDot:            'bg-[#f8f8f7]0',
    considerationBg:    'bg-[#f8f8f7] dark:bg-blue-950/20',
    considerationText:  'text-blue-800 dark:text-blue-300',
    considerationBorder:'border-blue-100 dark:border-blue-900/30',
  },
  warning: {
    iconBg:             'bg-[#f8f8f7] dark:bg-amber-900/20',
    iconColor:          'text-[#1a1a1a] dark:text-[#1a1a1a]',
    confirmBtn:         'bg-[#1a1a1a] text-white hover:bg-[#1a1a1a] dark:bg-[#1a1a1a] dark:hover:bg-[#1a1a1a]',
    badge:              'bg-[#f8f8f7] text-[#1a1a1a] dark:bg-amber-900/20 dark:text-amber-300 border-amber-100 dark:border-amber-800/30',
    stepDot:            'bg-[#1a1a1a]',
    considerationBg:    'bg-[#f8f8f7] dark:bg-amber-950/20',
    considerationText:  'text-amber-800 dark:text-amber-300',
    considerationBorder:'border-amber-100 dark:border-amber-900/30',
  },
  danger: {
    iconBg:             'bg-[#f8f8f7] dark:bg-red-900/20',
    iconColor:          'text-[#1a1a1a] dark:text-[#1a1a1a]',
    confirmBtn:         'bg-[#1a1a1a] text-white hover:bg-[#1a1a1a] dark:bg-[#1a1a1a] dark:hover:bg-[#1a1a1a]',
    badge:              'bg-[#f8f8f7] text-[#1a1a1a] dark:bg-red-900/20 dark:text-red-300 border-red-100 dark:border-red-800/30',
    stepDot:            'bg-[#1a1a1a]',
    considerationBg:    'bg-[#f8f8f7] dark:bg-red-950/20',
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
            className="w-full max-w-[520px] overflow-hidden rounded-[12px] border border-[#e9eae6] bg-white shadow-2xl"
          >
            {/* ── Header ── */}
            <div className="flex items-start justify-between gap-4 border-b border-[#e9eae6] px-6 py-5">
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[12px] ${c.iconBg}`}>
                  <span className={`material-symbols-outlined text-[22px] ${c.iconColor}`}>{icon}</span>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a4a4a2]">Action</p>
                  <h2 className="text-[14px] font-bold leading-tight text-[#1a1a1a]">{title}</h2>
                  <p className="mt-0.5 text-[12px] leading-snug text-[#646462] dark:text-[#a4a4a2]">{subtitle}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#646462] transition hover:bg-[#ededea] hover:text-[#1a1a1a] dark:hover:text-white"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* ── Scrollable body ── */}
            <div className="custom-scrollbar max-h-[58vh] space-y-5 overflow-y-auto px-6 py-5">

              {/* Context: current record state */}
              {context && context.length > 0 && (
                <div className="overflow-hidden rounded-[12px] border border-[#e9eae6] bg-[#f8f8f7]/70">
                  <div className="border-b border-[#e9eae6] px-4 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a4a4a2]">Current state</p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3.5">
                    {context.map((item) => (
                      <div key={item.label}>
                        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a4a4a2]">{item.label}</p>
                        <p className={`truncate text-[13px] font-semibold ${item.accent ? 'text-[#1a1a1a] dark:text-[#1a1a1a]' : 'text-[#1a1a1a]'}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Steps: what will happen */}
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a4a4a2]">What will happen</p>
                <div className="space-y-2.5">
                  {steps.map((step, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-shrink-0 flex-col items-center">
                        <div className={`flex h-5 w-5 items-center justify-center rounded-full ${c.stepDot}`}>
                          <span className="text-[10px] font-bold text-white">{i + 1}</span>
                        </div>
                        {i < steps.length - 1 && (
                          <div className="mt-1.5 min-h-[12px] w-px flex-1 bg-black/10 dark:bg-white/10" />
                        )}
                      </div>
                      <div className="min-w-0 pb-1">
                        <p className="text-[13px] font-semibold leading-snug text-[#1a1a1a]">{step.text}</p>
                        {step.detail && (
                          <p className="mt-0.5 text-[11px] leading-relaxed text-[#646462] dark:text-[#a4a4a2]">{step.detail}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Considerations */}
              {considerations && considerations.length > 0 && (
                <div className={`rounded-[12px] border p-4 ${c.considerationBg} ${c.considerationBorder}`}>
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className={`material-symbols-outlined text-[16px] ${c.iconColor}`}>
                      {variant === 'danger' ? 'warning' : 'info'}
                    </span>
                    <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${c.considerationText}`}>
                      {variant === 'danger' ? 'Important — read before confirming' : 'Keep in mind'}
                    </p>
                  </div>
                  <ul className="space-y-1.5">
                    {considerations.map((c2, i) => (
                      <li key={i} className={`flex items-start gap-2 text-[12px] leading-snug ${c.considerationText}`}>
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
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#646462]">
                    {noteLabel}
                  </label>
                  <textarea
                    rows={3}
                    value={noteValue ?? ''}
                    onChange={(e) => onNoteChange?.(e.target.value)}
                    placeholder={notePlaceholder}
                    className="w-full resize-none rounded-[12px] border border-[#e9eae6] bg-white px-3.5 py-2.5 text-[13px] text-[#1a1a1a] placeholder-gray-400 outline-none transition focus:border-gray-950 dark:focus:border-white"
                  />
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="flex items-center justify-between gap-3 border-t border-[#e9eae6] bg-[#f8f8f7]/50 px-6 py-4 dark:bg-white/[0.02]">
              <button
                onClick={onClose}
                className="rounded-full px-4 py-2 text-[13px] font-medium text-[#646462] transition hover:text-[#1a1a1a] dark:text-[#c4c4c2] dark:hover:text-white"
              >
                ← Back
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={`flex items-center gap-2 rounded-full px-5 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${c.confirmBtn}`}
              >
                {loading && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
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
