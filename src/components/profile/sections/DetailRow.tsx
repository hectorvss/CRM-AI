import React, { ReactNode } from 'react';

// Single label/value row inside a DetailSection. Two display modes:
//   • value (string) → truncated text with title-attribute fallback for hover.
//   • children       → arbitrary inline editor (input, dropdown, toggle, …).
//
// Width is fixed at 113px for the label column to match the Inbox detail rail
// alignment, so multiple rows stack into a clean vertical grid.
export default function DetailRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center min-h-8 w-full min-w-0 overflow-hidden py-1">
      <span className="w-[113px] flex-shrink-0 text-[13px] text-[#646462] truncate">{label}</span>
      <div className="flex-1 min-w-0 px-1 overflow-hidden">
        {children !== undefined ? (
          children
        ) : (
          <span className="text-[13px] text-[#1a1a1a] truncate block" title={value || undefined}>
            {value || '—'}
          </span>
        )}
      </div>
    </div>
  );
}
