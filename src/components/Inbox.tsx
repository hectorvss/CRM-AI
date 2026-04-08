import React, { useState, useEffect } from 'react';
import { Conversation, Channel, CaseTab } from '../types';
import { casesApi } from '../api/client';
import { useApi } from '../api/hooks';

type RightTab = 'details' | 'copilot';
type ComposeMode = 'reply' | 'internal';

const formatTime = (value?: string | null) =>
  value ? new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '--:--';

const formatRelativeTime = (value?: string | null) => {
  if (!value) return '-';
  const diffMinutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

const titleCase = (value?: string | null) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) : 'N/A';

const CONVERSATIONS: Conversation[] = [
  {
    id: '1',
    tab: 'assigned',
    assignee: 'Me',
    contactName: 'Sarah Jenkins',
    channel: 'web_chat',
    lastMessage: "Refund pending bank clearance",
    time: '2m',
    priority: 'high',
    tags: ['Refund', 'High Risk'],
    unread: true,
    caseId: 'CAS-88219',
    orderId: 'ORD-55210',
    company: 'Personal',
    brand: 'Suppy Main Store',
    caseType: 'Refund Inquiry',
    riskLevel: 'High',
    orderStatus: 'Delivered',
    paymentStatus: 'Paid',
    fulfillmentStatus: 'Shipped',
    refundStatus: 'Pending',
    approvalStatus: 'Approved',
    context: 'Customer is inquiring about a refund approved 5 days ago.',
    assignedTeam: 'Finance',
    lastSync: '1m ago',
    slaStatus: 'SLA risk',
    slaTime: '2h remaining',
    recommendedNextAction: 'Wait for bank clearance',
    conflictDetected: 'PSP says refunded, OMS says pending',
    relatedCases: [
      { id: 'CAS-88100', type: 'Previous refund inquiry', status: 'Closed' }
    ],
    messages: [
      { id: 'm1', type: 'system', sender: 'System', content: 'Case created from Web Chat', time: '08:00 AM' },
      { id: 'm2', type: 'customer', sender: 'Sarah Jenkins', content: 'Hi, I was told my refund for ORD-55210 was approved 5 days ago but I still don\'t see it in my account.', time: '08:01 AM' },
      { id: 'm3', type: 'ai', sender: 'AI Assistant', content: 'Hello Sarah! I\'ve checked your case. The refund was indeed approved on our end. However, banks usually take 5-7 business days to process the transaction. I\'m checking the PSP status for you now.', time: '08:01 AM' },
      { id: 'm4', type: 'internal', sender: 'System', content: 'CONFLICT DETECTED: PSP status is "Settled" but OMS status remains "Pending Refund". Triggering manual reconciliation.', time: '08:02 AM' },
      { id: 'm5', type: 'agent', sender: 'Agent Sarah', content: 'Hi Sarah, I\'m looking into the discrepancy between our systems. I\'ve flagged this for our finance team to ensure the clearance is finalized.', time: '08:05 AM' }
    ]
  },
  {
    id: '2',
    tab: 'assigned',
    assignee: 'Me',
    contactName: 'Marcus Chen',
    channel: 'web_chat',
    lastMessage: "Cancellation requested after packing",
    time: '15m',
    tags: ['Cancellation', 'Warehouse'],
    caseId: 'CAS-88220',
    orderId: 'ORD-55211',
    company: 'TechCorp',
    brand: 'Suppy B2B',
    caseType: 'Cancellation',
    riskLevel: 'Medium',
    orderStatus: 'Processing',
    paymentStatus: 'Paid',
    fulfillmentStatus: 'Packing',
    refundStatus: 'N/A',
    approvalStatus: 'Pending',
    context: 'Customer wants to cancel but order is already in packing stage.',
    assignedTeam: 'Operations',
    lastSync: '5m ago',
    slaStatus: 'Waiting',
    slaTime: '15m',
    recommendedNextAction: 'Request warehouse confirmation',
    conflictDetected: 'Customer requested cancellation, but WMS shows packed',
    relatedCases: [],
    messages: [
      { id: 'm1', type: 'customer', sender: 'Marcus Chen', content: 'I need to cancel order ORD-55211. We made a mistake in the quantity.', time: '10:10 AM' },
      { id: 'm2', type: 'ai', sender: 'AI Assistant', content: 'I understand, Marcus. Let me check the status of your order.', time: '10:10 AM' },
      { id: 'm3', type: 'system', sender: 'System', content: 'WMS Update: Order ORD-55211 status changed to "Packed".', time: '10:11 AM' },
      { id: 'm4', type: 'internal', sender: 'Agent Marcus', content: 'Order is already packed. Need to check if it can be pulled from the loading dock.', time: '10:12 AM' }
    ]
  },
  {
    id: '3',
    tab: 'assigned',
    assignee: 'Me',
    contactName: 'TechCorp Billing',
    channel: 'email',
    lastMessage: "Address update for Invoice #9921",
    time: '1h',
    tags: ['Billing', 'Invoice'],
    caseId: 'CAS-88221',
    orderId: 'ORD-55212',
    company: 'TechCorp',
    brand: 'Suppy B2B',
    caseType: 'Billing Update',
    riskLevel: 'Low',
    orderStatus: 'Invoiced',
    paymentStatus: 'Pending',
    fulfillmentStatus: 'N/A',
    refundStatus: 'N/A',
    approvalStatus: 'N/A',
    context: 'Request to update billing address on a issued invoice.',
    assignedTeam: 'Billing',
    lastSync: '10m ago',
    slaStatus: 'New',
    slaTime: '1h',
    recommendedNextAction: 'Escalate to finance',
    relatedCases: [
      { id: 'CAS-88150', type: 'Payment dispute case', status: 'Resolved' }
    ],
    messages: [
      { id: 'm1', type: 'customer', sender: 'TechCorp Billing', content: 'Hello, we need to update the billing address for Invoice #9921. The current one is our old SF office.', time: '09:00 AM' },
      { id: 'm2', type: 'agent', sender: 'Billing Support', content: 'Received. I will update the master record and regenerate the invoice for you.', time: '09:30 AM' }
    ]
  },
  {
    id: '4',
    tab: 'assigned',
    assignee: 'Me',
    contactName: 'Elena Rodriguez',
    channel: 'whatsapp',
    lastMessage: "Damaged item on arrival",
    time: '3h',
    tags: ['Damage', 'Replacement'],
    caseId: 'CAS-88222',
    orderId: 'ORD-55213',
    company: 'Personal',
    brand: 'Suppy Main Store',
    caseType: 'Return/Replacement',
    riskLevel: 'Medium',
    orderStatus: 'Delivered',
    paymentStatus: 'Paid',
    fulfillmentStatus: 'Delivered',
    refundStatus: 'N/A',
    approvalStatus: 'Waiting Info',
    context: 'Customer received a damaged product and wants a replacement.',
    assignedTeam: 'Support',
    lastSync: '2m ago',
    slaStatus: 'Overdue',
    slaTime: '3h',
    recommendedNextAction: 'Send customer clarification',
    relatedCases: [
      { id: 'CAS-88050', type: 'Linked return case', status: 'Open' }
    ],
    messages: [
      { id: 'm1', type: 'customer', sender: 'Elena Rodriguez', content: 'Hello! I received my order ORD-55213 today but the item is damaged.', time: '08:15 AM' },
      { id: 'm2', type: 'customer', sender: 'Elena Rodriguez', content: 'Can I get a replacement sent out? I\'ve attached a photo of the box.', time: '08:16 AM' },
      { id: 'm3', type: 'ai', sender: 'AI Assistant', content: 'Hi Elena! I\'m sorry to hear your order arrived damaged. I\'ve flagged this for our operations team. To speed things up, could you please confirm if the outer packaging was also damaged?', time: '08:16 AM' }
    ]
  },
  {
    id: '5',
    tab: 'unassigned',
    contactName: 'James Wilson',
    channel: 'web_chat',
    lastMessage: "Payment failed but money taken",
    time: '5m',
    priority: 'high',
    tags: ['Payment', 'Urgent'],
    caseId: 'CAS-88223',
    orderId: 'ORD-55214',
    company: 'Personal',
    brand: 'Suppy Main Store',
    caseType: 'Payment Issue',
    riskLevel: 'High',
    orderStatus: 'Pending',
    paymentStatus: 'Failed',
    fulfillmentStatus: 'Pending',
    refundStatus: 'N/A',
    approvalStatus: 'N/A',
    context: 'Customer reports payment failure at checkout but bank shows deduction.',
    assignedTeam: 'Finance',
    lastSync: '1m ago',
    slaStatus: 'New',
    slaTime: '15m',
    recommendedNextAction: 'Verify PSP transaction log',
    conflictDetected: 'Checkout failed, but customer claims deduction',
    messages: [
      { id: 'm1', type: 'customer', sender: 'James Wilson', content: 'My payment failed on the site but I see the charge in my bank app. What happened?', time: '11:10 AM' }
    ]
  },
  {
    id: '6',
    tab: 'unassigned',
    contactName: 'Sophie Taylor',
    channel: 'email',
    lastMessage: "Change shipping address",
    time: '45m',
    tags: ['Shipping', 'Address'],
    caseId: 'CAS-88224',
    orderId: 'ORD-55215',
    company: 'Personal',
    brand: 'Suppy Main Store',
    caseType: 'Address Change',
    riskLevel: 'Low',
    orderStatus: 'Confirmed',
    paymentStatus: 'Paid',
    fulfillmentStatus: 'Pending',
    refundStatus: 'N/A',
    approvalStatus: 'N/A',
    context: 'Customer wants to change shipping address before fulfillment starts.',
    assignedTeam: 'Support',
    lastSync: '10m ago',
    slaStatus: 'Waiting',
    slaTime: '45m',
    recommendedNextAction: 'Update address in OMS',
    messages: [
      { id: 'm1', type: 'customer', sender: 'Sophie Taylor', content: 'I entered the wrong house number for my order. Can you change it to 42 instead of 24?', time: '10:30 AM' }
    ]
  },
  {
    id: '7',
    tab: 'waiting',
    assignee: 'Me',
    contactName: 'Linda Wu',
    channel: 'web_chat',
    lastMessage: "High value refund request",
    time: '2h',
    priority: 'high',
    tags: ['Refund', 'High Value'],
    caseId: 'CAS-88225',
    orderId: 'ORD-55216',
    company: 'Enterprise Solutions',
    brand: 'Suppy B2B',
    caseType: 'Refund Inquiry',
    riskLevel: 'High',
    orderStatus: 'Returned',
    paymentStatus: 'Paid',
    fulfillmentStatus: 'Returned',
    refundStatus: 'Pending',
    approvalStatus: 'Pending Manager',
    context: 'Refund request for $5,000 order. Requires manager approval per policy.',
    assignedTeam: 'Finance',
    lastSync: '5m ago',
    slaStatus: 'SLA risk',
    slaTime: '1h',
    recommendedNextAction: 'Wait for manager approval',
    messages: [
      { id: 'm1', type: 'agent', sender: 'Me', content: 'I have initiated the refund for the returned items. Since the amount exceeds $1,000, it is currently pending manager approval.', time: '09:15 AM' }
    ]
  },
  {
    id: '8',
    tab: 'high_risk',
    assignee: 'Me',
    contactName: 'Robert Fox',
    channel: 'web_chat',
    lastMessage: "Multiple failed delivery attempts",
    time: '1h',
    priority: 'high',
    tags: ['Delivery', 'Fraud Risk'],
    caseId: 'CAS-88226',
    orderId: 'ORD-55217',
    company: 'Personal',
    brand: 'Suppy Main Store',
    caseType: 'Delivery Issue',
    riskLevel: 'High',
    orderStatus: 'In Transit',
    paymentStatus: 'Paid',
    fulfillmentStatus: 'Out for Delivery',
    refundStatus: 'N/A',
    approvalStatus: 'N/A',
    context: 'Third failed delivery attempt. Address flagged for potential fraud or high loss area.',
    assignedTeam: 'Operations',
    lastSync: '1m ago',
    slaStatus: 'Overdue',
    slaTime: 'Overdue',
    recommendedNextAction: 'Contact carrier for investigation',
    conflictDetected: 'Carrier says delivered, customer says not received',
    messages: [
      { id: 'm1', type: 'system', sender: 'Carrier', content: 'Delivery attempt failed: Recipient not available.', time: '10:00 AM' },
      { id: 'm2', type: 'customer', sender: 'Robert Fox', content: 'I was home all day! This is the third time they say I wasn\'t here.', time: '10:05 AM' }
    ]
  },
  {
    id: '9',
    tab: 'high_risk',
    assignee: 'Me',
    contactName: 'Unknown User',
    channel: 'web_chat',
    lastMessage: "Suspicious login and order activity",
    time: '10m',
    priority: 'high',
    tags: ['Fraud', 'Security'],
    caseId: 'CAS-88227',
    orderId: 'ORD-55218',
    company: 'Personal',
    brand: 'Suppy Main Store',
    caseType: 'Fraud Alert',
    riskLevel: 'Critical',
    orderStatus: 'Processing',
    paymentStatus: 'Paid',
    fulfillmentStatus: 'Pending',
    refundStatus: 'N/A',
    approvalStatus: 'Under Review',
    context: 'Account flagged for multiple failed logins followed by a high-value order from a new IP.',
    assignedTeam: 'Security',
    lastSync: '1m ago',
    slaStatus: 'New',
    slaTime: '5m',
    recommendedNextAction: 'Hold fulfillment and verify identity',
    conflictDetected: 'New shipping address matches known fraud drop point',
    messages: [
      { id: 'm1', type: 'system', sender: 'Security Bot', content: 'High-risk activity detected. Order placed from VPN IP.', time: '11:00 AM' }
    ]
  },
  {
    id: '10',
    tab: 'unassigned',
    contactName: 'David Miller',
    channel: 'email',
    lastMessage: "Bulk order availability inquiry",
    time: '2h',
    tags: ['Inventory', 'Sales'],
    caseId: 'CAS-88228',
    orderId: 'N/A',
    company: 'Miller Logistics',
    brand: 'Suppy B2B',
    caseType: 'Inventory Inquiry',
    riskLevel: 'Low',
    orderStatus: 'N/A',
    paymentStatus: 'N/A',
    fulfillmentStatus: 'N/A',
    refundStatus: 'N/A',
    approvalStatus: 'N/A',
    context: 'Customer inquiring about stock levels for 500 units of SKU-9920.',
    assignedTeam: 'Sales',
    lastSync: '1h ago',
    slaStatus: 'Waiting',
    slaTime: '2h',
    recommendedNextAction: 'Check warehouse stock levels',
    messages: [
      { id: 'm1', type: 'customer', sender: 'David Miller', content: 'Hi, we are looking to place a bulk order for SKU-9920. Do you have 500 units in stock for immediate shipping?', time: '09:00 AM' }
    ]
  }
];

