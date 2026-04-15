import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/hooks';
import { iamApi } from '../../api/client';
import LoadingState from '../LoadingState';

type SubTab = 'members' | 'teams' | 'roles' | 'templates' | 'audit';
type SaveHandler = (() => Promise<void> | void) | null;
type Props = { onSaveReady?: (handler: SaveHandler) => void };

const PERMISSION_KEYS = [
  'inbox.read', 'inbox.write', 'customers.read', 'customers.write', 'orders.read', 'orders.write',
  'payments.read', 'payments.write', 'returns.read', 'returns.write', 'approvals.read', 'approvals.write',
  'knowledge.read', 'knowledge.write', 'reports.read', 'reports.export', 'integrations.read', 'integrations.write',
  'settings.read', 'settings.write', 'members.read', 'members.invite',
];

const ROLE_TEMPLATES = [
  { name: 'Support Lead', permissions: ['inbox.read', 'inbox.write', 'customers.read', 'orders.read', 'returns.read', 'approvals.read', 'knowledge.read', 'knowledge.write', 'reports.read'] },
  { name: 'Billing Manager', permissions: ['customers.read', 'orders.read', 'payments.read', 'payments.write', 'approvals.read', 'reports.read', 'reports.export'] },
  { name: 'Agent', permissions: ['inbox.read', 'inbox.write', 'customers.read', 'orders.read', 'returns.read', 'knowledge.read'] },
  { name: 'Viewer', permissions: ['inbox.read', 'customers.read', 'orders.read', 'returns.read', 'approvals.read', 'knowledge.read', 'reports.read'] },
];

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

