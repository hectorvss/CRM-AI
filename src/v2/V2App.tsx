// V2App — root shell for the migrated SaaS. Orchestrates LeftNav + page routing.
// Each page that gets migrated is added to renderPage(). Pages not yet migrated
// fall through to a "pending migration" placeholder.
import { useState } from 'react';
import type { Page } from '../types';
import LeftNav from './shell/LeftNav';
import InboxV2 from './pages/InboxV2';
import OrdersV2 from './pages/OrdersV2';
import ReportsV2 from './pages/ReportsV2';
import CustomersV2 from './pages/CustomersV2';
import ReturnsV2 from './pages/ReturnsV2';
import KnowledgeV2 from './pages/KnowledgeV2';
import PaymentsV2 from './pages/PaymentsV2';
import AIStudioV2 from './pages/AIStudioV2';
import ApprovalsV2 from './pages/ApprovalsV2';
import SettingsV2 from './pages/SettingsV2';
import ToolsIntegrationsV2 from './pages/ToolsIntegrationsV2';
import CaseGraphV2 from './pages/CaseGraphV2';
import UpgradeV2 from './pages/UpgradeV2';
import WorkflowsV2 from './pages/WorkflowsV2';
import SuperAgentV2 from './pages/SuperAgentV2';

function PendingMigration({ page }: { page: Page }) {
  return (
    <div className="flex flex-1 items-center justify-center min-w-0 bg-white">
      <div className="text-center max-w-[420px] px-6">
        <div className="text-[48px] mb-4">🚧</div>
        <h1 className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a] mb-2">
          Pantalla pendiente de migración
        </h1>
        <p className="text-[14px] text-[#646462] leading-[20px]">
          La pantalla <code className="bg-[#f8f8f7] px-1.5 py-0.5 rounded text-[12.5px]">{page}</code> aún no se ha migrado al nuevo diseño.
        </p>
        <p className="text-[12.5px] text-[#646462] mt-4">
          Sigue disponible en el SaaS original (sin <code>?v2=1</code>).
        </p>
      </div>
    </div>
  );
}

export default function V2App() {
  // Read initial page from URL ?page=… so links + back/forward work.
  const initial: Page = (() => {
    if (typeof window === 'undefined') return 'inbox';
    const p = new URLSearchParams(window.location.search).get('page');
    return (p as Page) || 'inbox';
  })();
  const [page, setPage] = useState<Page>(initial);

  function navigate(next: Page) {
    setPage(next);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('page', next);
      url.searchParams.set('v2', '1');
      window.history.replaceState({}, '', url.toString());
    }
  }

  function renderPage() {
    switch (page) {
      case 'inbox':     return <InboxV2 />;
      case 'orders':    return <OrdersV2 />;
      case 'reports':   return <ReportsV2 />;
      case 'customers': return <CustomersV2 />;
      case 'returns':   return <ReturnsV2 />;
      case 'knowledge': return <KnowledgeV2 />;
      case 'payments': return <PaymentsV2 />;
      case 'ai_studio': return <AIStudioV2 />;
      case 'approvals': return <ApprovalsV2 />;
      case 'settings':  return <SettingsV2 />;
      case 'tools_integrations': return <ToolsIntegrationsV2 />;
      case 'case_graph': return <CaseGraphV2 />;
      case 'upgrade':   return <UpgradeV2 />;
      case 'workflows': return <WorkflowsV2 />;
      case 'super_agent': return <SuperAgentV2 />;
      default:         return <PendingMigration page={page} />;
    }
  }

  return (
    <div className="flex h-screen w-screen bg-[#f3f3f1] overflow-hidden">
      <LeftNav page={page} onNavigate={navigate} badge={{ inbox: 4 }} />
      {renderPage()}
    </div>
  );
}
