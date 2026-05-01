export type Page = 'inbox' | 'super_agent' | 'home' | 'ai_studio' | 'workflows' | 'approvals' | 'knowledge' | 'customers' | 'tools_integrations' | 'reports' | 'settings' | 'orders' | 'returns' | 'payments' | 'case_graph' | 'upgrade' | 'profile';

export type NavigationEntityType =
  | 'workspace'
  | 'case'
  | 'order'
  | 'payment'
  | 'return'
  | 'approval'
  | 'customer'
  | 'workflow'
  | 'agent'
  | 'knowledge'
  | 'report'
  | 'setting';

export interface NavigationTarget {
  page: Page;
  entityType?: NavigationEntityType | null;
  entityId?: string | null;
  section?: string | null;
  sourceContext?: string | null;
  runId?: string | null;
  draftPrompt?: string | null;
  draftLabel?: string | null;
}

export type NavigateInput = NavigationTarget | Page;
export type NavigateFn = (target: NavigateInput, entityId?: string | null) => void;

export type Channel = 'web_chat' | 'email' | 'whatsapp';

export type MessageType = 'customer' | 'agent' | 'system' | 'internal' | 'ai';

export interface Message {
  id: string;
  type: MessageType;
  sender: string;
  content: string;
  time: string;
  status?: 'sent' | 'delivered' | 'read';
}

export type CaseTab = 'unassigned' | 'assigned' | 'waiting' | 'high_risk';

export type OrderTab = 'all' | 'attention' | 'refunds' | 'conflicts';

export type ReturnTab = 'all' | 'pending_review' | 'in_transit' | 'received' | 'refund_pending' | 'blocked';

export type PaymentTab = 'all' | 'refunds' | 'disputes' | 'reconciliation' | 'blocked';

export interface OrderTimelineEvent {
  id: string;
  type: string;
  content: string;
  time: string;
  system?: string;
}

export interface Order {
  id: string;
  customerName: string;
  orderId: string;
  brand: string;
  date: string;
  total: string;
  currency: string;
  country: string;
  channel?: string;
  orderStatus: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  returnStatus: string;
  refundStatus: string;
  approvalStatus: string;
  riskLevel: string;
  orderType: string;
  summary: string;
  lastUpdate: string;
  badges: string[];
  timeline: OrderTimelineEvent[];
  systemStates: {
    oms: string;
    psp: string;
    wms: string;
    carrier: string;
    canonical: string;
  };
  canonicalContext?: Record<string, any>;
  canonical_context?: Record<string, any>;
  relatedCases: { id: string; type: string; status: string }[];
  tab: OrderTab;
  conflictDetected?: string;
  recommendedNextAction?: string;
  context?: string;
}

export interface Return {
  id: string;
  orderId: string;
  returnId: string;
  customerName: string;
  brand: string;
  date: string;
  total: string;
  currency: string;
  country: string;
  returnType: string;
  returnReason: string;
  returnValue: string;
  riskLevel: string;
  orderStatus: string;
  returnStatus: string;
  inspectionStatus: string;
  refundStatus: string;
  approvalStatus: string;
  carrierStatus: string;
  summary: string;
  lastUpdate: string;
  badges: string[];
  timeline: OrderTimelineEvent[];
  systemStates: {
    oms: string;
    returnsPlatform: string;
    wms: string;
    carrier: string;
    psp: string;
    canonical: string;
  };
  relatedCases: { id: string; type: string; status: string }[];
  tab: ReturnTab;
  conflictDetected?: string;
  recommendedNextAction?: string;
  context?: string;
  method?: string;
}

export interface Payment {
  id: string;
  orderId: string;
  paymentId: string;
  customerName: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  psp: string;
  date: string;
  lastUpdate: string;
  orderStatus: string;
  paymentStatus: string;
  refundStatus: string;
  disputeStatus: string;
  reconciliationStatus: string;
  approvalStatus: string;
  riskLevel: string;
  paymentType: string;
  summary: string;
  badges: string[];
  timeline: OrderTimelineEvent[];
  systemStates: {
    oms: string;
    psp: string;
    refund: string;
    dispute: string;
    reconciliation: string;
    canonical: string;
  };
  relatedCases: { id: string; type: string; status: string }[];
  tab: PaymentTab;
  conflictDetected?: string;
  recommendedNextAction?: string;
  context?: string;
  refundAmount?: string;
  refundType?: string;
  disputeReference?: string;
  chargebackAmount?: string;
}

export interface Conversation {
  id: string;
  contactName: string;
  channel: Channel;
  lastMessage: string;
  time: string;
  priority?: 'high' | 'normal';
  tags?: string[];
  unread?: boolean;
  caseId?: string;
  orderId?: string;
  company?: string;
  brand?: string;
  caseType?: string;
  riskLevel?: string;
  orderStatus?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  refundStatus?: string;
  approvalStatus?: string;
  context?: string;
  assignedTeam?: string;
  lastSync?: string;
  slaStatus?: 'New' | 'Waiting' | 'Overdue' | 'SLA risk';
  slaTime?: string;
  recommendedNextAction?: string;
  conflictDetected?: string;
  relatedCases?: { id: string; type: string; status: string }[];
  messages?: Message[];
  tab: CaseTab;
  assignee?: string;
}
