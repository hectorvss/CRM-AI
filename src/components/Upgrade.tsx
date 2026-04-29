import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MinimalCategoryShell } from './MinimalCategoryShell';
import PlansTab from './upgrade/PlansTab';
import CreditsTab from './upgrade/CreditsTab';
import SeatsTab from './upgrade/SeatsTab';
import BillingHistoryTab from './upgrade/BillingHistoryTab';
import UsageTab from './upgrade/UsageTab';

type UpgradeTab = 'plans' | 'credits' | 'seats' | 'billing_history' | 'usage';

export default function Upgrade() {
  const [activeTab, setActiveTab] = useState<UpgradeTab>('plans');

  const tabs: { id: UpgradeTab; label: string }[] = [
    { id: 'plans', label: 'Plans' },
    { id: 'credits', label: 'Credits' },
    { id: 'seats', label: 'Seats' },
    { id: 'billing_history', label: 'Billing History' },
    { id: 'usage', label: 'Usage' },
  ];

  return (
    <MinimalCategoryShell
      title="Billing & Plans"
      subtitle="Manage your subscription, AI credits, seats, and billing usage."
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={tabId => setActiveTab(tabId as UpgradeTab)}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="h-full"
        >
          {activeTab === 'plans' && <PlansTab />}
          {activeTab === 'credits' && <CreditsTab />}
          {activeTab === 'seats' && <SeatsTab />}
          {activeTab === 'billing_history' && <BillingHistoryTab />}
          {activeTab === 'usage' && <UsageTab />}
        </motion.div>
      </AnimatePresence>
    </MinimalCategoryShell>
  );
}
