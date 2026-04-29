import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import WorkspaceTab from './settings/Workspace';
import TeamsRolesTab from './settings/TeamsRoles';
import NotificationsTab from './settings/Notifications';
import SecurityAuditTab from './settings/SecurityAudit';
import BillingUsageTab from './settings/BillingUsage';
import DataPrivacyTab from './settings/DataPrivacy';
import PersonalTab from './settings/Personal';

type SettingsTab = 'workspace' | 'teams_roles' | 'notifications' | 'security_audit' | 'billing_usage' | 'data_privacy' | 'personal';

type TabErrorBoundaryProps = { children: ReactNode; label: string };

function TabErrorBoundary({ children }: TabErrorBoundaryProps) {
  return <>{children}</>;
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('workspace');
  const [hasSaveHandler, setHasSaveHandler] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const saveHandlerRef = React.useRef<null | (() => Promise<void> | void)>(null);

  // Stable callback — does NOT cause Settings to re-render when child calls it
  const setSaveHandler = useCallback((handler: null | (() => Promise<void> | void)) => {
    saveHandlerRef.current = handler;
    setHasSaveHandler(handler !== null);
  }, []);

  useEffect(() => {
    saveHandlerRef.current = null;
    setHasSaveHandler(false);
  }, [activeTab]);

  const handleDiscard = useCallback(() => {
    saveHandlerRef.current = null;
    setHasSaveHandler(false);
    setResetKey(k => k + 1);
  }, []);

  const handleSave = useCallback(async () => {
    if (saveHandlerRef.current) {
      await saveHandlerRef.current();
    }
  }, []);

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
              <button
                onClick={handleDiscard}
                disabled={!hasSaveHandler}
                className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Discard Changes
              </button>
              <button
                type="button"
                onClick={() => { void handleSave().catch(() => undefined); }}
                disabled={!hasSaveHandler}
                className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-bold shadow-md hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save changes
              </button>
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
              key={`${activeTab}-${resetKey}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              <TabErrorBoundary label={tabs.find(tab => tab.id === activeTab)?.label || 'Settings tab'}>
                {activeTab === 'workspace' && <WorkspaceTab onSaveReady={setSaveHandler} />}
                {activeTab === 'teams_roles' && <TeamsRolesTab onSaveReady={setSaveHandler} />}
                {activeTab === 'notifications' && <NotificationsTab onSaveReady={setSaveHandler} />}
                {activeTab === 'security_audit' && <SecurityAuditTab onSaveReady={setSaveHandler} />}
                {activeTab === 'billing_usage' && <BillingUsageTab onSaveReady={setSaveHandler} />}
                {activeTab === 'data_privacy' && <DataPrivacyTab onSaveReady={setSaveHandler} />}
                {activeTab === 'personal' && <PersonalTab onSaveReady={setSaveHandler} />}
              </TabErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      </div>
    </div>
  );
}
