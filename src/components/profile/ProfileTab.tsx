import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/hooks';
import { iamApi } from '../../api/client';
import LoadingState from '../LoadingState';

type SaveHandler = (() => Promise<void> | void) | null;

type ProfileTabProps = {
  onSaveReady?: (handler: SaveHandler) => void;
};

const FALLBACK_USER = {
  id: 'system',
  email: 'system@crm-ai.local',
  name: 'System',
  avatar_url: '',
  role: 'workspace_admin',
  created_at: new Date().toISOString(),
  memberships: [],
  context: { role_id: 'workspace_admin', permissions: ['*'] },
};

export default function ProfileTab({ onSaveReady }: ProfileTabProps) {
  const { data: user, loading } = useApi<any>(iamApi.me);
  const currentUser = user || FALLBACK_USER;
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    setName(currentUser.name || '');
    setAvatarUrl(currentUser.avatar_url || '');
  }, [currentUser]);

  const workspace = useMemo(() => {
    return currentUser?.memberships && currentUser.memberships.length > 0 ? currentUser.memberships[0] : null;
  }, [currentUser]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await iamApi.updateMe({
        name,
        avatar_url: avatarUrl || null,
      });
      setStatusMessage('Profile changes saved.');
    } catch (saveError: any) {
      setStatusMessage(saveError?.message || 'Unable to save profile changes.');
      throw saveError;
    } finally {
      setIsSaving(false);
    }
  }, [avatarUrl, name]);

  useEffect(() => {
    onSaveReady?.(handleSave);
    return () => onSaveReady?.(null);
  }, [handleSave, onSaveReady]);

  if (loading) return <LoadingState title="Loading profile data" message="Fetching your account details and memberships." compact />;

  return (
    <div className="space-y-8">
      {statusMessage && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/15 dark:text-emerald-300">
          {statusMessage}
        </div>
      )}

      {/* Personal Info */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Personal Information</h2>
          <span className="material-symbols-outlined text-gray-400">person</span>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-6">
            <div className="relative">
              <img src={avatarUrl || currentUser.avatar_url || 'https://i.pravatar.cc/150?img=11'} alt="User" className="w-20 h-20 rounded-2xl border-2 border-gray-200 dark:border-gray-700 object-cover" />
              <button type="button" className="absolute -bottom-1 -right-1 w-6 h-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full flex items-center justify-center shadow-card">
                <span className="material-symbols-outlined text-[14px]">edit</span>
              </button>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Profile Photo</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">This will be displayed on your profile and in conversations.</p>
              <button type="button" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">Upload new</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={event => setName(event.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Work Email</label>
              <input
                type="email"
                value={currentUser.email}
                readOnly
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-500 outline-none cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Avatar URL</label>
              <input
                type="url"
                value={avatarUrl}
                onChange={event => setAvatarUrl(event.target.value)}
                placeholder="https://..."
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Joined At</label>
              <input
                type="text"
                value={new Date(currentUser.created_at).toLocaleDateString()}
                readOnly
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-500 outline-none cursor-not-allowed"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-8">
        {/* Account Summary */}
        <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Account Summary</h2>
            <span className="material-symbols-outlined text-gray-400">info</span>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-gray-50 dark:border-gray-800/50">
              <span className="text-sm text-gray-500 dark:text-gray-400">Workspace</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{workspace ? workspace.workspace_name : 'No Workspace'}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-gray-50 dark:border-gray-800/50">
              <span className="text-sm text-gray-500 dark:text-gray-400">Role</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">{currentUser.role}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-gray-50 dark:border-gray-800/50">
              <span className="text-sm text-gray-500 dark:text-gray-400">Status</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium border bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-100 dark:border-green-800/30">
                {workspace ? workspace.status : 'Active'}
              </span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-gray-50 dark:border-gray-800/50">
              <span className="text-sm text-gray-500 dark:text-gray-400">Member Since</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{new Date(currentUser.created_at).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 dark:text-gray-400">Login Method</span>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px] text-gray-400">password</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Internal Auth</span>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Identity Context */}
        <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Identity Context</h2>
            <span className="material-symbols-outlined text-gray-400">badge</span>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-gray-50 dark:border-gray-800/50">
              <span className="text-sm text-gray-500 dark:text-gray-400">User ID</span>
              <span className="text-xs font-mono text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{currentUser.id}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-gray-50 dark:border-gray-800/50">
              <span className="text-sm text-gray-500 dark:text-gray-400">Member ID</span>
              <span className="text-xs font-mono text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{workspace ? workspace.id : 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-gray-50 dark:border-gray-800/50">
              <span className="text-sm text-gray-500 dark:text-gray-400">Identity Provider</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">System (Local)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 dark:text-gray-400">Email Status</span>
              <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                <span className="material-symbols-outlined text-[16px]">verified</span>
                <span className="text-sm font-medium">Verified</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{isSaving ? 'Saving profile changes...' : 'Changes are saved to your profile record.'}</span>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="hidden"
          aria-hidden="true"
        >
          Save
        </button>
      </div>
    </div>
  );
}
