import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MinimalCategoryShell } from './MinimalCategoryShell';
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
    <MinimalCategoryShell
      title="Settings & Administration"
      subtitle="Manage your workspace profile, business hours, and branding"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={tabId => setActiveTab(tabId as SettingsTab)}
      primaryAction={{
        label: 'Save changes',
        onClick: () => { void handleSave().catch(() => undefined); },
        disabled: !hasSaveHandler,
      }}
      secondaryAction={{
        label: 'Discard Changes',
        onClick: handleDiscard,
        disabled: !hasSaveHandler,
      }}
    >
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
    </MinimalCategoryShell>
  );
}
