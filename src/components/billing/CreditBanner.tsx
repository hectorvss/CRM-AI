import React, { useState } from 'react';
import { useAICredits } from '../../hooks/useAICredits';
import UpgradeModal from './UpgradeModal';

/**
 * Top-of-page banner that surfaces AI credit state.
 *  - >= 80% used  → yellow banner ("consider upgrading")
 *  - 100% used + flexible billing on → amber banner ("using post-paid")
 *  - 100% used + flexible billing off → red banner ("blocked, add credits")
 */
export default function CreditBanner() {
  const { data, blocked, warning, flexibleActive } = useAICredits();
  const [modalOpen, setModalOpen] = useState(false);

  if (!data || data.unlimited) return null;
  if (!warning && !blocked && !flexibleActive) return null;

  const tone = blocked ? 'red' : flexibleActive ? 'amber' : 'yellow';
  const colors: Record<string, string> = {
    red: 'bg-red-50 border-red-300 text-red-800',
    amber: 'bg-amber-50 border-amber-300 text-amber-800',
    yellow: 'bg-yellow-50 border-yellow-300 text-yellow-800',
  };

  const message = blocked
    ? `AI credits exhausted (${data.usedThisPeriod.toLocaleString()}/${data.included.toLocaleString()}). AI features are paused — add a top-up pack or upgrade your plan to continue.`
    : flexibleActive
      ? `On flexible billing (€19/1k credits). ${data.flexibleUsedThisPeriod.toLocaleString()} extra credits used this period.`
      : `AI credits at ${data.percentUsed}% — consider upgrading your plan to avoid interruption.`;

  return (
    <>
      <div
        className={`flex items-center justify-between gap-4 border rounded px-4 py-2 mb-3 text-sm ${colors[tone]}`}
        role="alert"
      >
        <span>{message}</span>
        <button
          onClick={() => setModalOpen(true)}
          className="font-semibold underline hover:no-underline"
        >
          {blocked ? 'Add credits' : flexibleActive ? 'Manage' : 'Upgrade'}
        </button>
      </div>
      {modalOpen && <UpgradeModal onClose={() => setModalOpen(false)} usage={data} />}
    </>
  );
}
