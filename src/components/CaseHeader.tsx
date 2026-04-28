import React, { useState, useRef, useEffect } from 'react';

export interface CaseHeaderMenuItem {
  label: string;
  icon: string;
  onClick: () => void;
  danger?: boolean;
}

interface CaseHeaderProps {
  caseId: string;
  title: string;
  channel: string;
  customerName: string;
  orderId: string;
  brand: string;
  initials: string;
  avatarColor?: string;
  orderStatus: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  refundStatus: string;
  approvalStatus: string;
  recommendedAction: string;
  conflictDetected?: string | null;
  actions?: React.ReactNode;
  onResolve?: () => void;
  onSnooze?: () => void;
  moreMenuItems?: CaseHeaderMenuItem[];
}

export default function CaseHeader({
  caseId,
  title,
  channel,
  customerName,
  orderId,
  brand,
  initials,
  avatarColor = 'bg-pink-500',
  orderStatus,
  paymentStatus,
  fulfillmentStatus,
  refundStatus,
  approvalStatus,
  recommendedAction,
  conflictDetected,
  actions,
  onResolve,
  onSnooze,
  moreMenuItems = [],
}: CaseHeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  return (
    <div className="w-full">
      <div className="flex justify-between items-start mb-6 gap-4">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className={`w-12 h-12 rounded-full ${avatarColor} flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}>
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate" title={`${caseId}: ${title}`}>{caseId}: {title}</h1>
              <span className="text-sm text-gray-400 flex-shrink-0">via {channel}</span>
            </div>
            <div className="text-sm text-gray-500 mt-1 truncate" title={`${customerName} - ${orderId} - ${brand}`}>
              {customerName} • {orderId} • {brand}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
          <button
            onClick={onResolve}
            disabled={!onResolve}
            title={onResolve ? 'Mark case as resolved' : 'Resolve'}
            className="w-10 h-10 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-600 dark:hover:text-green-400 hover:border-green-200 dark:hover:border-green-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined">check_circle</span>
          </button>
          <button
            onClick={onSnooze}
            disabled={!onSnooze}
            title={onSnooze ? 'Snooze case' : 'Snooze'}
            className="w-10 h-10 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-200 dark:hover:border-amber-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined">snooze</span>
          </button>
          <div className="relative" ref={moreRef}>
            <button
              onClick={() => moreMenuItems.length > 0 && setMoreOpen(p => !p)}
              disabled={moreMenuItems.length === 0}
              title="More actions"
              className="w-10 h-10 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined">more_horiz</span>
            </button>
            {moreOpen && moreMenuItems.length > 0 && (
              <div className="absolute right-0 top-12 z-50 w-48 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl py-1">
                {moreMenuItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => { setMoreOpen(false); item.onClick(); }}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${item.danger ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'}`}
                  >
                    <span className="material-symbols-outlined text-[17px]">{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 mb-4 flex justify-between items-center">
        <div className="flex gap-8 min-w-0">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Order</div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{orderStatus}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Payment</div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{paymentStatus}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Fulfillment</div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{fulfillmentStatus}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Refund</div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{refundStatus}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Approval</div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{approvalStatus}</div>
          </div>
        </div>
        <div className="text-right min-w-0 max-w-xs">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Recommended Action</div>
          <div className="text-sm font-bold text-secondary truncate" title={recommendedAction}>{recommendedAction}</div>
        </div>
      </div>

      {conflictDetected && (
        <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30 rounded-xl p-4 mb-8 flex items-start gap-3">
          <span className="material-symbols-outlined text-red-500 mt-0.5">warning</span>
          <div>
            <h4 className="text-sm font-bold text-red-900 dark:text-red-400 uppercase tracking-wider mb-1">Conflict Detected</h4>
            <p className="text-sm text-red-700 dark:text-red-300">{conflictDetected}</p>
          </div>
        </div>
      )}
    </div>
  );
}
