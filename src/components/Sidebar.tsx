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
  const superAgentItem: SidebarItem = {
    target: { page: 'super_agent', entityType: 'workspace', section: 'command-center', sourceContext: 'sidebar' },
    label: 'Super Agent',
    icon: 'auto_awesome',
  };

  const navItems: SidebarItem[] = [
    { target: 'inbox', label: 'Inbox', icon: 'inbox', badge: 4 },
    { target: 'case_graph', label: 'Case Graph', icon: 'hub' },
    { target: 'customers', label: 'Customers', icon: 'people' },
    { target: 'orders', label: 'Orders', icon: 'shopping_bag' },
    { target: 'payments', label: 'Payments', icon: 'payments' },
    { target: 'returns', label: 'Returns', icon: 'assignment_return' },
    { target: 'approvals', label: 'Approvals', icon: 'check_circle' },
    { target: 'ai_studio', label: 'AI Studio', icon: 'smart_toy' },
    { target: 'workflows', label: 'Workflows', icon: 'account_tree' },
    { target: 'knowledge', label: 'Knowledge', icon: 'menu_book' },
    { target: 'reports', label: 'Reports', icon: 'bar_chart' },
    { target: 'tools_integrations', label: 'Integrations', icon: 'extension' },
  ];

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
          {/* Super Agent — single item at the top */}
          <div className="space-y-1">
            <button
              onClick={() => onPageChange(superAgentItem.target)}
              className={`relative flex items-center ${isOpen ? 'px-3 py-1.5 w-full justify-start' : 'justify-center w-10 h-10 mx-auto'} text-sm font-medium rounded-md group transition-all ${
                currentPage === 'super_agent'
                  ? 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
              title={!isOpen ? superAgentItem.label : undefined}
            >
              <span className={`material-symbols-outlined text-xl flex-shrink-0 ${isOpen ? 'mr-3' : ''} ${
                currentPage === 'super_agent' ? 'text-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200'
              }`}>{superAgentItem.icon}</span>
              {isOpen && <span className="block truncate">{superAgentItem.label}</span>}
            </button>
          </div>

          <div className="space-y-1">
            {navItems.map((item) => (
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
                {isOpen && <span className="block truncate flex-1 text-left">{item.label}</span>}
                {item.badge ? (
                  <span className={`${isOpen ? 'ml-auto' : 'absolute -top-1 -right-1'} bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-200 py-0.5 px-2 rounded-full text-[10px] font-semibold`}>
                    {item.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
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
