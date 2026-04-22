import React from 'react';
import { Page } from '../types';

interface SidebarProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function Sidebar({ currentPage, onPageChange, isOpen, onToggle }: SidebarProps) {
  const navGroups: Array<{
    title: string;
    items: Array<{ id: Page; label: string; icon: string; badge?: number }>;
  }> = [
    {
      title: 'Superagent',
      items: [
        { id: 'super_agent', label: 'Command Center', icon: 'auto_awesome' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { id: 'inbox', label: 'Inbox', icon: 'inbox', badge: 4 },
        { id: 'case_graph', label: 'Case Graph', icon: 'hub' },
        { id: 'customers', label: 'Customers', icon: 'people' },
        { id: 'orders', label: 'Orders', icon: 'shopping_bag' },
        { id: 'payments', label: 'Payments', icon: 'payments' },
        { id: 'returns', label: 'Returns', icon: 'assignment_return' },
        { id: 'approvals', label: 'Approvals', icon: 'check_circle' },
      ],
    },
    {
      title: 'Automation',
      items: [
        { id: 'ai_studio', label: 'AI Studio', icon: 'smart_toy' },
        { id: 'workflows', label: 'Workflows', icon: 'account_tree' },
        { id: 'knowledge', label: 'Knowledge', icon: 'menu_book' },
        { id: 'reports', label: 'Reports', icon: 'bar_chart' },
        { id: 'tools_integrations', label: 'Integrations', icon: 'extension' },
      ],
    },
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
          {navGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              {isOpen ? (
                <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                  {group.title}
                </p>
              ) : null}
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onPageChange(item.id)}
                  className={`relative flex items-center ${isOpen ? 'px-3 py-1.5 w-full justify-start' : 'justify-center w-10 h-10 mx-auto'} text-sm font-medium rounded-md group transition-all ${
                    currentPage === item.id
                      ? 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
                  }`}
                  title={!isOpen ? item.label : undefined}
                >
                  <span className={`material-symbols-outlined text-xl flex-shrink-0 ${isOpen ? 'mr-3' : ''} ${
                    currentPage === item.id ? 'text-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200'
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
