import { GraphBranch } from '../components/TreeGraph';

export const MOCK_CASES_DATA: Record<string, {
  rootData: { orderId: string; customerName: string; riskLevel: string; status: string; };
  branches: GraphBranch[];
  copilot: { summary: string; rootCause: string; conflict: string; recommendation: string; actionText: string; reply: string; };
}> = {
  '1': {
    rootData: { orderId: 'ORD-55210', customerName: 'Sarah Jenkins', riskLevel: 'High Risk Case', status: 'Conflict Detected' },
    branches: [
      {
        id: 'orders',
        label: 'Orders',
        icon: 'shopping_bag',
        page: 'orders',
        status: 'healthy',
        nodes: [
          { id: 'o1', label: 'Order created', status: 'healthy', context: 'OMS · Oct 12', icon: 'add_shopping_cart', timestamp: '2023-10-12T10:00:00Z' },
          { id: 'o2', label: 'Fulfillment started', status: 'healthy', context: 'WMS · Oct 12', icon: 'inventory', timestamp: '2023-10-12T11:30:00Z' },
          { id: 'o3', label: 'Delivered', status: 'healthy', context: 'Carrier · Oct 14', icon: 'local_shipping', timestamp: '2023-10-14T14:00:00Z' }
        ]
      },
      {
        id: 'payments',
        label: 'Payments',
        icon: 'payments',
        page: 'payments',
        status: 'critical',
        nodes: [
          { id: 'p1', label: 'Payment authorized', status: 'healthy', context: 'Stripe · $129.00', icon: 'verified_user', timestamp: '2023-10-12T10:01:00Z' },
          { id: 'p2', label: 'Payment captured', status: 'healthy', context: 'Stripe · Oct 12', icon: 'account_balance_wallet', timestamp: '2023-10-12T10:02:00Z' },
          { id: 'p3', label: 'Refund requested', status: 'healthy', context: 'Customer · Oct 15', icon: 'undo', timestamp: '2023-10-15T09:05:00Z' },
          { id: 'p4', label: 'Refund processed in PSP', status: 'healthy', context: 'Stripe · Success', icon: 'check_circle', timestamp: '2023-10-16T11:05:00Z' },
          { id: 'p5', label: 'OMS Pending', status: 'critical', context: 'PSP says processed, OMS still pending', icon: 'error', timestamp: '2023-10-16T11:10:00Z' },
          { id: 'p6', label: 'Reconciliation pending', status: 'warning', context: 'Finance review needed', icon: 'sync_problem', timestamp: '2023-10-16T11:15:00Z' }
        ]
      },
      {
        id: 'returns',
        label: 'Returns',
        icon: 'assignment_return',
        page: 'returns',
        status: 'warning',
        nodes: [
          { id: 'r1', label: 'Return requested', status: 'healthy', context: 'Portal · Oct 15', icon: 'assignment_return', timestamp: '2023-10-15T09:00:00Z' },
          { id: 'r2', label: 'Label created', status: 'healthy', context: 'FedEx · RET-20491', icon: 'label', timestamp: '2023-10-15T09:30:00Z' },
          { id: 'r3', label: 'In transit', status: 'healthy', context: 'Carrier · Moving', icon: 'local_shipping', timestamp: '2023-10-15T14:00:00Z' },
          { id: 'r4', label: 'Received by warehouse', status: 'healthy', context: 'WMS · Oct 16', icon: 'warehouse', timestamp: '2023-10-16T10:00:00Z' },
          { id: 'r5', label: 'Inspection pending', status: 'warning', context: 'Return received, refund not triggered', icon: 'search', timestamp: '2023-10-16T11:00:00Z' }
        ]
      },
      {
        id: 'approvals',
        label: 'Approvals',
        icon: 'check_circle',
        page: 'approvals',
        status: 'healthy',
        nodes: [
          { id: 'a1', label: 'Threshold check', status: 'healthy', context: 'Auto · < $200', icon: 'rule', timestamp: '2023-10-16T11:20:00Z' },
          { id: 'a2', label: 'Approval required', status: 'healthy', context: 'Manager · Pending', icon: 'person_search', timestamp: '2023-10-16T11:25:00Z' },
          { id: 'a3', label: 'Approval pending', status: 'healthy', context: 'SLA · 2h left', icon: 'timer', timestamp: '2023-10-16T11:30:00Z' }
        ]
      },
      {
        id: 'workflows',
        label: 'Workflows',
        icon: 'account_tree',
        page: 'workflows',
        status: 'healthy',
        nodes: [
          { id: 'w1', label: 'Refund workflow triggered', status: 'healthy', context: 'Engine · v2.1', icon: 'bolt', timestamp: '2023-10-16T11:35:00Z' },
          { id: 'w2', label: 'Execution paused', status: 'warning', context: 'Step 4 · Waiting', icon: 'pause_circle', timestamp: '2023-10-16T11:40:00Z' },
          { id: 'w3', label: 'Manual review required', status: 'healthy', context: 'Agent · Assigned', icon: 'rate_review', timestamp: '2023-10-16T11:45:00Z' }
        ]
      },
      {
        id: 'integrations',
        label: 'Integrations',
        icon: 'extension',
        page: 'tools_integrations',
        status: 'warning',
        nodes: [
          { id: 'i1', label: 'PSP healthy', status: 'healthy', context: 'API · 200 OK', icon: 'api', timestamp: '2023-10-16T11:50:00Z' },
          { id: 'i2', label: 'OMS delayed', status: 'warning', context: 'Latency · 450ms', icon: 'speed', timestamp: '2023-10-16T11:55:00Z' },
          { id: 'i3', label: 'Mapping mismatch', status: 'warning', context: 'Mapping error delaying sync', icon: 'link_off', timestamp: '2023-10-16T12:00:00Z' }
        ]
      },
      {
        id: 'knowledge',
        label: 'Knowledge',
        icon: 'menu_book',
        page: 'knowledge',
        status: 'healthy',
        nodes: [
          { id: 'k1', label: 'Refund policy > $50', status: 'healthy', context: 'Doc · REF-01', icon: 'description', timestamp: '2023-10-16T12:05:00Z' },
          { id: 'k2', label: 'Manual approval required', status: 'healthy', context: 'Refund blocked by approval policy', icon: 'gavel', timestamp: '2023-10-16T12:10:00Z' }
        ]
      },
      {
        id: 'customers',
        label: 'Customer',
        icon: 'people',
        page: 'customers',
        status: 'healthy',
        nodes: [
          { id: 'c1', label: 'VIP status', status: 'healthy', context: 'Tier · Gold', icon: 'stars', timestamp: '2023-10-16T12:15:00Z' },
          { id: 'c2', label: 'Refund history', status: 'healthy', context: 'Count · 2', icon: 'history', timestamp: '2023-10-16T12:20:00Z' },
          { id: 'c3', label: 'Churn risk high', status: 'warning', context: 'Score · 88%', icon: 'trending_down', timestamp: '2023-10-16T12:25:00Z' }
        ]
      }
    ],
    copilot: {
      summary: "I've analyzed the entire case graph for ORD-55210. A critical bidirectionality issue has been detected in the Payments branch.",
      rootCause: "The PSP (Stripe) has successfully processed the refund, but the OMS (Order Management System) is stuck in 'Pending' state. This mismatch is blocking the return workflow from completion.",
      conflict: "Refund conflict detected between PSP and OMS",
      recommendation: "Manually reconcile PSP and OMS status",
      actionText: "Go to Payments Module",
      reply: "\"Hi Sarah, I'm investigating the delay in your refund for order ORD-55210. It appears our systems are out of sync, and I'm manually reconciling them now.\""
    }
  },
  '2': {
    rootData: { orderId: 'ORD-55211', customerName: 'Marcus Chen', riskLevel: 'High Risk Case', status: 'Dispute Raised' },
    branches: [
      {
        id: 'orders', label: 'Orders', icon: 'shopping_bag', page: 'orders', status: 'healthy',
        nodes: [
          { id: 'o1', label: 'Order created', status: 'healthy', context: 'OMS · Oct 12', icon: 'add_shopping_cart', timestamp: '2023-10-12T10:00:00Z' },
          { id: 'o2', label: 'Fulfillment started', status: 'healthy', context: 'WMS · Oct 12', icon: 'inventory', timestamp: '2023-10-12T11:30:00Z' },
          { id: 'o3', label: 'Delivered', status: 'healthy', context: 'Carrier · Oct 14', icon: 'local_shipping', timestamp: '2023-10-14T14:00:00Z' }
        ]
      },
      {
        id: 'payments', label: 'Payments', icon: 'payments', page: 'payments', status: 'healthy',
        nodes: [
          { id: 'p1', label: 'Payment authorized', status: 'healthy', context: 'Stripe · $129.00', icon: 'verified_user', timestamp: '2023-10-12T10:01:00Z' },
          { id: 'p2', label: 'Payment captured', status: 'healthy', context: 'Stripe · Oct 12', icon: 'account_balance_wallet', timestamp: '2023-10-12T10:02:00Z' }
        ]
      },
      {
        id: 'returns', label: 'Returns', icon: 'assignment_return', page: 'returns', status: 'critical',
        nodes: [
          { id: 'r1', label: 'Return requested', status: 'healthy', context: 'Portal · Oct 15', icon: 'assignment_return', timestamp: '2023-10-15T09:00:00Z' },
          { id: 'r2', label: 'Label created', status: 'healthy', context: 'FedEx · RET-20491', icon: 'label', timestamp: '2023-10-15T09:30:00Z' },
          { id: 'r3', label: 'In transit', status: 'healthy', context: 'Carrier · Delivered', icon: 'local_shipping', timestamp: '2023-10-16T09:00:00Z' },
          { id: 'r4', label: 'Received by warehouse', status: 'healthy', context: 'WMS · Oct 16', icon: 'warehouse', timestamp: '2023-10-16T10:00:00Z' },
          { id: 'r5', label: 'Inspection failed', status: 'critical', context: 'Item damaged', icon: 'error', timestamp: '2023-10-16T11:00:00Z' }
        ]
      },
      {
        id: 'approvals', label: 'Approvals', icon: 'check_circle', page: 'approvals', status: 'warning',
        nodes: [
          { id: 'a1', label: 'Dispute raised', status: 'warning', context: 'System · Auto', icon: 'gavel', timestamp: '2023-10-16T11:05:00Z' },
          { id: 'a2', label: 'Pending review', status: 'warning', context: 'Manager · Queue', icon: 'person_search', timestamp: '2023-10-16T11:10:00Z' }
        ]
      },
      {
        id: 'workflows', label: 'Workflows', icon: 'account_tree', page: 'workflows', status: 'healthy',
        nodes: [
          { id: 'w1', label: 'Return workflow triggered', status: 'healthy', context: 'Engine · v2.1', icon: 'bolt', timestamp: '2023-10-15T09:05:00Z' },
          { id: 'w2', label: 'Halted at inspection', status: 'healthy', context: 'Step 3 · Stopped', icon: 'pause_circle', timestamp: '2023-10-16T11:05:00Z' }
        ]
      },
      {
        id: 'integrations', label: 'Integrations', icon: 'extension', page: 'tools_integrations', status: 'healthy',
        nodes: [
          { id: 'i1', label: 'WMS healthy', status: 'healthy', context: 'API · 200 OK', icon: 'api', timestamp: '2023-10-16T10:05:00Z' },
          { id: 'i2', label: 'OMS healthy', status: 'healthy', context: 'API · 200 OK', icon: 'api', timestamp: '2023-10-16T10:06:00Z' }
        ]
      },
      {
        id: 'knowledge', label: 'Knowledge', icon: 'menu_book', page: 'knowledge', status: 'healthy',
        nodes: [
          { id: 'k1', label: 'Damaged item policy', status: 'healthy', context: 'Doc · DAM-02', icon: 'description', timestamp: '2023-10-16T11:06:00Z' }
        ]
      },
      {
        id: 'customers', label: 'Customer', icon: 'people', page: 'customers', status: 'healthy',
        nodes: [
          { id: 'c1', label: 'Standard status', status: 'healthy', context: 'Tier · Silver', icon: 'stars', timestamp: '2023-10-12T09:00:00Z' },
          { id: 'c2', label: 'Return history', status: 'healthy', context: 'Count · 1', icon: 'history', timestamp: '2023-10-12T09:05:00Z' }
        ]
      }
    ],
    copilot: {
      summary: "I've analyzed the case graph for ORD-55211. The warehouse inspection failed due to a damaged item, triggering a dispute.",
      rootCause: "The returned item was flagged as 'Damaged' by the WMS. The automated refund was halted, and a dispute case was automatically raised for manual review.",
      conflict: "Damaged item dispute",
      recommendation: "Review warehouse photos and approve/reject dispute",
      actionText: "Go to Approvals Module",
      reply: "\"Hi Marcus, we received your return for ORD-55211, but our warehouse noted the item was damaged. I'm currently reviewing the inspection photos and will update you shortly.\""
    }
  },
  '3': {
    rootData: { orderId: 'ORD-55213', customerName: 'Elena Rodriguez', riskLevel: 'Normal Case', status: 'In Transit' },
    branches: [
      {
        id: 'orders', label: 'Orders', icon: 'shopping_bag', page: 'orders', status: 'healthy',
        nodes: [
          { id: 'o1', label: 'Order created', status: 'healthy', context: 'OMS · Oct 10', icon: 'add_shopping_cart', timestamp: '2023-10-10T10:00:00Z' },
          { id: 'o2', label: 'Fulfillment started', status: 'healthy', context: 'WMS · Oct 10', icon: 'inventory', timestamp: '2023-10-10T11:30:00Z' },
          { id: 'o3', label: 'Delivered', status: 'healthy', context: 'Carrier · Oct 12', icon: 'local_shipping', timestamp: '2023-10-12T14:00:00Z' }
        ]
      },
      {
        id: 'payments', label: 'Payments', icon: 'payments', page: 'payments', status: 'healthy',
        nodes: [
          { id: 'p1', label: 'Payment authorized', status: 'healthy', context: 'Stripe · $89.00', icon: 'verified_user', timestamp: '2023-10-10T10:01:00Z' },
          { id: 'p2', label: 'Payment captured', status: 'healthy', context: 'Stripe · Oct 10', icon: 'account_balance_wallet', timestamp: '2023-10-10T10:02:00Z' }
        ]
      },
      {
        id: 'returns', label: 'Returns', icon: 'assignment_return', page: 'returns', status: 'healthy',
        nodes: [
          { id: 'r1', label: 'Return requested', status: 'healthy', context: 'Portal · Oct 15', icon: 'assignment_return', timestamp: '2023-10-15T09:00:00Z' },
          { id: 'r2', label: 'Label created', status: 'healthy', context: 'FedEx · RET-20492', icon: 'label', timestamp: '2023-10-15T09:30:00Z' },
          { id: 'r3', label: 'In transit', status: 'healthy', context: 'Carrier · Moving', icon: 'local_shipping', timestamp: '2023-10-15T14:00:00Z' }
        ]
      },
      {
        id: 'approvals', label: 'Approvals', icon: 'check_circle', page: 'approvals', status: 'healthy',
        nodes: [
          { id: 'a1', label: 'Auto-approved', status: 'healthy', context: 'System · < $100', icon: 'rule', timestamp: '2023-10-15T09:05:00Z' }
        ]
      },
      {
        id: 'workflows', label: 'Workflows', icon: 'account_tree', page: 'workflows', status: 'healthy',
        nodes: [
          { id: 'w1', label: 'Return workflow triggered', status: 'healthy', context: 'Engine · v2.1', icon: 'bolt', timestamp: '2023-10-15T09:05:00Z' },
          { id: 'w2', label: 'Awaiting receipt', status: 'healthy', context: 'Step 2 · Active', icon: 'hourglass_empty', timestamp: '2023-10-15T09:30:00Z' }
        ]
      },
      {
        id: 'integrations', label: 'Integrations', icon: 'extension', page: 'tools_integrations', status: 'healthy',
        nodes: [
          { id: 'i1', label: 'Carrier API healthy', status: 'healthy', context: 'API · 200 OK', icon: 'api', timestamp: '2023-10-15T09:30:00Z' }
        ]
      },
      {
        id: 'knowledge', label: 'Knowledge', icon: 'menu_book', page: 'knowledge', status: 'healthy',
        nodes: [
          { id: 'k1', label: 'Standard return policy', status: 'healthy', context: 'Doc · RET-01', icon: 'description', timestamp: '2023-10-15T09:05:00Z' }
        ]
      },
      {
        id: 'customers', label: 'Customer', icon: 'people', page: 'customers', status: 'healthy',
        nodes: [
          { id: 'c1', label: 'New customer', status: 'healthy', context: 'Tier · Bronze', icon: 'stars', timestamp: '2023-10-10T09:00:00Z' }
        ]
      }
    ],
    copilot: {
      summary: "I've analyzed the case graph for ORD-55213. The return process is proceeding normally without any issues.",
      rootCause: "No issues detected. The return label was created and the package is currently in transit back to the warehouse.",
      conflict: "None",
      recommendation: "Monitor transit status",
      actionText: "Go to Returns Module",
      reply: "\"Hi Elena, I can see your return for ORD-55213 is currently in transit. Once it reaches our warehouse, we'll process your refund within 2-3 business days.\""
    }
  },
  '4': {
    rootData: { orderId: 'ORD-55214', customerName: 'James Wilson', riskLevel: 'Blocked Case', status: 'Policy Blocked' },
    branches: [
      {
        id: 'orders', label: 'Orders', icon: 'shopping_bag', page: 'orders', status: 'healthy',
        nodes: [
          { id: 'o1', label: 'Order created', status: 'healthy', context: 'OMS · Aug 20', icon: 'add_shopping_cart', timestamp: '2023-08-20T10:00:00Z' },
          { id: 'o2', label: 'Fulfillment started', status: 'healthy', context: 'WMS · Aug 21', icon: 'inventory', timestamp: '2023-08-21T11:30:00Z' },
          { id: 'o3', label: 'Delivered', status: 'healthy', context: 'Carrier · Aug 25', icon: 'local_shipping', timestamp: '2023-08-25T14:00:00Z' }
        ]
      },
      {
        id: 'payments', label: 'Payments', icon: 'payments', page: 'payments', status: 'healthy',
        nodes: [
          { id: 'p1', label: 'Payment authorized', status: 'healthy', context: 'Stripe · $249.00', icon: 'verified_user', timestamp: '2023-08-20T10:01:00Z' },
          { id: 'p2', label: 'Payment captured', status: 'healthy', context: 'Stripe · Aug 20', icon: 'account_balance_wallet', timestamp: '2023-08-20T10:02:00Z' }
        ]
      },
      {
        id: 'returns', label: 'Returns', icon: 'assignment_return', page: 'returns', status: 'critical',
        nodes: [
          { id: 'r1', label: 'Return requested', status: 'healthy', context: 'Portal · Oct 15', icon: 'assignment_return', timestamp: '2023-10-15T09:00:00Z' },
          { id: 'r2', label: 'Policy check', status: 'critical', context: '> 30 days', icon: 'rule', timestamp: '2023-10-15T09:01:00Z' },
          { id: 'r3', label: 'Return blocked', status: 'critical', context: 'System rejected', icon: 'block', timestamp: '2023-10-15T09:02:00Z' }
        ]
      },
      {
        id: 'approvals', label: 'Approvals', icon: 'check_circle', page: 'approvals', status: 'healthy',
        nodes: [
          { id: 'a1', label: 'Exception review', status: 'healthy', context: 'Manager · Not requested', icon: 'person_search', timestamp: '2023-10-15T09:05:00Z' }
        ]
      },
      {
        id: 'workflows', label: 'Workflows', icon: 'account_tree', page: 'workflows', status: 'healthy',
        nodes: [
          { id: 'w1', label: 'Return workflow triggered', status: 'healthy', context: 'Engine · v2.1', icon: 'bolt', timestamp: '2023-10-15T09:00:30Z' },
          { id: 'w2', label: 'Terminated', status: 'healthy', context: 'Step 1 · Blocked', icon: 'cancel', timestamp: '2023-10-15T09:02:30Z' }
        ]
      },
      {
        id: 'integrations', label: 'Integrations', icon: 'extension', page: 'tools_integrations', status: 'healthy',
        nodes: [
          { id: 'i1', label: 'OMS healthy', status: 'healthy', context: 'API · 200 OK', icon: 'api', timestamp: '2023-10-15T09:00:00Z' }
        ]
      },
      {
        id: 'knowledge', label: 'Knowledge', icon: 'menu_book', page: 'knowledge', status: 'warning',
        nodes: [
          { id: 'k1', label: 'Return policy', status: 'warning', context: 'Max 30 days', icon: 'description', timestamp: '2023-10-15T09:01:00Z' }
        ]
      },
      {
        id: 'customers', label: 'Customer', icon: 'people', page: 'customers', status: 'healthy',
        nodes: [
          { id: 'c1', label: 'VIP status', status: 'healthy', context: 'Tier · Gold', icon: 'stars', timestamp: '2023-08-20T09:00:00Z' },
          { id: 'c2', label: 'High LTV', status: 'healthy', context: 'Value · $4k+', icon: 'monetization_on', timestamp: '2023-08-20T09:05:00Z' }
        ]
      }
    ],
    copilot: {
      summary: "I've analyzed the case graph for ORD-55214. The return request was automatically blocked by the system policy.",
      rootCause: "The customer attempted to initiate a return 45 days after delivery, which exceeds the standard 30-day return window defined in the knowledge base.",
      conflict: "Return blocked by policy",
      recommendation: "Review exception eligibility or confirm rejection",
      actionText: "Go to Knowledge Base",
      reply: "\"Hi James, I see you're trying to return ORD-55214. Unfortunately, this order was delivered over 30 days ago, which falls outside our standard return policy window.\""
    }
  }
};
