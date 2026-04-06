import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
      {/* Header */}
      <div className="p-6 pb-0 flex-shrink-0 z-20">
        <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Billing & Plans</h1>
              <p className="text-xs text-gray-500 mt-0.5">Manage your subscription, AI credits, seats, and billing usage.</p>
            </div>
          </div>
          <div className="px-6 flex items-center space-x-8 border-t border-gray-100 dark:border-gray-800 pt-3">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-sm transition-colors border-b-2 ${
                  activeTab === tab.id 
                    ? 'font-bold text-gray-900 dark:text-white border-black dark:border-white' 
                    : 'font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-transparent hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="w-full h-full">
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
        </div>
      </div>
      </div>
    </div>
  );
}
