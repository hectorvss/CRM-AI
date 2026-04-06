import React from 'react';

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
  actions
}: CaseHeaderProps) {
  return (
    <div className="w-full">
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-full ${avatarColor} flex items-center justify-center text-white font-bold text-lg`}>
            {initials}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{caseId}: {title}</h1>
              <span className="text-sm text-gray-400">via {channel}</span>
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {customerName} • {orderId} • {brand}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <button className="w-10 h-10 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <span className="material-symbols-outlined">check_circle</span>
          </button>
          <button className="w-10 h-10 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <span className="material-symbols-outlined">snooze</span>
          </button>
          <button className="w-10 h-10 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <span className="material-symbols-outlined">more_horiz</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 mb-4 flex justify-between items-center">
        <div className="flex gap-8">
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
        <div className="text-right">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Recommended Action</div>
          <div className="text-sm font-bold text-secondary">{recommendedAction}</div>
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
