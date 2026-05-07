import React, { ReactNode, useState } from 'react';

// Collapsible card with title + chevron, used across the Inbox detail rail and
// (now) the Profile page. Visual rules: no inner padding on the header (handled
// by the chevron button's own px-6/py-2), inner content gets px-6 by default.
//
// The component is intentionally generic — no props that tie it to inbox /
// cases. The only opinionated bit is the bottom border, which matches the way
// Inbox stacks sections vertically. If you need a different separator, wrap it.
export default function DetailSection({
  title,
  children,
  defaultOpen = true,
  helper,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  helper?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#e9eae6] pb-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full h-8 px-6 py-2 hover:bg-[#f8f8f7]"
      >
        <span className="text-[13px] font-semibold text-[#1a1a1a]">{title}</span>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-3.5 h-3.5 text-[#646462] transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
      </button>
      {open && (
        <div className="px-6">
          {helper && <p className="text-[12px] text-[#646462] -mt-1 mb-2">{helper}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
