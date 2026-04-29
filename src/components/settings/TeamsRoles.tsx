import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/hooks';
import { iamApi, workspacesApi } from '../../api/client';
import { PERMISSION_CATALOG, PERMISSION_DOMAINS, ROLE_PRESETS } from '../../permissions/catalog';
import { usePermissions } from '../../contexts/PermissionsContext';
import LoadingState from '../LoadingState';

type SubTab = 'members' | 'roles' | 'templates' | 'invitations' | 'audit';
type SaveHandler = (() => Promise<void> | void) | null;
type Props = { onSaveReady?: (handler: SaveHandler) => void };
type StatusFilter = 'all' | 'active' | 'invited' | 'suspended';

function normalizePermissions(value: any): string[] {
  if (Array.isArray(value)) return value.filter(v => typeof v === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

function relativeTime(value?: string | null) {
  if (!value) return 'never';
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

export default function TeamsRolesTab({ onSaveReady }: Props) {
  const { isOwner, isSuperAdmin } = usePermissions();
  const [activeTab, setActiveTab] = useState<SubTab>('members');

  // Data — fetch only once with empty deps
  const { data: members, loading: membersLoading, refetch: refetchMembers } = useApi<any[]>(iamApi.members, []);
  const { data: roles, loading: rolesLoading, refetch: refetchRoles } = useApi<any[]>(iamApi.roles, []);
  const { data: workspace } = useApi<any>(workspacesApi.currentContext);
  const membersList = members || [];
  const rolesList = roles || [];
  const workspaceSettings = useMemo(() => {
    if (!workspace?.settings) return {};
    if (typeof workspace.settings === 'string') {
      try {
        return JSON.parse(workspace.settings);
      } catch {
        return {};
      }
    }
    return workspace.settings;
  }, [workspace]);

  // Status
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Members state
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [memberRoleId, setMemberRoleId] = useState('');
  const [memberStatus, setMemberStatus] = useState('active');

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);

  // Roles state
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [showNewRoleForm, setShowNewRoleForm] = useState(false);
  const [ownershipConfirmId, setOwnershipConfirmId] = useState<string | null>(null);
  const [openDomains, setOpenDomains] = useState<Record<string, boolean>>(() =>
    PERMISSION_DOMAINS.reduce((acc, d) => ({ ...acc, [d]: true }), {} as Record<string, boolean>),
  );

  // Initialize selections once data has finished loading
  useEffect(() => {
    if (!membersLoading && membersList.length > 0 && !selectedMemberId) {
      setSelectedMemberId(membersList[0].id);
    }
  }, [membersLoading]);

  useEffect(() => {
    if (!rolesLoading && rolesList.length > 0 && !selectedRoleId) {
      setSelectedRoleId(rolesList[0].id);
    }
  }, [rolesLoading, rolesList, selectedRoleId]);

  useEffect(() => {
    if (rolesLoading || rolesList.length === 0 || inviteRoleId) return;
    const preferredRoleId = workspaceSettings?.access?.defaultInviteRoleId;
    const preferredRole = preferredRoleId ? rolesList.find((role: any) => role.id === preferredRoleId) : null;
    setInviteRoleId(preferredRole?.id || rolesList[0].id);
  }, [inviteRoleId, rolesList, rolesLoading, workspaceSettings]);

  const selectedMember = useMemo(() => membersList.find(m => m.id === selectedMemberId) || null, [selectedMemberId]);
  const selectedRole = useMemo(() => rolesList.find(r => r.id === selectedRoleId) || null, [selectedRoleId]);

  // Update form when member changes
  useEffect(() => {
    if (selectedMember) {
      setMemberStatus(selectedMember.status || 'active');
      setMemberRoleId(selectedMember.role_id || '');
    }
  }, [selectedMemberId]);

  // Update form when role changes
  useEffect(() => {
    if (selectedRole) {
      setRoleName(selectedRole.name || '');
      setRolePermissions(normalizePermissions(selectedRole.permissions));
    }
  }, [selectedRoleId]);

  const filteredMembers = useMemo(() => {
    return membersList.filter(m => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      const q = memberSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        (m.name || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q) ||
        (m.role_name || '').toLowerCase().includes(q)
      );
    });
  }, [membersList, memberSearch, statusFilter]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Actions
  const handleSaveMember = useCallback(async () => {
    if (!selectedMember) return;
    setIsSaving(true);
    try {
      await iamApi.updateMember(selectedMember.id, { status: memberStatus, role_id: memberRoleId || undefined });
      showMessage('success', 'Member updated.');
      await refetchMembers();
    } catch (error: any) {
      showMessage('error', error?.message || 'Unable to save member.');
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [memberRoleId, memberStatus, refetchMembers, selectedMember]);

  const handleSaveRole = useCallback(async () => {
    if (!selectedRole) return;
    setIsSaving(true);
    try {
      await iamApi.updateRole(selectedRole.id, { name: roleName, permissions: rolePermissions });
      showMessage('success', 'Role updated.');
      await refetchRoles();
    } catch (error: any) {
      showMessage('error', error?.message || 'Unable to save role.');
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [refetchRoles, roleName, rolePermissions, selectedRole]);

  const handleInvite = async () => {
    if (!inviteEmail || !inviteRoleId) {
      showMessage('error', 'Email and role are required.');
      return;
    }
    setIsSaving(true);
    try {
      const result = await iamApi.inviteMember({ email: inviteEmail.trim(), name: inviteName.trim() || undefined, role_id: inviteRoleId });
      const sentTo = inviteEmail;
      setInviteEmail('');
      setInviteName('');
      setShowInviteForm(false);

      if (result?.invite?.accept_url) {
        try {
          await navigator.clipboard.writeText(result.invite.accept_url);
          showMessage('success', `Invite link copied to clipboard. Ready to share with ${sentTo}.`);
        } catch {
          showMessage('success', `Invite sent to ${sentTo}.`);
        }
      } else {
        showMessage('success', `Invite sent to ${sentTo}.`);
      }
      await refetchMembers();
    } catch (error: any) {
      showMessage('error', error?.message || 'Unable to send invite.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSuspendMember = async () => {
    if (!selectedMember) return;
    setIsSaving(true);
    try {
      await iamApi.updateMember(selectedMember.id, { status: 'suspended' });
      showMessage('success', 'Member suspended.');
      await refetchMembers();
    } catch (error: any) {
      showMessage('error', error?.message || 'Unable to suspend member.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReactivateMember = async () => {
    if (!selectedMember) return;
    setIsSaving(true);
    try {
      await iamApi.updateMember(selectedMember.id, { status: 'active' });
      showMessage('success', 'Member reactivated.');
      await refetchMembers();
    } catch (error: any) {
      showMessage('error', error?.message || 'Unable to reactivate member.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTransferOwnership = async () => {
    if (!selectedMember) return;
    setIsSaving(true);
    try {
      await iamApi.transferOwnership(selectedMember.id);
      showMessage('success', 'Ownership transferred.');
      setOwnershipConfirmId(null);
      await refetchMembers();
    } catch (error: any) {
      showMessage('error', error?.message || 'Unable to transfer ownership.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResendInvite = async (memberOverride?: any) => {
    const targetMember = memberOverride || selectedMember;
    if (!targetMember || !targetMember.email || !targetMember.role_id) return;
    setIsSaving(true);
    try {
      const result = await iamApi.resendInvite({ email: targetMember.email, role_id: targetMember.role_id });
      if (result?.accept_url) {
        try {
          await navigator.clipboard.writeText(result.accept_url);
          showMessage('success', 'Invite link copied to clipboard.');
        } catch {
          showMessage('success', 'Invite resent.');
        }
      } else {
        showMessage('success', 'Invite resent.');
      }
    } catch (error: any) {
      showMessage('error', error?.message || 'Unable to resend invite.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateFromTemplate = async (template: { name: string; permissions: string[] }) => {
    setIsSaving(true);
    try {
      await iamApi.createRole(template);
      showMessage('success', `Role "${template.name}" created.`);
      await refetchRoles();
    } catch (error: any) {
      showMessage('error', error?.message || 'Unable to create role.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateBlankRole = async () => {
    const name = newRoleName.trim();
    if (!name) {
      showMessage('error', 'Role name is required.');
      return;
    }
    setIsSaving(true);
    try {
      const created = await iamApi.createRole({ name, permissions: [] });
      showMessage('success', `Role "${name}" created.`);
      setNewRoleName('');
      setShowNewRoleForm(false);
      if (created?.role?.id || created?.id) {
        setSelectedRoleId(created.role?.id || created.id);
      }
      await refetchRoles();
    } catch (error: any) {
      showMessage('error', error?.message || 'Unable to create role.');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const handler = activeTab === 'members' ? handleSaveMember : activeTab === 'roles' ? handleSaveRole : null;
    onSaveReady?.(handler);
    return () => onSaveReady?.(null);
  }, [activeTab, handleSaveMember, handleSaveRole, onSaveReady]);

  if (membersLoading || rolesLoading) {
    return <LoadingState title="Loading members and roles" message="Synchronizing workspace IAM data." compact />;
  }

  const stats = {
    total: membersList.length,
    active: membersList.filter(m => m.status === 'active').length,
    invited: membersList.filter(m => m.status === 'invited').length,
    suspended: membersList.filter(m => m.status === 'suspended').length,
  };

  const auditItems = [
    ...membersList.slice(0, 5).map(member => ({
      id: `member-${member.id}`,
      title: member.status === 'invited' ? 'Member invited' : 'Member updated',
      description: `${member.name || member.email} · ${member.role_name || 'No role'} · ${member.status}`,
      time: relativeTime(member.updated_at || member.created_at),
    })),
    ...rolesList.slice(0, 5).map(role => ({
      id: `role-${role.id}`,
      title: role.is_system ? 'System role synced' : 'Role available',
      description: `${role.name} · ${(role.permissions || []).length} permissions`,
      time: relativeTime(role.updated_at || role.created_at),
    })),
  ].slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Status message */}
      {statusMessage && (
        <div className={`border rounded-lg px-4 py-3 text-sm ${
          statusMessage.type === 'success'
            ? 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 text-gray-900 dark:text-white'
            : 'border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-700 text-gray-900 dark:text-white'
        }`}>
          {statusMessage.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-gray-200 dark:border-gray-700">
        {[
          { id: 'members',     label: 'Members & Seats' },
          { id: 'roles',       label: 'Roles & Permissions' },
          { id: 'templates',   label: 'Permission Templates' },
          { id: 'invitations', label: 'Pending Invitations' },
          { id: 'audit',       label: 'Audit Log' },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as SubTab)}
            className={`px-4 py-3 text-sm border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'font-semibold text-gray-900 dark:text-white border-gray-900 dark:border-white'
                : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* MEMBERS TAB */}
      {activeTab === 'members' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total', value: stats.total },
              { label: 'Active', value: stats.active },
              { label: 'Invited', value: stats.invited },
              { label: 'Suspended', value: stats.suspended },
            ].map(stat => (
              <div key={stat.label} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{stat.label}</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Invite section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Invite Member</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Add a new teammate to this workspace.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteForm(s => !s)}
                className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg text-sm font-semibold hover:opacity-80 transition-opacity"
              >
                {showInviteForm ? 'Cancel' : 'Invite'}
              </button>
            </div>

            {showInviteForm && (
              <div className="p-6 space-y-4 bg-white dark:bg-gray-900">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Email *</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 outline-none focus:border-gray-900 dark:focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Role *</label>
                    <select
                      value={inviteRoleId}
                      onChange={e => setInviteRoleId(e.target.value)}
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 outline-none focus:border-gray-900 dark:focus:border-white"
                    >
                      {rolesList.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Name (optional)</label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 outline-none focus:border-gray-900 dark:focus:border-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleInvite}
                  disabled={isSaving}
                  className="w-full px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg text-sm font-semibold hover:opacity-80 disabled:opacity-50 transition-opacity"
                >
                  {isSaving ? 'Sending...' : 'Send Invite'}
                </button>
              </div>
            )}
          </div>

          {/* Members list */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search members..."
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 outline-none focus:border-gray-900 dark:focus:border-white"
              />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 outline-none focus:border-gray-900 dark:focus:border-white"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="invited">Invited</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>

            {filteredMembers.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">No members found</div>
            ) : (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-200 dark:divide-gray-700">
                {filteredMembers.map(member => (
                  <div
                    key={member.id}
                    onClick={() => setSelectedMemberId(member.id)}
                    className={`p-4 cursor-pointer transition-colors ${
                      selectedMemberId === member.id
                        ? 'bg-gray-100 dark:bg-gray-800'
                        : 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">{member.name || member.email}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{member.email}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{member.role_name || 'No role'} · {member.status}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{relativeTime(member.created_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Member details */}
          {selectedMember && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">

              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <p className="font-semibold text-gray-900 dark:text-white text-sm">{selectedMember.name || selectedMember.email}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{selectedMember.email}</p>
              </div>

              <div className="p-6 space-y-6">

                {/* Account status — read-only, driven by action buttons below */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Account status</p>
                    <p className="text-sm text-gray-900 dark:text-white capitalize">{selectedMember.status}</p>
                  </div>
                  {selectedMember.is_owner ? (
                    <span className="text-xs text-gray-400 dark:text-gray-500">Protected — workspace owner</span>
                  ) : selectedMember.status === 'suspended' ? (
                    <button
                      type="button"
                      onClick={handleReactivateMember}
                      disabled={isSaving}
                      className="px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg text-xs font-semibold hover:opacity-80 disabled:opacity-50"
                    >
                      Reactivate member
                    </button>
                  ) : selectedMember.status === 'invited' ? (
                    <button
                      type="button"
                      onClick={handleResendInvite}
                      disabled={isSaving}
                      className="px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg text-xs font-semibold hover:opacity-80 disabled:opacity-50"
                    >
                      Resend invite link
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSuspendMember}
                      disabled={isSaving}
                      className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                    >
                      Suspend member
                    </button>
                  )}
                </div>

                {/* Role — editable, saved via "Save changes" header button */}
                {!selectedMember.is_owner && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                      Role
                      <span className="ml-2 font-normal normal-case text-gray-400 dark:text-gray-500">— saved via Save changes ↑</span>
                    </label>
                    <select
                      value={memberRoleId}
                      onChange={e => setMemberRoleId(e.target.value)}
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 outline-none focus:border-gray-900 dark:focus:border-white"
                    >
                      <option value="">No role</option>
                      {rolesList.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Ownership transfer — separated as a destructive zone */}
                {isOwner && selectedMember.status === 'active' && !selectedMember.is_owner && (
                  <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Ownership</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">You will be demoted to Admin. Cannot be undone.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOwnershipConfirmId(selectedMember.id)}
                        disabled={isSaving}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                      >
                        Transfer ownership
                      </button>
                    </div>
                    {ownershipConfirmId === selectedMember.id && (
                      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Confirm ownership transfer</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {selectedMember.name || selectedMember.email} will become workspace owner and your account will be demoted to Admin.
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={handleTransferOwnership}
                            disabled={isSaving}
                            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
                          >
                            Confirm transfer
                          </button>
                          <button
                            type="button"
                            onClick={() => setOwnershipConfirmId(null)}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      )}

      {/* ROLES TAB */}
      {activeTab === 'roles' && (
        <div className="space-y-6">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowNewRoleForm(current => !current)}
              className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg text-sm font-semibold hover:opacity-80"
            >
              {showNewRoleForm ? 'Cancel new role' : 'New Blank Role'}
            </button>
          </div>

          {showNewRoleForm && (
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Role name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRoleName}
                  onChange={event => setNewRoleName(event.target.value)}
                  placeholder="Senior Agent"
                  className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 outline-none focus:border-gray-900 dark:focus:border-white"
                />
                <button
                  type="button"
                  onClick={handleCreateBlankRole}
                  disabled={isSaving || !newRoleName.trim()}
                  className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg text-sm font-semibold hover:opacity-80 disabled:opacity-50"
                >
                  Create role
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            {/* Role list */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-200 dark:divide-gray-700">
              {rolesList.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">No roles</div>
              ) : (
                rolesList.map(role => (
                  <div
                    key={role.id}
                    onClick={() => setSelectedRoleId(role.id)}
                    className={`p-4 cursor-pointer transition-colors ${
                      selectedRoleId === role.id
                        ? 'bg-gray-100 dark:bg-gray-800'
                        : 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">{role.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{(role.permissions || []).length} permissions</p>
                  </div>
                ))
              )}
            </div>

            {/* Role editor */}
            {selectedRole && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Role Name</label>
                  <input
                    type="text"
                    value={roleName}
                    onChange={e => setRoleName(e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 outline-none focus:border-gray-900 dark:focus:border-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">Permissions</label>
                  <div className="space-y-3">
                    {PERMISSION_DOMAINS.map(domain => {
                      const domainPerms = PERMISSION_CATALOG.filter(p => p.domain === domain);
                      const domainGranted = domainPerms.filter(p => rolePermissions.includes(p.key));

                      return (
                        <div key={domain} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                          <button
                            type="button"
                            onClick={() => setOpenDomains(d => ({ ...d, [domain]: !d[domain] }))}
                            className="w-full flex items-center justify-between font-semibold text-sm text-gray-900 dark:text-white hover:opacity-80"
                          >
                            <span>{domain} ({domainGranted.length}/{domainPerms.length})</span>
                            <span className="text-xs">▼</span>
                          </button>

                          {openDomains[domain] && (
                            <div className="mt-3 space-y-2 pl-2">
                              {domainPerms.map(p => (
                                <label key={p.key} className="flex items-start gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={rolePermissions.includes(p.key)}
                                    onChange={e => {
                                      if (e.target.checked) {
                                        setRolePermissions([...rolePermissions, p.key]);
                                      } else {
                                        setRolePermissions(rolePermissions.filter(k => k !== p.key));
                                      }
                                    }}
                                    className="mt-1"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{p.label}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{p.description}</p>
                                  </div>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TEMPLATES TAB */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Clone a template to create a new role quickly.</p>
          <div className="grid grid-cols-1 gap-4">
            {Object.entries(ROLE_PRESETS).map(([key, template]) => (
              <div key={key} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{template.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{template.description}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{template.permissions.length} permissions</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCreateFromTemplate({ name: template.label, permissions: template.permissions })}
                  disabled={isSaving}
                  className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg text-sm font-semibold hover:opacity-80 disabled:opacity-50"
                >
                  Clone
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* INVITATIONS TAB */}
      {activeTab === 'invitations' && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-200 dark:divide-gray-700">
          {membersList.filter(m => m.status === 'invited').length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">No pending invitations</div>
          ) : (
            membersList.filter(m => m.status === 'invited').map(member => (
              <div key={member.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{member.email}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{member.role_name || 'No role'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMemberId(member.id);
                    void handleResendInvite(member);
                  }}
                  className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg text-sm font-semibold hover:opacity-80"
                >
                  Resend
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* AUDIT TAB */}
      {activeTab === 'audit' && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-200 dark:divide-gray-700">
          {auditItems.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">No team activity yet.</div>
          ) : (
            auditItems.map(item => (
              <div key={item.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.title}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500">{item.time}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
