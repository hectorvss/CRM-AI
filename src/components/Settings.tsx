import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import WorkspaceTab from './settings/Workspace';
import TeamsRolesTab from './settings/TeamsRoles';
import NotificationsTab from './settings/Notifications';
import SecurityAuditTab from './settings/SecurityAudit';
import BillingUsageTab from './settings/BillingUsage';
import DataPrivacyTab from './settings/DataPrivacy';
import PersonalTab from './settings/Personal';

type SettingsTab = 'workspace' | 'teams_roles' | 'notifications' | 'security_audit' | 'billing_usage' | 'data_privacy' | 'personal';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('workspace');

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'workspace', label: 'Workspace' },
    { id: 'teams_roles', label: 'Teams & Roles' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'security_audit', label: 'Security & Audit' },
    { id: 'billing_usage', label: 'Billing & Usage' },
    { id: 'data_privacy', label: 'Data & Privacy' },
    { id: 'personal', label: 'Personal' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
      {/* Header */}
      <div className="p-6 pb-0 flex-shrink-0 z-20">
        <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Settings & Administration</h1>
              <p className="text-xs text-gray-500 mt-0.5">Manage your workspace profile, business hours, and branding</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors">Discard Changes</button>
              <button className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-bold shadow-md hover:opacity-90 transition-all">Save changes</button>
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
              {activeTab === 'workspace' && <WorkspaceTab />}
              {activeTab === 'teams_roles' && <TeamsRolesTab />}
              {activeTab === 'notifications' && <NotificationsTab />}
              {activeTab === 'security_audit' && <SecurityAuditTab />}
              {activeTab === 'billing_usage' && <BillingUsageTab />}
              {activeTab === 'data_privacy' && <DataPrivacyTab />}
              {activeTab === 'personal' && <PersonalTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      </div>
    </div>
  );
}
