/**
 * StyledSelect.tsx
 *
 * Drop-in replacement for native <select> that mimics the inbox-style
 * dropdown menu.
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
  menuClassName?: string;
  menuWidth?: number | string;
  columns?: number;
  wrapLabels?: boolean;
}

export default function StyledSelect({
  value,
  onChange,
  children,
  className = '',
  disabled = false,
  placeholder,
  menuClassName = '',
  menuWidth,
  columns = 1,
  wrapLabels = false,
}: StyledSelectProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return;

    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(280, (openAbove ? spaceAbove : spaceBelow) - 12));

    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: menuWidth ?? rect.width,
      top: openAbove ? undefined : rect.bottom + 6,
      bottom: openAbove ? Math.max(8, window.innerHeight - rect.top + 6) : undefined,
      maxHeight: columns > 1 ? undefined : maxHeight,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, options.length, value, placeholder]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        wrapperRef.current
        && !wrapperRef.current.contains(target)
        && menuRef.current
        && !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => updateMenuPosition();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
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

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className={`z-[70] min-w-40 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800 ${columns > 1 ? 'overflow-visible' : 'overflow-y-auto'} ${menuClassName}`.trim()}
        >
          <div
            className={columns > 1 ? 'grid gap-1 px-1 py-1' : ''}
            style={columns > 1 ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange({ target: { value: opt.value } });
                  setOpen(false);
                }}
                className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                  wrapLabels ? 'whitespace-normal break-words' : 'whitespace-nowrap'
                } ${
                  value === opt.value
                    ? 'bg-gray-50 font-semibold text-gray-900 dark:bg-gray-700 dark:text-white'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {options.length === 0 ? (
            <div className="px-4 py-2 text-sm text-gray-400">No options</div>
          ) : null}
        </div>,
        document.body,
      )}
    </div>
  );
}
