import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Inbox from './components/Inbox';
import Home from './components/Home';
import AIStudio from './components/AIStudio';
import Workflows from './components/Workflows';
import Approvals from './components/Approvals';
import Knowledge from './components/Knowledge';
import Customers from './components/Customers';
import ToolsIntegrations from './components/ToolsIntegrations';
import Reports from './components/Reports';
import Settings from './components/Settings';
import Upgrade from './components/Upgrade';
import Profile from './components/Profile';
import Orders from './components/Orders';
import Returns from './components/Returns';
import Payments from './components/Payments';
import CaseGraph from './components/CaseGraph';
import PageErrorBoundary from './components/PageErrorBoundary';
import { Page } from './types';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('inbox');
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [focusCaseId, setFocusCaseId] = useState<string | null>(null);

  const navigate = (page: Page, nextFocusCaseId?: string | null) => {
    setCurrentPage(page);
    setFocusCaseId(nextFocusCaseId ?? null);
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-gray-800 dark:text-gray-200 font-sans h-screen flex overflow-hidden selection:bg-purple-200 dark:selection:bg-purple-900">
      <Sidebar 
        currentPage={currentPage} 
        onPageChange={setCurrentPage} 
        isOpen={isLeftSidebarOpen}
        onToggle={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
      />
      <main className="flex-1 flex flex-col h-full min-w-0 relative">
        <PageErrorBoundary page={currentPage}>
          {currentPage === 'inbox' && <Inbox focusCaseId={focusCaseId} />}
          {currentPage === 'home' && <Home />}
          {currentPage === 'ai_studio' && <AIStudio />}
          {currentPage === 'workflows' && <Workflows onNavigate={navigate} />}
          {currentPage === 'approvals' && <Approvals onNavigate={navigate} />}
          {currentPage === 'knowledge' && <Knowledge />}
          {currentPage === 'customers' && <Customers onNavigate={navigate} />}
          {currentPage === 'tools_integrations' && <ToolsIntegrations />}
          {currentPage === 'reports' && <Reports />}
          {currentPage === 'settings' && <Settings />}
          {currentPage === 'upgrade' && <Upgrade />}
          {currentPage === 'profile' && <Profile />}
          {currentPage === 'orders' && <Orders onNavigate={navigate} />}
          {currentPage === 'returns' && <Returns />}
          {currentPage === 'payments' && <Payments />}
          {currentPage === 'case_graph' && <CaseGraph onPageChange={(page) => navigate(page, page === 'case_graph' ? focusCaseId : null)} focusCaseId={focusCaseId} />}
        </PageErrorBoundary>
      </main>
    </div>
  );
}