export default function Inbox() {
  const [rightTab, setRightTab] = useState<RightTab>('copilot');
  const [activeTab, setActiveTab] = useState<CaseTab>('assigned');
  const [selectedId, setSelectedId] = useState<string>('1');
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [composeMode, setComposeMode] = useState<ComposeMode>('reply');
  const [composerText, setComposerText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch from API, fallback to CONVERSATIONS static data
  const { data: apiCases } = useApi(() => casesApi.list(), [refreshKey], []);
  const { data: selectedInboxView } = useApi(
    () => selectedId ? casesApi.inboxView(selectedId) : Promise.resolve(null),
    [selectedId, refreshKey]
  );

  const mapApiCase = (c: any): Conversation => {
    const orderIds = Array.isArray(c.order_ids) ? c.order_ids : [];
    return {
      id: c.id,
      tab: (c.assigned_user_id ? 'assigned' : 'unassigned') as CaseTab,
      assignee: c.assigned_user_id || c.assigned_user_name || undefined,
      contactName: c.customer_name || 'Unknown',
      channel: (c.source_channel as Channel) || 'web_chat',
      lastMessage: c.latest_message_preview || c.ai_diagnosis || c.type || 'New case',
      time: c.created_at ? new Date(c.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-',
      priority: c.priority === 'high' || c.priority === 'urgent' ? 'high' : 'normal',
      tags: Array.isArray(c.tags) ? c.tags : [],
      unread: c.status === 'new' || c.status === 'pending',
      caseId: c.case_number || c.id,
      orderId: orderIds[0] || 'N/A',
      company: 'Acme Corp',
      brand: 'Acme Store',
      caseType: c.type || 'General',
      riskLevel: c.risk_level === 'high' || c.risk_level === 'critical' ? 'High' : c.risk_level === 'medium' ? 'Medium' : 'Low',
      orderStatus: titleCase(c.system_status_summary?.orders || 'N/A'),
      paymentStatus: titleCase(c.system_status_summary?.payments || 'N/A'),
      fulfillmentStatus: titleCase(c.system_status_summary?.fulfillment || 'N/A'),
      refundStatus: titleCase(c.system_status_summary?.returns || 'N/A'),
      approvalStatus: titleCase(c.approval_state || 'N/A'),
      context: c.conflict_summary?.root_cause || c.ai_diagnosis || '',
      assignedTeam: c.assigned_team_name || 'Support',
      lastSync: '1m ago',
      slaStatus: c.sla_status === 'at_risk' ? 'SLA risk' : c.sla_status === 'breached' ? 'Overdue' : c.sla_status === 'on_track' ? 'Waiting' : 'Waiting',
      slaTime: c.sla_resolution_deadline ? formatRelativeTime(c.sla_resolution_deadline) : 'N/A',
      recommendedNextAction: c.conflict_summary?.recommended_action || c.ai_recommended_action || '',
      conflictDetected: c.conflict_summary?.root_cause || (c.has_reconciliation_conflicts ? c.conflict_severity : undefined),
      relatedCases: c.state_snapshot?.related?.linked_cases?.map((linked: any) => ({
        id: linked.case_number || linked.id,
        type: linked.type || 'Case',
        status: titleCase(linked.status || 'open'),
      })) || [],
      messages: [],
    };
  };

  const conversations = (apiCases && apiCases.length > 0)
    ? apiCases.map(mapApiCase)
    : CONVERSATIONS;

  const filteredConversations = conversations.filter(c => c.tab === activeTab);
  const selectedBaseConv = filteredConversations.find(c => c.id === selectedId) || filteredConversations[0];
  const selectedConv = selectedBaseConv ? {
    ...selectedBaseConv,
    orderId: selectedInboxView?.state?.identifiers?.order_ids?.[0] || selectedBaseConv.orderId,
    context: selectedInboxView?.state?.conflict?.root_cause || selectedInboxView?.case?.ai_diagnosis || selectedBaseConv.context,
    recommendedNextAction: selectedInboxView?.state?.conflict?.recommended_action || selectedBaseConv.recommendedNextAction,
    conflictDetected: selectedInboxView?.state?.conflict?.root_cause || selectedBaseConv.conflictDetected,
    slaStatus: selectedInboxView?.sla?.label || selectedBaseConv.slaStatus,
    slaTime: selectedInboxView?.sla?.time || selectedBaseConv.slaTime,
    relatedCases: selectedInboxView?.state?.related?.linked_cases?.map((linked: any) => ({
      id: linked.case_number || linked.id,
      type: linked.type || 'Case',
      status: titleCase(linked.status || 'open'),
    })) || selectedBaseConv.relatedCases,
    messages: selectedInboxView?.messages?.map((msg: any) => ({
      id: msg.id,
      type: msg.type === 'agent' ? 'agent' : msg.type === 'internal' ? 'internal' : msg.type === 'system' ? 'system' : msg.direction === 'outbound' ? 'agent' : 'customer',
      sender: msg.sender_name || (msg.direction === 'outbound' ? 'Agent' : 'Customer'),
      content: msg.content,
      time: formatTime(msg.sent_at),
    })) || selectedBaseConv.messages,
  } : undefined;

  useEffect(() => {
    if (filteredConversations.length > 0 && !filteredConversations.find(c => c.id === selectedId)) {
      setSelectedId(filteredConversations[0].id);
    }
  }, [activeTab, filteredConversations, selectedId]);

  useEffect(() => {
    setComposeMode('reply');
  }, [selectedId]);

  useEffect(() => {
    if (selectedInboxView?.latest_draft?.content) {
      setComposerText(selectedInboxView.latest_draft.content);
      return;
    }
    setComposerText('');
  }, [selectedInboxView?.latest_draft?.id, selectedId]);

  const handleApplyDraft = () => {
    const draft = selectedInboxView?.latest_draft?.content;
    if (draft) {
      setComposeMode('reply');
      setComposerText(draft);
    }
  };

  const handleSubmit = async () => {
    if (!selectedConv || !composerText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (composeMode === 'internal') {
        await casesApi.addInternalNote(selectedConv.id, composerText.trim());
      } else {
        await casesApi.reply(selectedConv.id, composerText.trim(), selectedInboxView?.latest_draft?.id);
      }
      setComposerText('');
      setRefreshKey(key => key + 1);
    } catch (error) {
      console.error('Inbox action failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSuggestedReply = (conv: Conversation) => {
    const firstName = conv.contactName.split(' ')[0];
    const orderId = conv.orderId;
    const caseType = conv.caseType;

    switch (caseType) {
      case 'Refund Inquiry':
        if (conv.refundStatus === 'Pending') {
          return `Hi ${firstName}, I've checked your refund for order ${orderId}. It was approved on our end, but banks usually take 5-7 business days to process. I'm monitoring the clearance for you.`;
        }
        return `Hi ${firstName}, I'm looking into your refund request for order ${orderId}. I'll have an update for you shortly.`;
      case 'Cancellation':
        if (conv.fulfillmentStatus === 'Packing' || conv.fulfillmentStatus === 'Shipped') {
          return `Hi ${firstName}, I've received your cancellation request for ${orderId}. Since the order is already in the ${conv.fulfillmentStatus.toLowerCase()} stage, I'm checking with our warehouse to see if we can still stop it.`;
        }
        return `Hi ${firstName}, I've received your cancellation request for ${orderId}. I'm processing it now and will confirm once it's cancelled.`;
      case 'Return/Replacement':
        return `Hi ${firstName}, I'm sorry about the damage to order ${orderId}. I've initiated a replacement request and our team will review the photos shortly. We'll send you a return label as well.`;
      case 'Payment Issue':
        return `Hi ${firstName}, I'm investigating the payment discrepancy for ${orderId}. I'm checking our payment gateway logs to verify the transaction status and will get back to you as soon as I have more info.`;
      case 'Address Change':
        if (conv.fulfillmentStatus === 'Shipped') {
          return `Hi ${firstName}, I see you'd like to change the address for ${orderId}. Unfortunately, the order has already shipped. I'll contact the carrier to see if we can reroute it.`;
        }
        return `Hi ${firstName}, I can help you with the address change for ${orderId}. I'm updating our records now to ensure it ships to the correct location.`;
      case 'Delivery Issue':
        return `Hi ${firstName}, I'm sorry to hear about the delivery issues with ${orderId}. I've contacted the carrier to investigate why the delivery attempts failed and will update you shortly.`;
      case 'Billing Update':
        return `Hi ${firstName}, I've received your request to update the billing details for ${orderId}. I'm forwarding this to our finance team to regenerate the invoice with the correct information.`;
      case 'Fraud Alert':
        return `Hi ${firstName}, we've detected some unusual activity on your account. For your security, we've temporarily held your order ${orderId} while we verify the details with you.`;
      case 'Inventory Inquiry':
        return `Hi ${firstName}, thank you for your interest in our products. I'm checking our current warehouse stock levels to confirm if we can fulfill your bulk order request for ${orderId || 'your inquiry'}.`;
      default:
        return `Hi ${firstName}, I'm looking into your case ${conv.caseId} regarding ${caseType}. I'll have an update for you shortly.`;
    }
  };

  const getChannelIcon = (channel: Channel) => {
    switch (channel) {
      case 'whatsapp': return 'forum';
      case 'email': return 'mail';
      default: return 'chat_bubble';
    }
  };

  const getChannelColor = (channel: Channel) => {
    switch (channel) {
      case 'whatsapp': return 'text-whatsapp bg-whatsapp/10';
      case 'email': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-200';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      {/* Inbox Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-card-dark rounded-t-xl mx-2 mt-2 border-b border-gray-100 dark:border-gray-700 shadow-card z-10">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Cases</h1>
          <div className="flex space-x-1">
            {[
              { id: 'unassigned', label: 'Unassigned', count: CONVERSATIONS.filter(c => c.tab === 'unassigned').length },
              { id: 'assigned', label: 'Assigned to me', count: CONVERSATIONS.filter(c => c.tab === 'assigned').length },
              { id: 'waiting', label: 'Waiting approval', count: CONVERSATIONS.filter(c => c.tab === 'waiting').length },
              { id: 'high_risk', label: 'High risk', count: CONVERSATIONS.filter(c => c.tab === 'high_risk').length },
            ].map(tab => (
              <span 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as CaseTab)}
                className={`px-3 py-1 text-sm font-medium rounded-full cursor-pointer transition-colors ${
                  activeTab === tab.id 
                    ? 'bg-black text-white' 
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {tab.label} ({tab.count})
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center text-gray-500 text-sm mr-2">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
            Online
          </div>
          <button className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <span className="material-symbols-outlined">filter_list</span>
          </button>
        </div>
      </div>

      {/* Main Content Area (3 Panes) */}
      <div className="flex-1 flex mx-2 mb-2 bg-card-light dark:bg-card-dark shadow-card overflow-hidden rounded-b-xl border border-t-0 border-gray-100 dark:border-gray-800">
        
        {/* Left Pane: Conversation List */}
        <div className="w-80 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 flex flex-col bg-gray-50/30 dark:bg-black/5">
          <div className="overflow-y-auto flex-1 custom-scrollbar p-2 space-y-2">
            {filteredConversations.length > 0 ? (
              filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  className={`p-4 rounded-xl border cursor-pointer group relative transition-all duration-200 ${
                    selectedId === conv.id
                      ? `bg-white dark:bg-gray-800 border-indigo-500 shadow-card scale-[1.02] z-10`
                      : 'bg-white dark:bg-card-dark border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 shadow-sm hover:shadow-card'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex flex-col">
                      <span className={`font-semibold text-sm ${selectedId === conv.id ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                        {conv.contactName}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">{conv.orderId}</span>
                    </div>
                    <span className="text-xs text-gray-400">{conv.time}</span>
                  </div>
                  <div className="mb-2">
                    <p className={`text-sm truncate ${selectedId === conv.id ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-600 dark:text-gray-300 font-normal'}`}>
                      {conv.lastMessage}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {conv.orderStatus === 'Delivered' && <span className="bg-blue-50 text-blue-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border border-blue-200">Delivered</span>}
                    {conv.fulfillmentStatus === 'Packing' && <span className="bg-blue-50 text-blue-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border border-blue-200">Packed</span>}
                    {conv.paymentStatus === 'Paid' && <span className="bg-blue-50 text-blue-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border border-blue-200">Captured</span>}
                    {conv.refundStatus === 'Pending' && <span className="bg-blue-50 text-blue-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border border-blue-200">Refund Pending</span>}
                    {conv.tags?.includes('Return') && <span className="bg-blue-50 text-blue-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border border-blue-200">Return</span>}
                    {conv.priority === 'high' && <span className="bg-red-50 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border border-red-200">High Risk</span>}
                    {conv.approvalStatus === 'Pending' && <span className="bg-blue-50 text-blue-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border border-blue-200">Approval Needed</span>}
                    {conv.conflictDetected && <span className="bg-red-50 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border border-red-200">Conflict</span>}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <span className="material-symbols-outlined text-4xl text-gray-300 mb-2">inbox</span>
                <p className="text-sm text-gray-500 font-medium">
                  {activeTab === 'unassigned' && "No unassigned operational cases right now."}
                  {activeTab === 'assigned' && "You have no assigned cases."}
                  {activeTab === 'waiting' && "No cases are currently waiting for approval."}
                  {activeTab === 'high_risk' && "No high-risk operational cases at the moment."}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Middle Pane: Chat Window */}
        {selectedConv ? (
          <div className={`flex-1 flex flex-col min-w-0 relative border-r border-gray-100 dark:border-gray-700 ${
            selectedConv.channel === 'whatsapp' ? 'bg-[#efeae2] dark:bg-[#0b141a]' : 'bg-white dark:bg-card-dark'
          }`}>
          {/* Chat Header */}
          <div className="h-14 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between px-6 bg-white dark:bg-card-dark">
            <div className="flex items-center gap-3">
              {selectedConv.channel === 'email' ? (
                <div className="w-8 h-8 rounded bg-blue-100 text-blue-700 flex flex-shrink-0 items-center justify-center font-bold text-xs border border-blue-200">TB</div>
              ) : (
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                  selectedConv.id === '1' ? 'bg-pink-500' : selectedConv.id === '4' ? 'bg-purple-500' : 'bg-indigo-500'
                }`}>
                  {selectedConv.contactName.split(' ').map(n => n[0]).join('')}
                </div>
              )}
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  {selectedConv.caseId}: {selectedConv.lastMessage}
                  <span className="text-xs font-normal text-gray-400">via {selectedConv.channel === 'whatsapp' ? 'WhatsApp' : selectedConv.channel === 'email' ? 'Email' : 'Web Chat'}</span>
                </h2>
                <p className="text-xs text-gray-500">
                  {selectedConv.contactName} • {selectedConv.orderId} • {selectedConv.brand}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {!isRightSidebarOpen && (
                <button 
                  onClick={() => setIsRightSidebarOpen(true)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-all"
                  title="Show Sidebar"
                >
                  <span className="material-symbols-outlined text-lg">view_sidebar</span>
                </button>
              )}
              <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
                <span className="material-symbols-outlined text-lg">{selectedConv.channel === 'email' ? 'reply' : 'check_circle'}</span>
              </button>
              <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
                <span className="material-symbols-outlined text-lg">{selectedConv.channel === 'email' ? 'check_circle' : 'snooze'}</span>
              </button>
              <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
                <span className="material-symbols-outlined text-lg">more_horiz</span>
              </button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className={`flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar ${
            selectedConv.channel === 'whatsapp' 
              ? "bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-opacity-10 dark:bg-opacity-5" 
              : "bg-gray-50/30 dark:bg-black/20"
          }`}>
            {/* Operational Status Summary */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3 shadow-card flex flex-wrap gap-4 items-center justify-between mb-2">
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold">Order</span>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{selectedConv.orderStatus}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold">Payment</span>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{selectedConv.paymentStatus}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold">Fulfillment</span>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{selectedConv.fulfillmentStatus}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold">Refund</span>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{selectedConv.refundStatus}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold">Approval</span>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{selectedConv.approvalStatus}</span>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold">Recommended Action</span>
                <span className="text-xs font-bold text-secondary">{selectedConv.recommendedNextAction}</span>
              </div>
            </div>

            {/* Conflict Detection (if any) */}
            {selectedConv.conflictDetected && (
              <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30 rounded-lg p-3 flex items-start gap-3">
                <span className="material-symbols-outlined text-red-500 text-lg">warning</span>
                <div>
                  <h4 className="text-xs font-bold text-red-800 dark:text-red-400 uppercase tracking-wider mb-1">Conflict Detected</h4>
                  <p className="text-xs text-red-700 dark:text-red-300">{selectedConv.conflictDetected}</p>
                </div>
              </div>
            )}

            <div className="flex justify-center">
              <span className="text-xs text-gray-400 bg-white dark:bg-gray-800 px-2 py-1 rounded shadow-card">Today, 08:15 AM</span>
            </div>

            {selectedConv.messages?.map((msg) => {
              if (msg.type === 'system') {
                return (
                  <div key={msg.id} className="flex justify-center my-2">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 bg-gray-100/50 dark:bg-gray-800/50 px-3 py-1 rounded-full border border-gray-200/50 dark:border-gray-700/50">
                      {msg.content}
                    </span>
                  </div>
                );
              }

              if (msg.type === 'internal') {
                return (
                  <div key={msg.id} className="flex space-x-3 my-4">
                    <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600 flex-shrink-0 border border-yellow-200">
                      <span className="material-symbols-outlined text-sm">lock</span>
                    </div>
                    <div className="space-y-1 max-w-[85%] w-full">
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/30 p-3 rounded-xl rounded-tl-none relative">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-yellow-800 dark:text-yellow-500 uppercase tracking-wide">Internal Note • {msg.sender}</span>
                          <span className="text-xs text-yellow-600/70">{msg.time}</span>
                        </div>
                        <p className="text-sm text-yellow-900 dark:text-yellow-100 leading-relaxed italic">
                          "{msg.content}"
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              const isRight = msg.type === 'agent' || msg.type === 'ai';
              const isAI = msg.type === 'ai';

              if (selectedConv.channel === 'whatsapp') {
                return (
                  <div key={msg.id} className={`flex ${isRight ? 'justify-end' : 'justify-start'} my-2`}>
                    <div className={`max-w-[75%] p-3 rounded-xl shadow-card text-[15px] ${
                      isRight 
                        ? "bg-[#dcf8c6] dark:bg-[#005c4b] rounded-tr-none text-gray-800 dark:text-[#e9edef] border border-whatsapp/20" 
                        : "bg-white dark:bg-[#202c33] rounded-tl-none text-gray-800 dark:text-[#e9edef]"
                    }`}>
                      {isAI && (
                        <div className="flex items-center gap-1 mb-1 text-xs font-semibold text-gray-500 dark:text-gray-300">
                          <span className="material-symbols-outlined text-[14px]">smart_toy</span>
                          AI Assistant
                        </div>
                      )}
                      {msg.content}
                      <span className={`float-right flex items-center gap-1 text-[11px] ml-4 mt-2 ${isRight ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400'}`}>
                        {msg.time} {isRight && <span className="material-symbols-outlined text-[14px] text-blue-500">done_all</span>}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className={`flex space-x-3 my-4 ${isRight ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                    isAI ? 'bg-secondary' : isRight ? 'bg-blue-500' : 'bg-pink-500'
                  }`}>
                    {isAI ? <span className="material-symbols-outlined text-sm">smart_toy</span> : msg.sender.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className={`space-y-1 max-w-[85%] ${isRight ? 'text-right' : ''}`}>
                    <div className={`p-4 rounded-2xl shadow-card border ${
                      isRight 
                        ? "bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/30 rounded-tr-none" 
                        : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-tl-none"
                    }`}>
                      {isAI && <div className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-1">AI Suggestion</div>}
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                        {msg.content}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 px-1">{msg.time}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reply Area */}
          <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-card-dark">
            <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-2 focus-within:ring-2 focus-within:ring-secondary/20 focus-within:border-secondary transition-all">
              <div className="flex items-center space-x-2 border-b border-gray-100 dark:border-gray-700 pb-2 mb-2 px-2">
                <button className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500"><span className="material-symbols-outlined text-lg">format_bold</span></button>
                <button className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500"><span className="material-symbols-outlined text-lg">format_italic</span></button>
                <button className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500"><span className="material-symbols-outlined text-lg">link</span></button>
                <div className="h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>
                <button
                  onClick={() => setComposeMode(mode => mode === 'reply' ? 'internal' : 'reply')}
                  className={`relative inline-flex items-center h-5 rounded-full w-9 transition-colors focus:outline-none ${composeMode === 'reply' ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`}
                  id="toggle"
                >
                  <span className={`inline-block w-3 h-3 transform bg-white rounded-full transition-transform ${composeMode === 'reply' ? 'translate-x-5' : 'translate-x-1'}`}></span>
                </button>
                <span className={`text-xs font-medium ${composeMode === 'reply' ? 'text-blue-600' : 'text-gray-500'}`}>
                  {composeMode === 'reply' ? `Reply as ${selectedConv.channel === 'email' ? 'Email' : selectedConv.channel === 'whatsapp' ? 'WhatsApp' : 'Web Chat'}` : 'Internal Note'}
                </span>
                <button className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 flex items-center gap-1 ml-auto">
                  <span className="material-symbols-outlined text-lg">sentiment_satisfied</span>
                </button>
              </div>
              <textarea
                value={composerText}
                onChange={(event) => setComposerText(event.target.value)}
                className="w-full bg-transparent border-0 focus:ring-0 text-sm text-gray-800 dark:text-gray-200 resize-none h-20 px-2"
                placeholder={composeMode === 'reply' ? `Write your reply to ${selectedConv.contactName}...` : `Write an internal note for ${selectedConv.contactName}...`}
              ></textarea>
              <div className="flex justify-between items-center px-2 pt-1">
                <div className="flex space-x-2">
                  <button className="text-gray-400 hover:text-gray-600"><span className="material-symbols-outlined text-xl">attach_file</span></button>
                  <button className="text-gray-400 hover:text-gray-600"><span className="material-symbols-outlined text-xl">image</span></button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Press ⌘ + Enter to send</span>
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !composerText.trim()}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                      composeMode === 'reply' && selectedConv.channel === 'email' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-black dark:bg-white text-white dark:text-black hover:opacity-90'
                    }`}
                  >
                    {isSubmitting ? 'Sending...' : composeMode === 'reply' ? 'Send' : 'Save note'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-black/20 text-gray-400">
          <span className="material-symbols-outlined text-6xl mb-4 opacity-20">auto_awesome</span>
          <p className="text-lg font-medium opacity-50">Select a case to view details</p>
        </div>
      )}

        {/* Right Pane: Details / Copilot Sidebar */}
        <div className={`transition-all duration-300 bg-white dark:bg-card-dark flex flex-col overflow-hidden ${isRightSidebarOpen ? 'w-80 lg:w-96 border-l border-gray-100 dark:border-gray-700' : 'w-0 border-none'}`}>
          {selectedConv ? (
            <>
              {/* Tabs */}
              <div className="flex items-center border-b border-gray-100 dark:border-gray-700 px-2 flex-shrink-0">
                <button
                  onClick={() => setRightTab('details')}
                  className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
                    rightTab === 'details'
                      ? 'text-gray-900 border-gray-900 font-bold'
                      : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 border-transparent'
                  }`}
                >
                  Details
                </button>
                <button
                  onClick={() => setRightTab('copilot')}
                  className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 flex items-center justify-center gap-2 ${
                    rightTab === 'copilot'
                      ? 'text-secondary border-secondary font-bold bg-purple-50/50 dark:bg-purple-900/10'
                      : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 border-transparent'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">smart_toy</span>
                  Copilot
                </button>
                <div className="flex items-center gap-1 ml-auto">
                  <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
                    <span className="material-symbols-outlined text-[20px]">settings</span>
                  </button>
                  <button 
                    onClick={() => setIsRightSidebarOpen(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-all"
                    title="Hide Sidebar"
                  >
                    <span className="material-symbols-outlined text-[20px]">view_sidebar</span>
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {rightTab === 'copilot' ? (
                  <div className="p-4 flex flex-col gap-5">
                    {/* Copilot Case Summary */}
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-lg shadow-secondary/20">
                        <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                      </div>
                      <div className="flex flex-col gap-3 max-w-[85%] w-full">
                        <div className="bg-purple-50 dark:bg-purple-900/20 text-gray-800 dark:text-gray-200 text-sm py-3 px-4 rounded-2xl rounded-tl-sm border border-purple-100 dark:border-purple-800/30 shadow-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-secondary text-lg">description</span>
                            <h4 className="font-bold text-xs uppercase tracking-wider text-secondary">Case Summary</h4>
                          </div>
                          <p className="leading-relaxed mb-4 text-gray-700 dark:text-gray-300">{selectedConv.context}</p>
                          
                          <div className="flex items-center gap-2 mb-2">
                            <span className="material-symbols-outlined text-red-500 text-lg">warning</span>
                            <h4 className="font-bold text-xs uppercase tracking-wider text-red-600 dark:text-red-400">Conflict Detection</h4>
                          </div>
                          <div className={`p-2.5 rounded border text-xs mb-4 ${
                            selectedConv.conflictDetected 
                              ? 'bg-red-50 dark:bg-red-900/30 border-red-100 dark:border-red-800/30 text-red-700 dark:text-red-400' 
                              : 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-800/30 text-green-700 dark:text-green-400'
                          }`}>
                            {selectedConv.conflictDetected || 'No major conflicts detected in system logs.'}
                          </div>

                          <div className="flex items-center gap-2 mb-2">
                            <span className="material-symbols-outlined text-secondary text-lg">bolt</span>
                            <h4 className="font-bold text-xs uppercase tracking-wider text-secondary">Recommended Action</h4>
                          </div>
                          <p className="text-xs bg-white/60 dark:bg-black/30 p-2.5 rounded border border-purple-100 dark:border-purple-800/30 italic text-gray-600 dark:text-gray-400">
                            {selectedConv.recommendedNextAction}
                          </p>
                        </div>
                        
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-card">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-gray-400 text-lg">chat_bubble</span>
                              <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500">Suggested Reply</h4>
                            </div>
                            <span className="text-[10px] font-bold text-secondary bg-purple-50 dark:bg-purple-900/30 px-2 py-0.5 rounded-full">AI Powered</span>
                          </div>
                          <div className="relative group">
                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed italic mb-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                              {selectedInboxView?.latest_draft?.content || getSuggestedReply(selectedConv)}
                            </p>
                            <button
                              onClick={handleApplyDraft}
                              className="w-full py-2.5 bg-secondary text-white text-xs font-bold rounded-xl hover:bg-secondary/90 transition-all shadow-lg shadow-secondary/20 flex items-center justify-center gap-2"
                            >
                              <span className="material-symbols-outlined text-sm">content_copy</span>
                              Apply to Composer
                            </button>
                          </div>
                        </div>

                        {/* Extra AI Insights */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-blue-50 dark:bg-blue-900/10 p-3 rounded-xl border border-blue-100 dark:border-blue-800/30">
                            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest block mb-1">Sentiment</span>
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-blue-500 text-sm">sentiment_neutral</span>
                              <span className="text-xs font-bold text-blue-900 dark:text-blue-200">Neutral</span>
                            </div>
                          </div>
                          <div className="bg-orange-50 dark:bg-orange-900/10 p-3 rounded-xl border border-orange-100 dark:border-orange-800/30">
                            <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest block mb-1">Risk Score</span>
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-orange-500 text-sm">trending_up</span>
                              <span className="text-xs font-bold text-orange-900 dark:text-orange-200">{selectedConv.riskLevel}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {/* Case Attributes */}
                    <div className="p-4">
                      <button className="w-full py-2 flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-lg text-gray-600">assignment</span>
                          Case Attributes
                        </div>
                        <span className="material-symbols-outlined text-lg text-gray-400">expand_more</span>
                      </button>
                      <div className="grid grid-cols-2 gap-4 mt-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-gray-500">Case ID</span>
                          <span className="text-xs font-bold text-gray-900 dark:text-white">{selectedConv.caseId}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-gray-500">Order ID</span>
                          <span className="text-xs font-bold text-gray-900 dark:text-white">{selectedConv.orderId}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-gray-500">Assignee</span>
                          <span className="text-xs font-bold text-gray-900 dark:text-white">{selectedConv.assignee || 'Unassigned'}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-gray-500">Assigned Team</span>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{selectedConv.assignedTeam}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-gray-500">Case Type</span>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{selectedConv.caseType}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-gray-500">Priority</span>
                          <span className={`text-xs font-bold ${selectedConv.priority === 'high' ? 'text-red-600' : 'text-green-600'}`}>{selectedConv.priority === 'high' ? 'High' : 'Normal'}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-gray-500">Approval Status</span>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{selectedConv.approvalStatus}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-gray-500">Last Sync</span>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{selectedConv.lastSync}</span>
                        </div>
                      </div>
                    </div>

                    {/* Operational Links */}
                    <div className="p-4">
                      <button className="w-full py-2 flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-lg text-gray-600">link</span>
                          Operational Links
                        </div>
                        <span className="material-symbols-outlined text-lg text-gray-400">expand_more</span>
                      </button>
                      <div className="space-y-2 mt-2">
                        <a href="#" className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                          Order Management System (OMS)
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                        </a>
                        <a href="#" className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                          Payment Gateway (PSP)
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                        </a>
                        <a href="#" className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                          Carrier Tracking Portal
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                        </a>
                        <a href="#" className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                          Return Record (RMS)
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                        </a>
                        <a href="#" className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                          Warehouse (WMS) Ticket
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                        </a>
                      </div>
                    </div>

                    {/* Related Cases */}
                    <div className="p-4">
                      <button className="w-full py-2 flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-lg text-gray-600">history</span>
                          Related Cases
                        </div>
                        <span className="material-symbols-outlined text-lg text-gray-400">expand_more</span>
                      </button>
                      <div className="space-y-2 mt-2">
                        {selectedConv.relatedCases && selectedConv.relatedCases.length > 0 ? (
                          selectedConv.relatedCases.map(rc => (
                            <div key={rc.id} className="p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-bold text-gray-900 dark:text-white">{rc.id}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{rc.status}</span>
                              </div>
                              <p className="text-[10px] text-gray-500">{rc.type}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-gray-400 italic p-2">No related cases found.</p>
                        )}
                      </div>
                    </div>

                    {/* Internal Notes */}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          <span className="material-symbols-outlined text-lg text-gray-600">sticky_note_2</span>
                          Internal Notes
                        </h3>
                        <button
                          onClick={() => setComposeMode('internal')}
                          className="text-xs text-secondary font-bold hover:underline"
                        >
                          + Add Note
                        </button>
                      </div>
                      <div className="space-y-3">
                        {selectedInboxView?.internal_notes?.length ? selectedInboxView.internal_notes.map((note: any) => (
                          <div key={note.id} className="p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg border border-yellow-100 dark:border-yellow-800/20">
                            <p className="text-xs text-yellow-900 dark:text-yellow-100 leading-relaxed italic">
                              "{note.content}"
                            </p>
                            <div className="mt-2 flex justify-between items-center text-[10px] text-yellow-700/70">
                              <span>{note.created_by || 'Internal Note'}</span>
                              <span>{formatTime(note.created_at)}</span>
                            </div>
                          </div>
                        )) : (
                          <p className="text-xs text-gray-400 italic p-2">No internal notes yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Copilot Input Area (always visible at bottom) */}
              <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-card-dark">
                <div className="relative bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center p-2 focus-within:ring-2 focus-within:ring-secondary/20 focus-within:border-secondary transition-all shadow-card">
                  <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"><span className="material-symbols-outlined text-[20px]">auto_awesome</span></button>
                  <input className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-800 dark:text-gray-200 px-2 h-9" placeholder="Ask a question..." type="text" />
                  <div className="flex items-center gap-1">
                    <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"><span className="material-symbols-outlined text-[20px]">sort</span></button>
                    <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"><span className="material-symbols-outlined text-[20px]">arrow_upward</span></button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50/50 dark:bg-black/10">
              <span className="material-symbols-outlined text-5xl text-gray-200 mb-4">analytics</span>
              <p className="text-sm text-gray-400 italic">Select a case to view operational details and AI-powered insights.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
