/**
 * StyledSelect.tsx
 *
 * Drop-in replacement for native <select> that mimics the inbox-style
 * dropdown menu (white card · shadow-lg · rounded-xl · py-1 · hover bg).
 *
 * The dropdown menu is rendered through a React portal attached to
 * document.body so it always escapes parent containers with `overflow-hidden`
 * or `overflow-y-auto`, and is positioned with viewport coordinates derived
 * from the trigger button's bounding rect.
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

import React, { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface StyledSelectProps {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  menuWidth?: number;
  columns?: number;
  wrapLabels?: boolean;
}

interface MenuPos {
  top: number;
  left: number;
  width: number;
  placeAbove: boolean;
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);

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

  // Compute menu position relative to viewport whenever it opens or layout changes
  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuMaxH = 288; // tailwind max-h-72
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < menuMaxH + 16 && rect.top > spaceBelow;
    setMenuPos({
      top: placeAbove ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      placeAbove,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = () => updatePosition();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open]);

  // Close on outside click (must check both trigger wrapper AND portal menu)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
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

  const triggerClass = className && className.trim().length > 0
    ? `${className} inline-flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`
    : 'inline-flex items-center justify-between gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        ref={triggerRef}
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

      {open && menuPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuPos.placeAbove ? undefined : `${menuPos.top}px`,
            bottom: menuPos.placeAbove ? `${window.innerHeight - menuPos.top}px` : undefined,
            left: `${menuPos.left}px`,
            minWidth: `${menuPos.width}px`,
            zIndex: 1000,
          }}
          className="max-h-72 overflow-y-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1"
        >
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
        </div>,
        document.body,
      )}
    </div>
  );
}
