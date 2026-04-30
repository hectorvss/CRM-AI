/**
 * StyledSelect.tsx
 *
 * Drop-in replacement for native <select> that mimics the inbox-style
 * dropdown menu (white card · shadow-lg · rounded-xl · py-1 · hover bg).
 *
 * Same API as <select>:
 *   <StyledSelect value={x} onChange={(e) => setX(e.target.value)} className="...">
 *     <option value="a">Option A</option>
 *     <option value="b">Option B</option>
 *   </StyledSelect>
 *
 * The onChange handler receives a synthetic event { target: { value } } so
 * existing handlers (`e.target.value`) keep working without modification.
 */

import React, { ReactNode, useEffect, useRef, useState } from 'react';

interface StyledSelectProps {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export default function StyledSelect({
  value,
  onChange,
  children,
  className = '',
  disabled = false,
  placeholder,
}: StyledSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Extract <option> children into [{ value, label }]
  const options: { value: string; label: string }[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const isOption = (child.type as any) === 'option';
    if (!isOption) return;
    const props = child.props as { value?: any; children?: ReactNode };
    const labelText = String(props.children ?? '');
    const v = props.value !== undefined ? String(props.value) : labelText;
    options.push({ value: v, label: labelText });
  });

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected?.label ?? placeholder ?? options[0]?.label ?? '';

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Pass through whatever className the caller used; we only enforce the
  // structural classes needed for the trigger button to behave correctly.
  const triggerClass = className && className.trim().length > 0
    ? `${className} inline-flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`
    : 'inline-flex items-center justify-between gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={triggerClass}
      >
        <span className="truncate text-left flex-1">{displayLabel}</span>
        <span
          className={`material-symbols-outlined text-base text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        >
          expand_more
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-full max-h-72 overflow-y-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange({ target: { value: opt.value } });
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors whitespace-nowrap ${
                value === opt.value
                  ? 'bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
          {options.length === 0 && (
            <div className="px-4 py-2 text-sm text-gray-400">No options</div>
          )}
        </div>
      )}
    </div>
  );
}
