import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MinimalCategoryShell } from './MinimalCategoryShell';
import ProfileTab from './profile/ProfileTab';
import AccessPermissionsTab from './profile/AccessPermissionsTab';
import SecurityTab from './profile/SecurityTab';
import NotificationsTab from './profile/NotificationsTab';
import PreferencesTab from './profile/PreferencesTab';
import ActivityTab from './profile/ActivityTab';
import { NavigateInput } from '../types';

type ProfileTabType = 'profile' | 'access_permissions' | 'security' | 'notifications' | 'preferences' | 'activity';

type ProfileProps = {
  onNavigate?: (target: NavigateInput) => void;
  initialSection?: string | null;
};

export default function Profile({ onNavigate, initialSection }: ProfileProps) {
  const [activeTab, setActiveTab] = useState<ProfileTabType>('profile');
  const [saveHandler, setSaveHandler] = useState<null | (() => Promise<void> | void)>(null);
  const [profileDiscardTick, setProfileDiscardTick] = useState(0);

  useEffect(() => {
    setSaveHandler(null);
  }, [activeTab]);

  useEffect(() => {
    if (!initialSection) return;
    const nextSection = initialSection as ProfileTabType;
    if (['profile', 'access_permissions', 'security', 'notifications', 'preferences', 'activity'].includes(nextSection)) {
      setActiveTab(nextSection);
    }
  }, [initialSection]);

  const handleSave = useCallback(async () => {
    if (saveHandler) {
      await saveHandler();
    }
  }, [saveHandler]);

  const handleDiscard = useCallback(() => {
    setProfileDiscardTick(current => current + 1);
    setSaveHandler(null);
  }, []);

  const tabs: { id: ProfileTabType; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'access_permissions', label: 'Access & Permissions' },
    { id: 'security', label: 'Security' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'activity', label: 'Activity' },
  ];

  return (
    <MinimalCategoryShell
      title="Profile"
      subtitle="Manage your personal account, access, security, and preferences."
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={tabId => setActiveTab(tabId as ProfileTabType)}
      primaryAction={{
        label: 'Save changes',
        onClick: () => { void handleSave().catch(() => undefined); },
        disabled: !saveHandler,
      }}
      secondaryAction={{
        label: 'Discard Changes',
        onClick: handleDiscard,
        disabled: !saveHandler,
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={`${activeTab}-${profileDiscardTick}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="h-full"
        >
          {activeTab === 'profile' && <ProfileTab onSaveReady={setSaveHandler} />}
          {activeTab === 'access_permissions' && <AccessPermissionsTab />}
          {activeTab === 'security' && <SecurityTab onSaveReady={setSaveHandler} />}
          {activeTab === 'notifications' && <NotificationsTab onSaveReady={setSaveHandler} />}
          {activeTab === 'preferences' && <PreferencesTab onSaveReady={setSaveHandler} />}
          {activeTab === 'activity' && <ActivityTab onNavigate={onNavigate} />}
        </motion.div>
      </AnimatePresence>
    </MinimalCategoryShell>
  );
}
