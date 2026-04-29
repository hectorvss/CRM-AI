import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/hooks';
import { iamApi } from '../../api/client';
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

function initials(s?: string) {
  if (!s) return '??';
  return s.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
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

  // Data
  const { data: members, loading: membersLoading, refetch: refetchMembers } = useApi<any[]>(iamApi.members);
  const { data: roles, loading: rolesLoading, refetch: refetchRoles } = useApi<any[]>(iamApi.roles);
  const membersList = members || [];
  const rolesList = roles || [];

  // Status / messages
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
  const [openDomains, setOpenDomains] = useState<Record<string, boolean>>(() =>
    PERMISSION_DOMAINS.reduce((acc, d) => ({ ...acc, [d]: true }), {} as Record<string, boolean>),
  );

  // Initial selections
  useEffect(() => {
    if (!selectedMemberId && membersList.length > 0) setSelectedMemberId(membersList[0].id);
  }, [membersList, selectedMemberId]);

  useEffect(() => {
    if (!selectedRoleId && rolesList.length > 0) setSelectedRoleId(rolesList[0].id);
  }, [rolesList, selectedRoleId]);

  useEffect(() => {
    if (!inviteRoleId && rolesList.length > 0) setInviteRoleId(rolesList[0].id);
  }, [inviteRoleId, rolesList]);

  const selectedMember = useMemo(() => membersList.find(m => m.id === selectedMemberId) || null, [membersList, selectedMemberId]);
  const selectedRole = useMemo(() => rolesList.find(r => r.id === selectedRoleId) || null, [rolesList, selectedRoleId]);
  const currentMemberRole = useMemo(() => rolesList.find(r => r.id === memberRoleId) || null, [memberRoleId, rolesList]);

  useEffect(() => {
    if (selectedMember) {
      setMemberStatus(selectedMember.status || 'active');
      setMemberRoleId(selectedMember.role_id || '');
    }
  }, [selectedMember]);

  useEffect(() => {
    if (selectedRole) {
      setRoleName(selectedRole.name || '');
      setRolePermissions(normalizePermissions(selectedRole.permissions));
    }
  }, [selectedRole]);

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

  // ─── Actions ─────────────────────────────────────────────────────
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

      // Try to copy invite link to clipboard so the manager can share it directly
      if (result?.invite?.accept_url) {
        try {
          await navigator.clipboard.writeText(result.invite.accept_url);
          showMessage('success', `Invitation sent to ${sentTo}. Link copied to clipboard.`);
        } catch {
          showMessage('success', `Invitation sent to ${sentTo}.`);
        }
      } else {
        showMessage('success', `Invitation sent to ${sentTo}.`);
      }
      await refetchMembers();
    } catch (error: any) {
      showMessage('error', error?.message || 'Unable to invite member.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSuspendMember = async () => {
    if (!selectedMember) return;
    if (selectedMember.is_owner) {
      showMessage('error', 'Cannot suspend the workspace owner.');
      return;
    }
    if (!confirm(`Suspend ${selectedMember.name || selectedMember.email}? They will lose access immediately.`)) return;
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
    if (!confirm(`Transfer workspace ownership to ${selectedMember.name || selectedMember.email}? You will be demoted to admin and they will get full access. This cannot be undone without their cooperation.`)) return;
    setIsSaving(true);
    try {
      await iamApi.transferOwnership(selectedMember.id);
      showMessage('success', 'Ownership transferred.');
      await refetchMembers();
    } catch (error: any) {
      showMessage('error', error?.message || 'Unable to transfer ownership.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResendInvite = async () => {
    if (!selectedMember || !selectedMember.email || !selectedMember.role_id) return;
    setIsSaving(true);
    try {
      const result = await iamApi.resendInvite({ email: selectedMember.email, role_id: selectedMember.role_id });
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
    const name = prompt('Role name (e.g. "Senior Agent"):');
    if (!name?.trim()) return;
    setIsSaving(true);
    try {
      await iamApi.createRole({ name: name.trim(), permissions: [] });
      showMessage('success', `Role "${name}" created.`);
      await refetchRoles();
    } catch (error: any) {
      showMessage('error', error?.message || 'Unable to create role.');
    } finally {
      setIsSaving(false);
    }
  };

  // Wire save handler with parent
  useEffect(() => {
    const handler = activeTab === 'members' ? handleSaveMember : activeTab === 'roles' ? handleSaveRole : null;
    onSaveReady?.(handler);
    return () => onSaveReady?.(null);
  }, [activeTab, handleSaveMember, handleSaveRole, onSaveReady]);

  if (membersLoading || rolesLoading) {
    return <LoadingState title="Loading members and roles" message="Synchronizing workspace IAM data." compact />;
  }

  // ─── Stats ───────────────────────────────────────────────────────
  const stats = {
    total: membersList.length,
    active: membersList.filter(m => m.status === 'active').length,
    invited: membersList.filter(m => m.status === 'invited').length,
    suspended: membersList.filter(m => m.status === 'suspended').length,
  };

  return (
    <div className="space-y-6">
      {statusMessage && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-center gap-2 ${
          statusMessage.type === 'success'
            ? 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/15 dark:text-emerald-300'
            : 'border-red-100 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-900/15 dark:text-red-300'
        }`}>
          <span className="material-symbols-outlined text-base">{statusMessage.type === 'success' ? 'check_circle' : 'error'}</span>
          {statusMessage.text}
        </div>
      )}

      {/* Sub-tabs — Settings/Upgrade style: black bottom-border for active */}
      <div className="flex items-center space-x-8 border-b border-gray-100 dark:border-gray-800">
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

      {/* ─── MEMBERS TAB ─────────────────────────────────────────── */}
      {activeTab === 'members' && (
        <div className="space-y-6">
          {/* Stats cards */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Members',   value: stats.total,     icon: 'group',           tint: 'indigo' },
              { label: 'Active',          value: stats.active,    icon: 'person_check',    tint: 'emerald' },
              { label: 'Pending Invites', value: stats.invited,   icon: 'schedule',        tint: 'amber' },
              { label: 'Suspended',       value: stats.suspended, icon: 'person_off',      tint: 'red' },
            ].map(card => (
              <div key={card.label} className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4 shadow-card">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${card.tint}-50 text-${card.tint}-600 dark:bg-${card.tint}-900/20 dark:text-${card.tint}-400`}>
                  <span className="material-symbols-outlined text-lg">{card.icon}</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{card.label}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{card.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Invite bar */}
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Invite Member</h3>
                <p className="text-xs text-gray-500 mt-0.5">Add a new teammate to this workspace.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteForm(s => !s)}
                className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-bold shadow-md hover:opacity-90 transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">{showInviteForm ? 'close' : 'person_add'}</span>
                {showInviteForm ? 'Cancel' : 'Invite Member'}
              </button>
            </div>

            {showInviteForm && (
              <div className="p-6 grid grid-cols-12 gap-4">
                <div className="col-span-4">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Email *</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="teammate@company.com"
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-900 dark:focus:border-white transition-colors"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Full name</label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-900 dark:focus:border-white transition-colors"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Role *</label>
                  <select
                    value={inviteRoleId}
                    onChange={e => setInviteRoleId(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-900 dark:focus:border-white transition-colors"
                  >
                    {rolesList.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2 flex items-end">
                  <button
                    type="button"
                    disabled={isSaving || !inviteEmail || !inviteRoleId}
                    onClick={() => void handleInvite()}
                    className="w-full px-4 py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-bold shadow-md hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Send Invite
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Filters + members list/detail */}
          <div className="grid grid-cols-12 gap-6">
            {/* Members list */}
            <section className="col-span-5 bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden flex flex-col" style={{ minHeight: 520 }}>
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 space-y-3">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">search</span>
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    placeholder="Search by name, email or role..."
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pl-10 pr-4 py-2 text-sm outline-none"
                  />
                </div>
                <div className="flex gap-1.5">
                  {(['all', 'active', 'invited', 'suspended'] as StatusFilter[]).map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setStatusFilter(f)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition-colors ${
                        statusFilter === f
                          ? 'bg-black dark:bg-white text-white dark:text-black'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                {filteredMembers.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-500">No members match your filters.</div>
                ) : (
                  filteredMembers.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMemberId(m.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                        selectedMemberId === m.id
                          ? 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border border-transparent'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                        {initials(m.name || m.email)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">{m.name || m.email?.split('@')[0]}</h4>
                          {m.is_owner && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-900/40 uppercase">Owner</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">{m.email}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[10px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded capitalize">{m.role_name || 'No role'}</span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${
                            m.status === 'active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' :
                            m.status === 'invited' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' :
                            'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                          }`}>{m.status}</span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

            {/* Member detail */}
            <section className="col-span-7 bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden flex flex-col">
              {!selectedMember ? (
                <div className="flex-1 flex items-center justify-center text-sm text-gray-500">Select a member to view details.</div>
              ) : (
                <>
                  <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-4 bg-gray-50/50 dark:bg-gray-800/20">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                        {initials(selectedMember.name || selectedMember.email)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedMember.name || selectedMember.email?.split('@')[0]}</h2>
                          {selectedMember.is_owner && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 uppercase tracking-wider">Workspace Owner</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{selectedMember.email}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Joined {relativeTime(selectedMember.joined_at)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                    {selectedMember.is_owner && (
                      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-900/15 dark:text-amber-300 flex items-start gap-2">
                        <span className="material-symbols-outlined text-base mt-0.5">info</span>
                        <span>The workspace owner has full access by default and cannot have their role changed. To change ownership, use <strong>Transfer Ownership</strong>.</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Role</label>
                        <select
                          value={memberRoleId}
                          disabled={selectedMember.is_owner}
                          onChange={e => setMemberRoleId(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {rolesList.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Access Status</label>
                        <select
                          value={memberStatus}
                          disabled={selectedMember.is_owner}
                          onChange={e => setMemberStatus(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="active">Active</option>
                          <option value="invited">Invited</option>
                          <option value="suspended">Suspended</option>
                        </select>
                      </div>
                    </div>

                    {/* Permission preview */}
                    <div>
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Permission Preview ({normalizePermissions(currentMemberRole?.permissions).length} permissions)</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {PERMISSION_DOMAINS.slice(0, 8).map(domain => {
                          const domainPerms = PERMISSION_CATALOG.filter(p => p.domain === domain);
                          const granted = currentMemberRole
                            ? domainPerms.filter(p => normalizePermissions(currentMemberRole.permissions).includes(p.key) || normalizePermissions(currentMemberRole.permissions).includes('*'))
                            : [];
                          return (
                            <div key={domain} className="flex items-center justify-between p-2.5 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{domain}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                granted.length === domainPerms.length ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' :
                                granted.length > 0 ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' :
                                'bg-gray-100 text-gray-400 dark:bg-gray-800'
                              }`}>
                                {granted.length} / {domainPerms.length}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        type="button"
                        disabled={isSaving || selectedMember.is_owner}
                        onClick={() => void handleSaveMember()}
                        className="flex items-center gap-1.5 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-bold shadow-md hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span className="material-symbols-outlined text-[16px]">save</span>
                        Save Changes
                      </button>
                      {selectedMember.status === 'invited' && (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => void handleResendInvite()}
                          className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-bold shadow-card hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                        >
                          <span className="material-symbols-outlined text-[16px]">forward_to_inbox</span>
                          Resend & Copy Link
                        </button>
                      )}
                    </div>

                    {/* Danger zone */}
                    {!selectedMember.is_owner && (
                      <div className="border-t border-gray-100 dark:border-gray-800 pt-6 mt-2">
                        <h3 className="text-xs font-bold text-red-600 uppercase tracking-wider mb-3">Danger Zone</h3>
                        <div className="space-y-3">
                          {selectedMember.status === 'suspended' ? (
                            <div className="flex items-center justify-between p-4 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-900/30">
                              <div>
                                <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Reactivate access</h4>
                                <p className="text-xs text-emerald-700/80 dark:text-emerald-300/70">Restore this member's access to the workspace.</p>
                              </div>
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => void handleReactivateMember()}
                                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-emerald-700 transition-all disabled:opacity-40"
                              >
                                Reactivate
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between p-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/30">
                              <div>
                                <h4 className="text-sm font-bold text-red-900 dark:text-red-200">Suspend access</h4>
                                <p className="text-xs text-red-700/80 dark:text-red-300/70">Revoke this member's access immediately. Can be reversed.</p>
                              </div>
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => void handleSuspendMember()}
                                className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-xl text-sm font-bold shadow-card hover:bg-red-50 transition-all disabled:opacity-40"
                              >
                                Suspend
                              </button>
                            </div>
                          )}

                          {(isOwner || isSuperAdmin) && (
                            <div className="flex items-center justify-between p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/30">
                              <div>
                                <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">Transfer Ownership</h4>
                                <p className="text-xs text-amber-700/80 dark:text-amber-300/70">Make this member the workspace owner. You will be demoted.</p>
                              </div>
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => void handleTransferOwnership()}
                                className="px-4 py-2 bg-white border border-amber-200 text-amber-700 rounded-xl text-sm font-bold shadow-card hover:bg-amber-50 transition-all disabled:opacity-40"
                              >
                                Transfer
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      )}

      {/* ─── ROLES TAB ───────────────────────────────────────────── */}
      {activeTab === 'roles' && (
        <div className="grid grid-cols-12 gap-6">
          {/* Role list */}
          <section className="col-span-4 bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Roles</h3>
              <button
                type="button"
                onClick={() => void handleCreateBlankRole()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-xl text-xs font-bold shadow-md hover:opacity-90 transition-all"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                New
              </button>
            </div>
            <div className="p-2 space-y-1 max-h-[600px] overflow-y-auto custom-scrollbar">
              {rolesList.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRoleId(r.id)}
                  className={`w-full text-left rounded-xl p-3 transition-all ${
                    selectedRoleId === r.id
                      ? 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                      : 'border border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white capitalize">{(r.name || '').replace(/_/g, ' ')}</h4>
                    {r.is_system === 1 && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 uppercase">System</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{r.permission_count || 0} permissions</p>
                </button>
              ))}
            </div>
          </section>

          {/* Permission editor */}
          <section className="col-span-8 bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            {!selectedRole ? (
              <div className="p-12 text-center text-sm text-gray-500">Select a role to edit its permissions.</div>
            ) : (
              <>
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Edit Role</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{rolePermissions.length} of {PERMISSION_CATALOG.length} permissions selected</p>
                  </div>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleSaveRole()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-bold shadow-md hover:opacity-90 transition-all disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[16px]">save</span>
                    Save Changes
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Role Name</label>
                    <input
                      type="text"
                      value={roleName}
                      disabled={selectedRole.is_system === 1}
                      onChange={e => setRoleName(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none disabled:opacity-60"
                    />
                    {selectedRole.is_system === 1 && (
                      <p className="text-[11px] text-gray-400 mt-1.5">System roles cannot be renamed.</p>
                    )}
                  </div>

                  {/* Permission matrix grouped by domain */}
                  <div className="space-y-3 max-h-[480px] overflow-y-auto custom-scrollbar pr-2">
                    {PERMISSION_DOMAINS.map(domain => {
                      const domainPerms = PERMISSION_CATALOG.filter(p => p.domain === domain);
                      const allChecked = domainPerms.every(p => rolePermissions.includes(p.key));
                      const someChecked = domainPerms.some(p => rolePermissions.includes(p.key));
                      const isOpen = openDomains[domain];
                      return (
                        <div key={domain} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setOpenDomains(prev => ({ ...prev, [domain]: !prev[domain] }))}
                            className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className="material-symbols-outlined text-gray-500 text-[18px]">{domainPerms[0]?.domainIcon || 'folder'}</span>
                              <span className="text-sm font-bold text-gray-900 dark:text-white">{domain}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                allChecked ? 'bg-emerald-50 text-emerald-700' :
                                someChecked ? 'bg-amber-50 text-amber-700' :
                                'bg-gray-100 text-gray-400 dark:bg-gray-800'
                              }`}>
                                {domainPerms.filter(p => rolePermissions.includes(p.key)).length} / {domainPerms.length}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span
                                role="button"
                                tabIndex={-1}
                                onClick={e => {
                                  e.stopPropagation();
                                  if (allChecked) {
                                    setRolePermissions(prev => prev.filter(p => !domainPerms.find(d => d.key === p)));
                                  } else {
                                    setRolePermissions(prev => [...new Set([...prev, ...domainPerms.map(d => d.key)])]);
                                  }
                                }}
                                className="text-[11px] font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                              >
                                {allChecked ? 'Clear all' : 'Select all'}
                              </span>
                              <span className="material-symbols-outlined text-gray-400 text-[18px]">{isOpen ? 'expand_less' : 'expand_more'}</span>
                            </div>
                          </button>
                          {isOpen && (
                            <div className="p-3 grid grid-cols-2 gap-2">
                              {domainPerms.map(p => {
                                const checked = rolePermissions.includes(p.key);
                                const rowDisabled = selectedRole.is_system === 1 && (selectedRole.name === 'workspace_admin' || selectedRole.name === 'owner');
                                return (
                                  <label
                                    key={p.key}
                                    className={`flex items-start gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                                      checked
                                        ? 'border-gray-900 dark:border-white bg-gray-50 dark:bg-gray-800/50'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                    } ${rowDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={rowDisabled}
                                      onChange={e => {
                                        const chk = e.target.checked;
                                        setRolePermissions(prev => chk ? [...prev, p.key] : prev.filter(x => x !== p.key));
                                      }}
                                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-bold text-gray-900 dark:text-white truncate">{p.label}</div>
                                      <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{p.description}</div>
                                      <div className="text-[10px] font-mono text-gray-400 mt-0.5">{p.key}</div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* ─── TEMPLATES TAB ───────────────────────────────────────── */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/15 dark:text-blue-300 flex items-start gap-2">
            <span className="material-symbols-outlined text-base mt-0.5">info</span>
            <span>Permission templates are pre-configured starting points for common roles. Click <strong>Create Role</strong> to clone the template into a new role you can edit.</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
              <section key={key} className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                      <span className="material-symbols-outlined">{preset.icon}</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">{preset.label}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">{preset.description}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleCreateFromTemplate({ name: preset.label, permissions: preset.permissions })}
                    className="px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-xl text-xs font-bold shadow-md hover:opacity-90 transition-all disabled:opacity-40 whitespace-nowrap"
                  >
                    Create Role
                  </button>
                </div>
                <div className="p-5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{preset.permissions.includes('*') ? 'All permissions' : `${preset.permissions.length} permissions`}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {preset.permissions.includes('*') ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">Full Access</span>
                    ) : (
                      preset.permissions.slice(0, 12).map(p => (
                        <span key={p} className="text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">{p}</span>
                      ))
                    )}
                    {!preset.permissions.includes('*') && preset.permissions.length > 12 && (
                      <span className="text-[10px] font-medium text-gray-400 px-2 py-1">+{preset.permissions.length - 12} more</span>
                    )}
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {/* ─── INVITATIONS TAB ─────────────────────────────────────── */}
      {activeTab === 'invitations' && (
        <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Pending Invitations</h3>
            <p className="text-xs text-gray-500 mt-0.5">Members who have been invited but haven't joined yet.</p>
          </div>
          {membersList.filter(m => m.status === 'invited').length === 0 ? (
            <div className="p-12 text-center">
              <span className="material-symbols-outlined text-4xl text-gray-300 mb-3 block">mark_email_read</span>
              <p className="text-sm text-gray-500">No pending invitations.</p>
              <button
                type="button"
                onClick={() => { setActiveTab('members'); setShowInviteForm(true); }}
                className="mt-4 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-bold shadow-md hover:opacity-90 transition-all"
              >
                Invite Member
              </button>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <th className="px-6 py-3">Member</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Invited</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50 text-sm">
                {membersList.filter(m => m.status === 'invited').map(m => (
                  <tr key={m.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-xs">
                          {initials(m.name || m.email)}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 dark:text-white">{m.name || m.email?.split('@')[0]}</div>
                          <div className="text-xs text-gray-500">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 capitalize text-gray-700 dark:text-gray-300">{m.role_name}</td>
                    <td className="px-6 py-4 text-gray-500 text-xs">{relativeTime(m.joined_at)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const result = await iamApi.resendInvite({ email: m.email, role_id: m.role_id });
                              if (result?.accept_url) {
                                await navigator.clipboard.writeText(result.accept_url);
                                showMessage('success', 'Invite link copied.');
                              } else {
                                showMessage('success', 'Invite resent.');
                              }
                            } catch (err: any) {
                              showMessage('error', err?.message || 'Unable to resend.');
                            }
                          }}
                          className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold shadow-card hover:bg-gray-50 transition-all"
                        >
                          Resend
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm(`Revoke invitation for ${m.email}?`)) return;
                            try {
                              await iamApi.updateMember(m.id, { status: 'suspended' });
                              showMessage('success', 'Invite revoked.');
                              await refetchMembers();
                            } catch (err: any) {
                              showMessage('error', err?.message || 'Unable to revoke.');
                            }
                          }}
                          className="px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-bold shadow-card hover:bg-red-50 transition-all"
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* ─── AUDIT TAB ──────────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">IAM Audit Log</h3>
            <p className="text-xs text-gray-500 mt-0.5">Track all member, role and permission changes in this workspace.</p>
          </div>
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-gray-300 mb-3 block">history</span>
            <p className="text-sm text-gray-500">Audit log integration is on the roadmap.</p>
            <p className="text-xs text-gray-400 mt-1">All IAM mutations are recorded server-side. Visualization coming soon.</p>
          </div>
        </section>
      )}
    </div>
  );
}

