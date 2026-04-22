import React from 'react';
import { NavigateInput, NavigationTarget, Page } from '../types';

interface SidebarProps {
  currentPage: Page;
  currentSection?: string | null;
  onPageChange: (target: NavigateInput) => void;
  isOpen: boolean;
  onToggle: () => void;
}

type SidebarItem = {
  target: NavigateInput;
  label: string;
  icon: string;
  badge?: number;
  description?: string;
};

function targetPageOf(target: NavigateInput) {
  return typeof target === 'string' ? target : target.page;
}

function targetSectionOf(target: NavigateInput) {
  return typeof target === 'string' ? null : target.section ?? null;
}

function isTargetActive(currentPage: Page, currentSection: string | null | undefined, target: NavigateInput) {
  return currentPage === targetPageOf(target) && (targetSectionOf(target) ? currentSection === targetSectionOf(target) : true);
}

export default function Sidebar({ currentPage, currentSection, onPageChange, isOpen, onToggle }: SidebarProps) {
  const superAgentItems: SidebarItem[] = [
    {
      target: { page: 'super_agent', entityType: 'workspace', section: 'command-center', sourceContext: 'sidebar' },
      label: 'Command Center',
      icon: 'auto_awesome',
      description: 'Investiga, navega y ejecuta acciones.',
    },
    {
      target: { page: 'super_agent', entityType: 'workspace', section: 'live-runs', sourceContext: 'sidebar' },
      label: 'Live Runs',
      icon: 'monitoring',
      description: 'Sigue agentes, pasos y ejecuciones.',
    },
    {
      target: { page: 'super_agent', entityType: 'workspace', section: 'guardrails', sourceContext: 'sidebar' },
      label: 'Guardrails',
      icon: 'shield',
      description: 'Permisos, approvals y trazabilidad.',
    },
  ];

  const navGroups: Array<{
    title: string;
    items: SidebarItem[];
  }> = [
    {
      title: 'Operations',
      items: [
        { target: 'inbox', label: 'Inbox', icon: 'inbox', badge: 4 },
        { target: 'case_graph', label: 'Case Graph', icon: 'hub' },
        { target: 'customers', label: 'Customers', icon: 'people' },
        { target: 'orders', label: 'Orders', icon: 'shopping_bag' },
        { target: 'payments', label: 'Payments', icon: 'payments' },
        { target: 'returns', label: 'Returns', icon: 'assignment_return' },
        { target: 'approvals', label: 'Approvals', icon: 'check_circle' },
      ],
    },
    {
      title: 'Automation',
      items: [
        { target: 'ai_studio', label: 'AI Studio', icon: 'smart_toy' },
        { target: 'workflows', label: 'Workflows', icon: 'account_tree' },
        { target: 'knowledge', label: 'Knowledge', icon: 'menu_book' },
        { target: 'reports', label: 'Reports', icon: 'bar_chart' },
        { target: 'tools_integrations', label: 'Integrations', icon: 'extension' },
      ],
    },
  ];

  const superAgentActive = currentPage === 'super_agent';

  return (
    <aside className={`${isOpen ? 'w-64' : 'w-20'} bg-sidebar-light dark:bg-sidebar-dark flex-shrink-0 flex flex-col justify-between border-r border-transparent dark:border-gray-800 transition-all duration-300 py-4 overflow-hidden relative`}>
      <div className="flex flex-col">
        <div className={`h-14 flex items-center ${isOpen ? 'px-4' : 'justify-center'} mb-2 relative w-full`}>
          <div className="w-8 h-8 bg-black dark:bg-white rounded-md flex items-center justify-center shadow-sm flex-shrink-0">
            <span className="material-symbols-outlined text-white dark:text-black text-xl">graphic_eq</span>
          </div>
          {isOpen && (
            <button 
              onClick={onToggle}
              className="ml-auto w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-all"
            >
              <span className="material-symbols-outlined text-xl">menu_open</span>
            </button>
          )}
          {!isOpen && (
            <button 
              onClick={onToggle}
              className="absolute inset-0 w-full h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
            >
              <span className="material-symbols-outlined text-xl">view_sidebar</span>
            </button>
          )}
        </div>

        <nav className="space-y-3 px-2 flex flex-col">
          <div className="space-y-2">
            {isOpen ? (
              <p className="px-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                Superagent
              </p>
            ) : null}

            <button
              onClick={() => onPageChange({ page: 'super_agent', entityType: 'workspace', section: 'command-center', sourceContext: 'sidebar' })}
              className={`relative flex items-start ${isOpen ? 'px-3 py-3 w-full justify-start' : 'justify-center w-12 h-12 mx-auto'} rounded-2xl border transition-all ${
                superAgentActive
                  ? 'border-secondary/30 bg-[linear-gradient(135deg,rgba(109,40,217,0.12),rgba(59,130,246,0.08))] text-gray-900 dark:text-white'
                  : 'border-gray-200 bg-white/70 text-gray-700 hover:border-secondary/30 hover:bg-white dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-200'
              }`}
              title={!isOpen ? 'Superagent' : undefined}
            >
              <span className={`material-symbols-outlined text-[22px] flex-shrink-0 ${isOpen ? 'mr-3 mt-0.5' : ''} ${
                superAgentActive ? 'text-secondary' : 'text-gray-500 dark:text-gray-400'
              }`}>
                auto_awesome
              </span>
              {isOpen ? (
                <div className="min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">Superagent</span>
                    <span className="rounded-full border border-secondary/20 bg-secondary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-secondary">
                      AI
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    Capa operativa central del SaaS.
                  </p>
                </div>
              ) : null}
            </button>

            {isOpen ? (
              <div className="ml-4 space-y-1 border-l border-gray-200 pl-3 dark:border-gray-800">
                {superAgentItems.map((item) => {
                  const active = isTargetActive(currentPage, currentSection, item.target);
                  return (
                    <button
                      key={`${targetPageOf(item.target)}-${targetSectionOf(item.target) || 'root'}`}
                      onClick={() => onPageChange(item.target)}
                      className={`w-full rounded-xl px-3 py-2 text-left transition-all ${
                        active
                          ? 'bg-secondary/10 text-secondary'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                      {item.description ? (
                        <p className={`mt-1 pl-7 text-[11px] leading-5 ${active ? 'text-secondary/80' : 'text-gray-400 dark:text-gray-500'}`}>
                          {item.description}
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <button
                onClick={() => onPageChange({ page: 'super_agent', entityType: 'workspace', section: 'command-center', sourceContext: 'sidebar' })}
                className={`relative justify-center w-10 h-10 mx-auto flex items-center rounded-xl transition-all ${
                  superAgentActive
                    ? 'bg-secondary/10 text-secondary'
                    : 'text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}
                title="Superagent"
              >
                <span className="material-symbols-outlined text-xl">auto_awesome</span>
              </button>
            )}
          </div>

          {navGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              {isOpen ? (
                <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                  {group.title}
                </p>
              ) : null}
              {group.items.map((item) => (
                <button
                  key={typeof item.target === 'string' ? item.target : `${item.target.page}-${item.target.section || 'root'}`}
                  onClick={() => onPageChange(item.target)}
                  className={`relative flex items-center ${isOpen ? 'px-3 py-1.5 w-full justify-start' : 'justify-center w-10 h-10 mx-auto'} text-sm font-medium rounded-md group transition-all ${
                    isTargetActive(currentPage, currentSection, item.target)
                      ? 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
                  }`}
                  title={!isOpen ? item.label : undefined}
                >
                  <span className={`material-symbols-outlined text-xl flex-shrink-0 ${isOpen ? 'mr-3' : ''} ${
                    isTargetActive(currentPage, currentSection, item.target) ? 'text-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200'
                  }`}>{item.icon}</span>
                  {isOpen && <span className="truncate">{item.label}</span>}
                  {item.badge && (
                    <span className={`${isOpen ? 'ml-auto' : 'absolute -top-1 -right-1'} bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-200 py-0.5 px-2 rounded-full text-[10px] font-semibold`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </div>
      
      <div className="px-2 pb-4 space-y-0.5 flex flex-col w-full">
        <button 
          onClick={() => onPageChange('upgrade')}
          className={`flex items-center ${isOpen ? 'px-3 py-1.5 w-full justify-start' : 'justify-center w-10 h-10 mx-auto'} text-sm font-medium rounded-md group transition-all ${currentPage === 'upgrade' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'}`} 
          title={!isOpen ? "Upgrade" : undefined}
        >
          <span className={`material-symbols-outlined text-xl flex-shrink-0 ${isOpen ? 'mr-3' : ''} ${currentPage === 'upgrade' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200'}`}>bolt</span>
          {isOpen && <span>Upgrade</span>}
        </button>
        <button className={`flex items-center ${isOpen ? 'px-3 py-1.5 w-full justify-start' : 'justify-center w-10 h-10 mx-auto'} text-sm font-medium text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800 group transition-all`} title={!isOpen ? "Search" : undefined}>
          <span className={`material-symbols-outlined text-xl flex-shrink-0 ${isOpen ? 'mr-3' : ''} text-gray-500 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200`}>search</span>
          {isOpen && (
            <>
              <span>Search</span>
              <div className="ml-auto flex space-x-1">
                <span className="bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600">Ctrl</span>
                <span className="bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600">K</span>
              </div>
            </>
          )}
        </button>

        <button 
          onClick={() => onPageChange('settings')}
          className={`flex items-center ${isOpen ? 'px-3 py-1.5 w-full justify-start' : 'justify-center w-10 h-10 mx-auto'} text-sm font-medium rounded-md group transition-all ${currentPage === 'settings' ? 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'}`} 
          title={!isOpen ? "Settings" : undefined}
        >
          <span className={`material-symbols-outlined text-xl flex-shrink-0 ${isOpen ? 'mr-3' : ''} ${currentPage === 'settings' ? 'text-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200'}`}>settings</span>
          {isOpen && <span>Settings</span>}
        </button>

        <button 
          onClick={() => onPageChange('profile')}
          className={`w-full flex items-center ${isOpen ? 'px-3 py-2' : 'justify-center py-2'} transition-colors mt-1 rounded-md ${currentPage === 'profile' ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-200 dark:hover:bg-gray-800'}`}
          title={!isOpen ? "Profile" : undefined}
        >
          <img src="https://i.pravatar.cc/150?img=11" alt="User" className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex-shrink-0" />
          {isOpen && (
            <div className="ml-3 text-left flex-1 overflow-hidden">
              <p className={`text-sm font-medium truncate ${currentPage === 'profile' ? 'text-blue-700 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>Alex Morgan</p>
              <p className={`text-xs truncate ${currentPage === 'profile' ? 'text-blue-600/80 dark:text-blue-400/80' : 'text-gray-500 dark:text-gray-400'}`}>Support Lead</p>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