export default function TeamsRolesTab({ onSaveReady }: Props) {
  const [activeTab, setActiveTab] = useState<SubTab>('members');
  const { data: members, loading: membersLoading, error: membersError } = useApi<any[]>(iamApi.members);
  const { data: roles, loading: rolesLoading, error: rolesError } = useApi<any[]>(iamApi.roles);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [memberStatus, setMemberStatus] = useState('active');
  const [memberRoleId, setMemberRoleId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [roleName, setRoleName] = useState('');
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const membersList = members || [];
  const rolesList = roles || [];
  const selectedMember = useMemo(() => membersList.find((m: any) => m.id === selectedMemberId) || null, [membersList, selectedMemberId]);
  const selectedRole = useMemo(() => rolesList.find((r: any) => r.id === selectedRoleId) || null, [rolesList, selectedRoleId]);
  const currentMemberRole = useMemo(() => rolesList.find((r: any) => r.id === memberRoleId) || null, [memberRoleId, rolesList]);

  useEffect(() => {
    if (!selectedMember && membersList.length > 0) setSelectedMemberId(membersList[0].id);
  }, [membersList, selectedMember]);

  useEffect(() => {
    if (!selectedRole && rolesList.length > 0) setSelectedRoleId(rolesList[0].id);
  }, [rolesList, selectedRole]);

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

  useEffect(() => {
    if (!inviteRoleId && rolesList.length > 0) setInviteRoleId(rolesList[0].id);
  }, [inviteRoleId, rolesList]);

  const handleSaveMember = useCallback(async () => {
    if (!selectedMember) return;
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await iamApi.updateMember(selectedMember.id, { status: memberStatus, role_id: memberRoleId || undefined });
      setStatusMessage('Member saved.');
    } catch (error: any) {
      setStatusMessage(error?.message || 'Unable to save member.');
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [memberRoleId, memberStatus, selectedMember]);

  const handleSaveRole = useCallback(async () => {
    if (!selectedRole) return;
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await iamApi.updateRole(selectedRole.id, { name: roleName, permissions: rolePermissions });
      setStatusMessage('Role saved.');
    } catch (error: any) {
      setStatusMessage(error?.message || 'Unable to save role.');
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [roleName, rolePermissions, selectedRole]);

  useEffect(() => {
    const handler = activeTab === 'members' ? handleSaveMember : activeTab === 'roles' ? handleSaveRole : null;
    onSaveReady?.(handler);
    return () => onSaveReady?.(null);
  }, [activeTab, handleSaveMember, handleSaveRole, onSaveReady]);

  const inviteMember = async () => {
    if (!inviteEmail || !inviteRoleId) return;
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await iamApi.inviteMember({ email: inviteEmail.trim(), name: inviteName.trim() || undefined, role_id: inviteRoleId });
      setInviteEmail('');
      setInviteName('');
      setStatusMessage('Invite sent.');
    } catch (error: any) {
      setStatusMessage(error?.message || 'Unable to invite member.');
    } finally {
      setIsSaving(false);
    }
  };

  const createRoleFromTemplate = async (template: { name: string; permissions: string[] }) => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await iamApi.createRole(template);
      setStatusMessage(`Created ${template.name}.`);
    } catch (error: any) {
      setStatusMessage(error?.message || 'Unable to create role.');
    } finally {
      setIsSaving(false);
    }
  };

  if (membersLoading || rolesLoading) return <LoadingState title="Loading members and roles" message="Synchronizing workspace IAM data." compact />;
  if (membersError || rolesError) return <div className="p-6 text-sm text-red-500">Error loading members or roles.</div>;

  return (
    <div className="flex flex-col gap-6 h-full">
      {statusMessage && <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/15 dark:text-emerald-300">{statusMessage}</div>}

      <div className="flex items-center gap-6 border-b border-gray-100 dark:border-gray-800 pb-4">
        {[
          { id: 'members', label: 'Members & Seats' },
          { id: 'teams', label: 'Teams' },
          { id: 'roles', label: 'Roles & Permissions' },
          { id: 'templates', label: 'Permission Templates' },
          { id: 'audit', label: 'Audit Log' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as SubTab)} className={`text-sm font-bold transition-colors ${activeTab === tab.id ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 pb-4 -mb-[17px]' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}>{tab.label}</button>
        ))}
      </div>

      {activeTab === 'members' && (
        <div className="flex flex-col gap-6 h-full">
          <div className="grid grid-cols-4 gap-4">
            {[['Total Seats', `${membersList.length} / 50`, 'group'], ['Active Members', String(membersList.length), 'person_check'], ['Pending Invites', String(membersList.filter((m: any) => m.status === 'invited').length), 'schedule'], ['Admins', String(membersList.filter((m: any) => String(m.role).toLowerCase().includes('admin')).length), 'admin_panel_settings']].map(([label, value, icon], i) => (
              <div key={i} className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4 shadow-sm">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400"><span className="material-symbols-outlined text-lg">{icon}</span></div>
                <div><p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{label}</p><p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p></div>
              </div>
            ))}
          </div>

          <div className="flex gap-6 flex-1 min-h-0">
            <div className="w-1/3 flex flex-col gap-4 bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex gap-3">
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="member@company.com" className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs" />
                <button type="button" onClick={() => void inviteMember()} className="px-3 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-xs font-bold">Invite</button>
              </div>
              <div className="px-5 pb-4 grid grid-cols-2 gap-3">
                <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Full name" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs" />
                <select value={inviteRoleId} onChange={e => setInviteRoleId(e.target.value)} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs">
                  {rolesList.map((role: any) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {membersList.map((member: any) => (
                  <button key={member.id} type="button" onClick={() => setSelectedMemberId(member.id)} className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${selectedMemberId === member.id ? 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border border-transparent'}`}>
                    <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-xs">{(member.name || member.email || 'M').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-0.5"><h4 className={`text-sm font-bold truncate ${selectedMemberId === member.id ? 'text-indigo-900 dark:text-indigo-100' : 'text-gray-900 dark:text-white'}`}>{member.name}</h4></div>
                      <p className="text-xs text-gray-500 truncate">{member.email}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded capitalize">{member.role_name || member.role}</span>
                        <span className="text-[10px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded capitalize">{member.status}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 flex flex-col bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start bg-gray-50/50 dark:bg-gray-800/20">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedMember ? selectedMember.name : 'Select a member'}</h2>
                  <p className="text-sm text-gray-500">{selectedMember ? selectedMember.email : 'Open a member to update role and status.'}</p>
                </div>
                <button type="button" onClick={() => void handleSaveMember().catch(() => undefined)} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold">Save Changes</button>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold text-gray-700 dark:text-gray-300">Base Role</label><select value={memberRoleId} onChange={e => setMemberRoleId(e.target.value)} className="mt-1 w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm">{rolesList.map((role: any) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div>
                  <div><label className="text-xs font-bold text-gray-700 dark:text-gray-300">Access Status</label><select value={memberStatus} onChange={e => setMemberStatus(e.target.value)} className="mt-1 w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm"><option value="active">Active</option><option value="invited">Invited</option><option value="suspended">Suspended</option></select></div>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Permission Snapshot</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {['inbox.read', 'customers.read', 'orders.read', 'payments.read', 'returns.read', 'approvals.read'].map(permission => (
                      <div key={permission} className="flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                        <span className="text-sm text-gray-700 dark:text-gray-300">{permission}</span>
                        <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${currentMemberRole?.permissions?.includes(permission) ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 border border-gray-200 dark:bg-gray-800 dark:text-gray-400'}`}>{currentMemberRole?.permissions?.includes(permission) ? 'Allowed' : 'No access'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'roles' && (
        <div className="flex gap-6 h-full">
          <div className="w-1/3 bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className="font-bold text-gray-900 dark:text-white">Roles</h3>
              <button type="button" onClick={() => void createRoleFromTemplate(ROLE_TEMPLATES[0])} className="px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-xs font-bold">Create</button>
            </div>
            <div className="p-2 space-y-2">
              {rolesList.map((role: any) => (
                <button key={role.id} type="button" onClick={() => setSelectedRoleId(role.id)} className={`w-full text-left rounded-xl border px-4 py-3 ${selectedRoleId === role.id ? 'border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20' : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}>
                  <div className="font-bold text-gray-900 dark:text-white">{role.name}</div>
                  <div className="text-xs text-gray-500">{role.is_system ? 'System Default' : 'Custom'} • {role.permission_count || 0} permissions</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Roles & Permissions</h3>
                <p className="text-sm text-gray-500">Define workspace access levels.</p>
              </div>
              <button type="button" onClick={() => void handleSaveRole().catch(() => undefined)} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold">Save Changes</button>
            </div>
            <div className="p-6 space-y-6">
              <div><label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Role Name</label><input value={roleName} onChange={e => setRoleName(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                {PERMISSION_KEYS.map(permission => (
                  <label key={permission} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 cursor-pointer">
                    <input type="checkbox" checked={rolePermissions.includes(permission)} onChange={e => setRolePermissions(current => e.target.checked ? [...current, permission] : current.filter(item => item !== permission))} className="w-4 h-4 text-indigo-600 border-gray-300 rounded" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{permission}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'teams' && (
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Teams</h3>
              <p className="text-sm text-gray-500">Teams are currently grouped by role membership.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {rolesList.map((role: any) => (
              <div key={role.id} className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                <h4 className="text-base font-bold text-gray-900 dark:text-white">{role.name}</h4>
                <p className="text-xs text-gray-500 mt-1">{membersList.filter((member: any) => member.role_id === role.id).length} members</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="grid grid-cols-2 gap-4">
          {ROLE_TEMPLATES.map(template => (
            <div key={template.name} className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-card">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-base font-bold text-gray-900 dark:text-white">{template.name}</h4>
                <button type="button" onClick={() => void createRoleFromTemplate(template)} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold">Create</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {template.permissions.map(permission => <span key={permission} className="text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-full">{permission}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-4 border border-blue-100 dark:border-blue-800/30 flex gap-3 items-center">
            <span className="material-symbols-outlined text-blue-500 text-xl">admin_panel_settings</span>
            <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">Permissions are managed by the workspace administrator.</p>
          </div>
          <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-card">
            <p className="text-sm text-gray-500">Audit log integration is still read-only, but the underlying access management is now wired.</p>
          </div>
        </div>
      )}
    </div>
  );
}
