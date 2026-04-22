import React, { useEffect, useMemo, useState } from 'react';
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
import SuperAgent from './components/SuperAgent';
import { NavigateInput, NavigationTarget, Page } from './types';

const DEFAULT_TARGET: NavigationTarget = {
  page: 'inbox',
  entityType: 'case',
  entityId: null,
  section: null,
  sourceContext: null,
  runId: null,
};

function entityTypeFromPage(page: Page): NavigationTarget['entityType'] {
  switch (page) {
    case 'inbox':
    case 'case_graph':
      return 'case';
    case 'orders':
      return 'order';
    case 'payments':
      return 'payment';
    case 'returns':
      return 'return';
    case 'approvals':
      return 'approval';
    case 'customers':
      return 'customer';
    case 'workflows':
      return 'workflow';
    case 'knowledge':
      return 'knowledge';
    case 'reports':
      return 'report';
    case 'settings':
      return 'setting';
    default:
      return 'workspace';
  }
}

function normalizeNavigationTarget(target: NavigateInput, entityId?: string | null): NavigationTarget {
  if (typeof target === 'string') {
    return {
      page: target,
      entityType: entityTypeFromPage(target),
      entityId: entityId ?? null,
      section: null,
      sourceContext: null,
      runId: null,
    };
  }

  return {
    page: target.page,
    entityType: target.entityType ?? entityTypeFromPage(target.page),
    entityId: target.entityId ?? null,
    section: target.section ?? null,
    sourceContext: target.sourceContext ?? null,
    runId: target.runId ?? null,
  };
}

function isValidPage(value: string | null): value is Page {
  return [
    'inbox',
    'super_agent',
    'home',
    'ai_studio',
    'workflows',
    'approvals',
    'knowledge',
    'customers',
    'tools_integrations',
    'reports',
    'settings',
    'orders',
    'returns',
    'payments',
    'case_graph',
    'upgrade',
    'profile',
  ].includes(String(value));
}

function parseNavigationTargetFromUrl(): NavigationTarget {
  if (typeof window === 'undefined') {
    return DEFAULT_TARGET;
  }

  const params = new URLSearchParams(window.location.search);
  const page = params.get('view');

  if (!isValidPage(page)) {
    return DEFAULT_TARGET;
  }

  return {
    page,
    entityType: (params.get('entityType') as NavigationTarget['entityType']) || entityTypeFromPage(page),
    entityId: params.get('entityId'),
    section: params.get('section'),
    sourceContext: params.get('source'),
    runId: params.get('runId'),
  };
}

function serializeNavigationTarget(target: NavigationTarget) {
  const params = new URLSearchParams();
  params.set('view', target.page);
  if (target.entityType) params.set('entityType', target.entityType);
  if (target.entityId) params.set('entityId', target.entityId);
  if (target.section) params.set('section', target.section);
  if (target.sourceContext) params.set('source', target.sourceContext);
  if (target.runId) params.set('runId', target.runId);
  return `?${params.toString()}`;
}

export default function App() {
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget>(() => parseNavigationTargetFromUrl());
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);

  const currentPage = navigationTarget.page;

  const navigate = (target: NavigateInput, entityId?: string | null) => {
    setNavigationTarget(normalizeNavigationTarget(target, entityId));
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handlePopState = () => {
      setNavigationTarget(parseNavigationTargetFromUrl());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextUrl = `${window.location.pathname}${serializeNavigationTarget(navigationTarget)}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState({}, '', nextUrl);
    }
  }, [navigationTarget]);

  const pageFocus = useMemo(
    () => ({
      caseId: navigationTarget.entityType === 'case' ? navigationTarget.entityId : null,
      orderId: navigationTarget.entityType === 'order' ? navigationTarget.entityId : null,
      paymentId: navigationTarget.entityType === 'payment' ? navigationTarget.entityId : null,
      returnId: navigationTarget.entityType === 'return' ? navigationTarget.entityId : null,
      approvalId: navigationTarget.entityType === 'approval' ? navigationTarget.entityId : null,
      customerId: navigationTarget.entityType === 'customer' ? navigationTarget.entityId : null,
      workflowId: navigationTarget.entityType === 'workflow' ? navigationTarget.entityId : null,
    }),
    [navigationTarget],
  );

  return (
    <div className="bg-background-light dark:bg-background-dark text-gray-800 dark:text-gray-200 font-sans h-screen flex overflow-hidden selection:bg-purple-200 dark:selection:bg-purple-900">
      <Sidebar 
        currentPage={currentPage} 
        currentSection={navigationTarget.section}
        onPageChange={navigate}
        isOpen={isLeftSidebarOpen}
        onToggle={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
      />
      <main className="flex-1 flex flex-col h-full min-w-0 relative">
        <PageErrorBoundary page={currentPage}>
          {currentPage === 'inbox' && <Inbox focusCaseId={pageFocus.caseId} />}
          {currentPage === 'super_agent' && <SuperAgent onNavigate={navigate} activeTarget={navigationTarget} />}
          {currentPage === 'home' && <Home />}
          {currentPage === 'ai_studio' && <AIStudio />}
          {currentPage === 'workflows' && <Workflows onNavigate={navigate} focusWorkflowId={pageFocus.workflowId} />}
          {currentPage === 'approvals' && <Approvals onNavigate={navigate} focusApprovalId={pageFocus.approvalId} />}
          {currentPage === 'knowledge' && <Knowledge />}
          {currentPage === 'customers' && <Customers onNavigate={navigate} focusCustomerId={pageFocus.customerId} />}
          {currentPage === 'tools_integrations' && <ToolsIntegrations />}
          {currentPage === 'reports' && <Reports />}
          {currentPage === 'settings' && <Settings />}
          {currentPage === 'upgrade' && <Upgrade />}
          {currentPage === 'profile' && <Profile />}
          {currentPage === 'orders' && <Orders onNavigate={navigate} focusEntityId={pageFocus.orderId} focusSection={navigationTarget.section} />}
          {currentPage === 'returns' && <Returns onNavigate={navigate} focusEntityId={pageFocus.returnId} focusSection={navigationTarget.section} />}
          {currentPage === 'payments' && <Payments onNavigate={navigate} focusEntityId={pageFocus.paymentId} focusSection={navigationTarget.section} />}
          {currentPage === 'case_graph' && <CaseGraph onPageChange={(page) => navigate(page, page === 'case_graph' ? pageFocus.caseId : null)} focusCaseId={pageFocus.caseId} />}
        </PageErrorBoundary>
      </main>
    </div>
  );
}
