import React, { useState } from 'react';

type SubTab = 'members' | 'teams' | 'roles' | 'templates' | 'audit';

export default function TeamsRolesTab() {
  const [activeTab, setActiveTab] = useState<SubTab>('members');

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Top Navigation / Sub-tabs */}
      <div className="flex items-center gap-6 border-b border-gray-100 dark:border-gray-800 pb-4">
        {[
          { id: 'members', label: 'Members & Seats' },
          { id: 'teams', label: 'Teams' },
          { id: 'roles', label: 'Roles & Permissions' },
          { id: 'templates', label: 'Permission Templates' },
          { id: 'audit', label: 'Audit Log' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as SubTab)}
            className={`text-sm font-bold transition-colors ${
              activeTab === tab.id
                ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 pb-4 -mb-[17px]'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      {activeTab === 'members' && <MembersSeatsView />}
      {activeTab === 'teams' && <TeamsView />}
      {activeTab === 'roles' && <RolesPermissionsView />}
      {activeTab === 'templates' && <PermissionTemplatesView />}
      {activeTab === 'audit' && <AuditLogView />}
    </div>
  );
}

function MembersSeatsView() {
  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Seats & Access Overview Block */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Seats', value: '24 / 50', icon: 'group', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400' },
          { label: 'Active Members', value: '22', icon: 'person_check', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400' },
          { label: 'Pending Invites', value: '2', icon: 'schedule', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400' },
          { label: 'Admins', value: '3', icon: 'admin_panel_settings', color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400' },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4 shadow-sm">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.color}`}>
              <span className="material-symbols-outlined text-lg">{stat.icon}</span>
            </div>
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{stat.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left Column: Members List */}
        <div className="w-1/3 flex flex-col gap-4 bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
            <div className="relative flex-1 mr-4">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">search</span>
              <input type="text" placeholder="Search members..." className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" />
            </div>
            <button className="flex items-center gap-1.5 px-3 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-xs font-bold hover:opacity-90 transition-all whitespace-nowrap">
              <span className="material-symbols-outlined text-sm">person_add</span>
              Invite
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
            {[
              { name: 'Sarah Jenkins', email: 'sarah@company.com', role: 'Admin', team: 'Engineering', status: 'Active', selected: true },
              { name: 'Michael Chen', email: 'michael@company.com', role: 'Agent', team: 'Support', status: 'Active', selected: false },
              { name: 'Emily Rodriguez', email: 'emily@company.com', role: 'Viewer', team: 'Billing', status: 'Pending', selected: false },
              { name: 'David Kim', email: 'david@company.com', role: 'Approver', team: 'Security', status: 'Active', selected: false },
              { name: 'Alex Thompson', email: 'alex@company.com', role: 'Agent', team: 'Support', status: 'Active', selected: false },
            ].map((member, i) => (
              <button key={i} className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${member.selected ? 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border border-transparent'}`}>
                <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-xs">
                  {member.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <h4 className={`text-sm font-bold truncate ${member.selected ? 'text-indigo-900 dark:text-indigo-100' : 'text-gray-900 dark:text-white'}`}>{member.name}</h4>
                    {member.status === 'Pending' && <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">Pending</span>}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{member.email}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{member.role}</span>
                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{member.team}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right Column: Member Access Configuration */}
        <div className="flex-1 flex flex-col bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start bg-gray-50/50 dark:bg-gray-800/20">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xl border-2 border-white dark:border-gray-800 shadow-sm">
                SJ
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Sarah Jenkins</h2>
                <p className="text-sm text-gray-500">sarah@company.com • Last active: 2 hours ago</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Suspend Access
              </button>
              <button className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors">
                Save Changes
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Role & Team */}
            <section>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Role & Team Assignment</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Base Role</label>
                  <select className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all">
                    <option>Admin (Full Access)</option>
                    <option>Agent (Standard)</option>
                    <option>Viewer (Read-only)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Primary Team</label>
                  <select className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all">
                    <option>Engineering</option>
                    <option>Support</option>
                    <option>Billing</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Workspace Area Permissions */}
            <section>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Workspace Area Permissions</h3>
                <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400 px-2 py-1 rounded-full">Inherited from Admin role</span>
              </div>
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                {[
                  { area: 'Inbox & Tickets', read: true, write: true, delete: true },
                  { area: 'Knowledge Base', read: true, write: true, delete: false },
                  { area: 'Workflows & Automation', read: true, write: true, delete: true },
                  { area: 'Reports & Analytics', read: true, write: false, delete: false },
                  { area: 'Billing & Subscriptions', read: false, write: false, delete: false },
                ].map((perm, i) => (
                  <div key={i} className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{perm.area}</span>
                    <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={perm.read} readOnly className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                        <span className="text-xs text-gray-600 dark:text-gray-400">Read</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={perm.write} readOnly className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                        <span className="text-xs text-gray-600 dark:text-gray-400">Write</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={perm.delete} readOnly className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                        <span className="text-xs text-gray-600 dark:text-gray-400">Delete</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Special Permissions / Overrides */}
            <section>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Special Permissions (Overrides)</h3>
              <div className="space-y-3">
                {[
                  { title: 'Bypass Approval Workflows', desc: 'Allow user to merge or publish without required approvals.', active: true },
                  { title: 'Manage API Keys', desc: 'Create, view, and revoke workspace API keys.', active: true },
                  { title: 'Export Workspace Data', desc: 'Download bulk reports and customer data exports.', active: false },
                ].map((override, i) => (
                  <div key={i} className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-700/50">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">{override.title}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">{override.desc}</p>
                    </div>
                    <button className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${override.active ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${override.active ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Scope / Restrictions */}
            <section>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Data Scope & Restrictions</h3>
              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">IP Allowlist</h4>
                    <p className="text-xs text-gray-500">Restrict access to specific IP addresses.</p>
                  </div>
                  <button className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Configure</button>
                </div>
                <div className="h-px bg-gray-100 dark:bg-gray-800" />
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">Data Visibility</h4>
                    <p className="text-xs text-gray-500">Limit visibility to specific tags or regions.</p>
                  </div>
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">Global (No restrictions)</span>
                </div>
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}

function TeamsView() {
  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Teams</h3>
          <p className="text-sm text-gray-500">Organize members into teams for easier access management.</p>
        </div>
        <button className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-all">
          <span className="material-symbols-outlined text-sm">add</span>
          Create Team
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { name: 'Engineering', members: 12, lead: 'Sarah Jenkins', description: 'Core product development and infrastructure.' },
          { name: 'Support', members: 8, lead: 'Alex Thompson', description: 'Customer support and success team.' },
          { name: 'Billing', members: 3, lead: 'Emily Rodriguez', description: 'Finance and billing operations.' },
          { name: 'Security', members: 4, lead: 'David Kim', description: 'Security and compliance team.' },
        ].map((team, i) => (
          <div key={i} className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex justify-between items-start">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <span className="material-symbols-outlined">group</span>
              </div>
              <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <span className="material-symbols-outlined text-lg">more_vert</span>
              </button>
            </div>
            <div>
              <h4 className="text-base font-bold text-gray-900 dark:text-white">{team.name}</h4>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{team.description}</p>
            </div>
            <div className="mt-auto pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <div className="flex -space-x-2">
                {[...Array(Math.min(team.members, 3))].map((_, j) => (
                  <div key={j} className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-card-dark flex items-center justify-center text-[8px] font-bold text-gray-600 dark:text-gray-300">
                    {String.fromCharCode(65 + j)}
                  </div>
                ))}
                {team.members > 3 && (
                  <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-white dark:border-card-dark flex items-center justify-center text-[8px] font-bold text-gray-500">
                    +{team.members - 3}
                  </div>
                )}
              </div>
              <span className="text-xs font-medium text-gray-500">{team.members} members</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RolesPermissionsView() {
  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Roles & Permissions</h3>
          <p className="text-sm text-gray-500">Define custom roles and their access levels across the workspace.</p>
        </div>
        <button className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-all">
          <span className="material-symbols-outlined text-sm">add</span>
          Create Custom Role
        </button>
      </div>

      <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/50 dark:bg-gray-800/20 border-b border-gray-100 dark:border-gray-800">
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Role Name</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Members</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Description</th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {[
              { name: 'Admin', type: 'System Default', members: 3, desc: 'Full access to all workspace settings and data.' },
              { name: 'Agent', type: 'System Default', members: 15, desc: 'Standard access to inbox, tickets, and knowledge base.' },
              { name: 'Viewer', type: 'System Default', members: 4, desc: 'Read-only access to specified areas.' },
              { name: 'Billing Manager', type: 'Custom', members: 2, desc: 'Access to billing, invoices, and subscription settings.' },
            ].map((role, i) => (
              <tr key={i} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-gray-400 text-sm">shield</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{role.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${role.type === 'System Default' ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'}`}>
                    {role.type}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{role.members}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{role.desc}</td>
                <td className="px-6 py-4 text-right">
                  <button className="text-indigo-600 dark:text-indigo-400 text-sm font-bold hover:underline">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PermissionTemplatesView() {
  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Permission Templates</h3>
          <p className="text-sm text-gray-500">Reusable permission sets that can be applied to roles or individual users.</p>
        </div>
        <button className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-all">
          <span className="material-symbols-outlined text-sm">add</span>
          Create Template
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[
          { name: 'Standard Support Agent', desc: 'Basic access for handling tickets and reading knowledge base.', areas: 3 },
          { name: 'Content Creator', desc: 'Write access to knowledge base and templates, read-only inbox.', areas: 2 },
          { name: 'Financial Auditor', desc: 'Read-only access to billing and reports.', areas: 2 },
          { name: 'Team Lead', desc: 'Agent access plus reporting and team management.', areas: 4 },
        ].map((template, i) => (
          <div key={i} className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 flex items-center justify-center">
                  <span className="material-symbols-outlined">description</span>
                </div>
                <div>
                  <h4 className="text-base font-bold text-gray-900 dark:text-white">{template.name}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">{template.areas} areas configured</p>
                </div>
              </div>
              <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <span className="material-symbols-outlined text-lg">more_vert</span>
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{template.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditLogView() {
  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Audit Log</h3>
          <p className="text-sm text-gray-500">Track all access and permission changes across the workspace.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <span className="material-symbols-outlined text-sm">filter_list</span>
            Filter
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <span className="material-symbols-outlined text-sm">download</span>
            Export
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/50 dark:bg-gray-800/20 border-b border-gray-100 dark:border-gray-800">
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Event</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Actor</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Target</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date & Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {[
              { event: 'Role Changed', detail: 'Changed role from Agent to Admin', actor: 'Sarah Jenkins', target: 'Michael Chen', date: 'Oct 24, 2023 14:32' },
              { event: 'Member Invited', detail: 'Invited as Viewer to Billing team', actor: 'Sarah Jenkins', target: 'Emily Rodriguez', date: 'Oct 24, 2023 10:15' },
              { event: 'Permission Updated', detail: 'Granted "Export Workspace Data"', actor: 'David Kim', target: 'Support Team', date: 'Oct 23, 2023 16:45' },
              { event: 'Team Created', detail: 'Created "Security" team', actor: 'Sarah Jenkins', target: 'System', date: 'Oct 22, 2023 09:00' },
            ].map((log, i) => (
              <tr key={i} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{log.event}</span>
                    <span className="text-xs text-gray-500">{log.detail}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-300">{log.actor}</td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-300">{log.target}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{log.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
