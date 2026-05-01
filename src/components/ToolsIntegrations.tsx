import React, { useState } from 'react';
import { connectorsApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';

// ── Credential field schemas per connector system ────────────────────────────
// These define which auth_config fields are shown in the "Connect" modal.
interface CredentialField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder?: string;
  hint?: string;
  required?: boolean;
}

const CONNECTOR_CREDENTIAL_SCHEMAS: Record<string, CredentialField[]> = {
  slack: [
    { key: 'bot_token', label: 'Bot Token', type: 'password', placeholder: 'xoxb-...', hint: 'From your Slack App → OAuth & Permissions → Bot User OAuth Token', required: true },
    { key: 'channel', label: 'Default channel (optional)', type: 'text', placeholder: '#support-alerts', hint: 'Can be overridden per workflow node' },
  ],
  discord: [
    { key: 'webhook_url', label: 'Webhook URL', type: 'url', placeholder: 'https://discord.com/api/webhooks/...', hint: 'From Discord Server Settings → Integrations → Webhooks', required: true },
  ],
  telegram: [
    { key: 'bot_token', label: 'Bot Token', type: 'password', placeholder: '123456:ABC-...', hint: 'From @BotFather on Telegram', required: true },
    { key: 'default_chat_id', label: 'Default chat ID (optional)', type: 'text', placeholder: '-100xxxxxxxxxx', hint: 'Numeric chat or channel ID (can be overridden per node)' },
  ],
  teams: [
    { key: 'webhook_url', label: 'Incoming Webhook URL', type: 'url', placeholder: 'https://outlook.office.com/webhook/...', hint: 'From Teams channel → Connectors → Incoming Webhook', required: true },
  ],
  google_chat: [
    { key: 'webhook_url', label: 'Chat Space Webhook URL', type: 'url', placeholder: 'https://chat.googleapis.com/v1/spaces/.../messages?key=...', hint: 'From Google Chat space → Manage webhooks', required: true },
  ],
  shopify: [
    { key: 'shop_domain', label: 'Shop domain', type: 'text', placeholder: 'your-store.myshopify.com', required: true },
    { key: 'admin_api_token', label: 'Admin API access token', type: 'password', placeholder: 'shpat_...', hint: 'From Shopify Admin → Apps → Private apps', required: true },
    { key: 'webhook_secret', label: 'Webhook secret (optional)', type: 'password', placeholder: 'HMAC secret for webhook validation' },
  ],
  stripe: [
    { key: 'secret_key', label: 'Secret key', type: 'password', placeholder: 'sk_live_...', hint: 'From Stripe Dashboard → Developers → API keys', required: true },
    { key: 'webhook_secret', label: 'Webhook secret', type: 'password', placeholder: 'whsec_...', hint: 'From Stripe Dashboard → Webhooks → Signing secret' },
  ],
  zendesk: [
    { key: 'subdomain', label: 'Subdomain', type: 'text', placeholder: 'your-company', hint: 'e.g. "your-company" from your-company.zendesk.com', required: true },
    { key: 'email', label: 'Agent email', type: 'text', placeholder: 'agent@yourcompany.com', required: true },
    { key: 'api_token', label: 'API token', type: 'password', placeholder: 'Zendesk API token', required: true },
  ],
  intercom: [
    { key: 'access_token', label: 'Access token', type: 'password', placeholder: 'dG9rO...', hint: 'From Intercom Developer Hub → Your Apps → Access token', required: true },
  ],
  whatsapp: [
    { key: 'phone_number_id', label: 'Phone number ID', type: 'text', placeholder: '1234567890', hint: 'From Meta Business Platform → WhatsApp → Phone numbers', required: true },
    { key: 'access_token', label: 'Access token', type: 'password', placeholder: 'EAAB...', hint: 'Permanent access token from Meta', required: true },
    { key: 'verify_token', label: 'Webhook verify token', type: 'text', placeholder: 'my-secret-token', hint: 'Custom token you set for webhook verification' },
  ],
  gmail: [
    { key: 'client_id', label: 'OAuth Client ID', type: 'text', placeholder: 'xxx.apps.googleusercontent.com', hint: 'From Google Cloud Console → Credentials', required: true },
    { key: 'client_secret', label: 'OAuth Client Secret', type: 'password', placeholder: 'GOCSPX-...', required: true },
    { key: 'refresh_token', label: 'Refresh token', type: 'password', placeholder: 'From OAuth flow', required: true },
  ],
  hubspot: [
    { key: 'api_key', label: 'Private App Token', type: 'password', placeholder: 'pat-na1-...', hint: 'From HubSpot → Settings → Private Apps', required: true },
  ],
  // AI providers — per-workspace keys override the global env var
  anthropic: [
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'sk-ant-...', hint: 'From console.anthropic.com → API Keys. Overrides ANTHROPIC_API_KEY env var.', required: true },
  ],
  openai: [
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'sk-...', hint: 'From platform.openai.com → API keys. Overrides OPENAI_API_KEY env var.', required: true },
  ],
  ollama: [
    { key: 'base_url', label: 'Ollama server URL', type: 'url', placeholder: 'http://localhost:11434', hint: 'URL of your Ollama server. Overrides OLLAMA_BASE_URL env var.', required: true },
  ],
  gemini: [
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'AIzaSy...', hint: 'From aistudio.google.com → Get API key. Overrides GEMINI_API_KEY env var.', required: true },
  ],
};

// Fallback: generic api_key + base_url fields for unrecognized connectors
const GENERIC_CREDENTIAL_FIELDS: CredentialField[] = [
  { key: 'api_key', label: 'API Key / Token', type: 'password', placeholder: 'Your API key or access token', required: true },
  { key: 'base_url', label: 'Base URL (optional)', type: 'url', placeholder: 'https://api.example.com' },
];

type IntegrationCategory = 'All Apps' | 'Support' | 'Commerce' | 'Communication' | 'CRM' | 'Knowledge' | 'Productivity' | 'Automation' | 'AI';

interface Integration {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  powers: string;
  status: 'Connected' | 'Not Connected' | 'Error' | 'Reconnect Required' | 'Syncing' | 'Importing' | 'Beta' | 'Coming Soon';
  icon: string | React.ReactNode;
  color?: string;
}

const allIntegrations: Integration[] = [
  // Support
  { id: 'zendesk', name: 'Zendesk', category: 'Support', description: 'Sync tickets, macros, and customer data.', powers: 'Ticketing', status: 'Connected', icon: 'Z', color: 'bg-emerald-600' },
  { id: 'intercom', name: 'Intercom', category: 'Support', description: 'Manage conversations and user attributes.', powers: 'Messaging', status: 'Connected', icon: 'chat', color: 'bg-blue-600' },
  { id: 'gorgias', name: 'Gorgias', category: 'Support', description: 'E-commerce helpdesk integration.', powers: 'Ticketing', status: 'Not Connected', icon: 'headset_mic', color: 'bg-indigo-500' },
  { id: 'freshdesk', name: 'Freshdesk', category: 'Support', description: 'Customer support software sync.', powers: 'Ticketing', status: 'Not Connected', icon: 'support_agent', color: 'bg-orange-500' },
  { id: 'helpscout', name: 'Help Scout', category: 'Support', description: 'Shared inbox and knowledge base.', powers: 'Ticketing', status: 'Not Connected', icon: 'mail', color: 'bg-blue-400' },
  
  // Commerce
  { id: 'shopify', name: 'Shopify', category: 'Commerce', description: 'Sync orders, customers, and products.', powers: 'Order Agent', status: 'Connected', icon: 'shopping_bag', color: 'bg-green-600' },
  { id: 'woocommerce', name: 'WooCommerce', category: 'Commerce', description: 'Open-source e-commerce plugin.', powers: 'Order Agent', status: 'Not Connected', icon: 'storefront', color: 'bg-purple-600' },
  { id: 'bigcommerce', name: 'BigCommerce', category: 'Commerce', description: 'B2B and B2C e-commerce platform.', powers: 'Order Agent', status: 'Not Connected', icon: 'shopping_cart', color: 'bg-gray-800' },
  { id: 'stripe', name: 'Stripe', category: 'Commerce', description: 'Manage payments, refunds, and subscriptions.', powers: 'Billing Agent', status: 'Error', icon: 'payments', color: 'bg-indigo-600' },
  { id: 'paypal', name: 'PayPal', category: 'Commerce', description: 'Online payments system.', powers: 'Billing Agent', status: 'Not Connected', icon: 'account_balance_wallet', color: 'bg-blue-700' },
  { id: 'adyen', name: 'Adyen', category: 'Commerce', description: 'Global payment company.', powers: 'Billing Agent', status: 'Not Connected', icon: 'credit_card', color: 'bg-green-500' },
  { id: 'recharge', name: 'Recharge', category: 'Commerce', description: 'Subscription management for e-commerce.', powers: 'Subscriptions', status: 'Connected', icon: 'autorenew', color: 'bg-teal-500' },
  { id: 'loopreturns', name: 'Loop Returns', category: 'Commerce', description: 'Returns management platform.', powers: 'Returns Workflow', status: 'Not Connected', icon: 'keyboard_return', color: 'bg-gray-900' },
  { id: 'shipstation', name: 'ShipStation', category: 'Commerce', description: 'Shipping and order fulfillment.', powers: 'Shipping Actions', status: 'Not Connected', icon: 'local_shipping', color: 'bg-green-700' },
  { id: 'aftership', name: 'AfterShip', category: 'Commerce', description: 'Shipment tracking and notifications.', powers: 'Shipping Actions', status: 'Not Connected', icon: 'share_location', color: 'bg-yellow-600' },

  // Communication
  { id: 'slack', name: 'Slack', category: 'Communication', description: 'Team communication and alerts.', powers: 'Notifications', status: 'Reconnect Required', icon: 'tag', color: 'bg-purple-700' },
  { id: 'teams', name: 'Microsoft Teams', category: 'Communication', description: 'Workspace for real-time collaboration.', powers: 'Collaboration', status: 'Not Connected', icon: 'groups', color: 'bg-indigo-700' },
  { id: 'whatsapp', name: 'WhatsApp Business', category: 'Communication', description: 'Direct customer messaging.', powers: 'Messaging', status: 'Not Connected', icon: 'chat_bubble', color: 'bg-green-500' },
  { id: 'gmail', name: 'Gmail / Google Workspace', category: 'Communication', description: 'Email integration and sync.', powers: 'Email Agent', status: 'Syncing', icon: 'mail', color: 'bg-red-500' },
  { id: 'outlook', name: 'Outlook / Microsoft 365 Mail', category: 'Communication', description: 'Enterprise email integration.', powers: 'Email Agent', status: 'Not Connected', icon: 'mark_email_unread', color: 'bg-blue-600' },
  { id: 'twilio', name: 'Twilio', category: 'Communication', description: 'SMS and voice communications.', powers: 'SMS Agent', status: 'Not Connected', icon: 'sms', color: 'bg-red-600' },

  // CRM
  { id: 'hubspot', name: 'HubSpot', category: 'CRM', description: 'Inbound marketing, sales, and service.', powers: 'CRM Context', status: 'Connected', icon: 'hub', color: 'bg-orange-500' },
  { id: 'salesforce', name: 'Salesforce', category: 'CRM', description: 'Customer relationship management.', powers: 'CRM Context', status: 'Not Connected', icon: 'cloud', color: 'bg-blue-500' },
  { id: 'pipedrive', name: 'Pipedrive', category: 'CRM', description: 'Sales CRM and pipeline management.', powers: 'CRM Context', status: 'Not Connected', icon: 'filter_alt', color: 'bg-green-600' },

  // Knowledge
  { id: 'notion', name: 'Notion', category: 'Knowledge', description: 'Connected workspace for your docs.', powers: 'Knowledge Sync', status: 'Connected', icon: 'description', color: 'bg-gray-900' },
  { id: 'gdrive', name: 'Google Drive', category: 'Knowledge', description: 'Cloud storage and file backup.', powers: 'Knowledge Sync', status: 'Not Connected', icon: 'add_to_drive', color: 'bg-blue-500' },
  { id: 'confluence', name: 'Confluence', category: 'Knowledge', description: 'Team workspace and documentation.', powers: 'Knowledge Sync', status: 'Not Connected', icon: 'menu_book', color: 'bg-blue-600' },

  // Productivity
  { id: 'jira', name: 'Jira', category: 'Productivity', description: 'Issue and project tracking.', powers: 'Ticketing', status: 'Not Connected', icon: 'bug_report', color: 'bg-blue-600' },

  // Automation
  { id: 'zapier', name: 'Zapier', category: 'Automation', description: 'Automate workflows across apps.', powers: 'Automation', status: 'Connected', icon: 'bolt', color: 'bg-orange-600' },
  { id: 'customapp', name: 'Custom App / Webhooks', category: 'Automation', description: 'Connect private APIs and internal systems.', powers: 'Custom Actions', status: 'Connected', icon: 'webhook', color: 'bg-gray-800' },

  // AI providers — per-workspace API keys for workflow ai.* nodes
  { id: 'anthropic', name: 'Anthropic Claude', category: 'AI', description: 'Anthropic Claude models for AI workflow nodes (claude-3-5-sonnet, claude-opus-4, etc).', powers: 'ai.anthropic node', status: 'Not Connected', icon: 'auto_awesome_motion', color: 'bg-orange-800' },
  { id: 'openai', name: 'OpenAI', category: 'AI', description: 'OpenAI GPT-4o, embeddings, and DALL·E for AI workflow nodes.', powers: 'ai.openai node', status: 'Not Connected', icon: 'memory', color: 'bg-gray-900' },
  { id: 'gemini', name: 'Google Gemini', category: 'AI', description: 'Google Gemini Pro/Flash models for AI workflow nodes.', powers: 'ai.gemini node', status: 'Not Connected', icon: 'diamond', color: 'bg-blue-600' },
  { id: 'ollama', name: 'Ollama (local AI)', category: 'AI', description: 'Connect a self-hosted Ollama server to run open-source models locally.', powers: 'ai.ollama node', status: 'Not Connected', icon: 'computer', color: 'bg-gray-700' },
];

const topCriticalIds = [
  'zendesk', 'intercom', 'gorgias', 'shopify', 'stripe', 'recharge', 
  'slack', 'gmail', 'notion', 'hubspot', 'zapier', 'customapp'
];

export default function ToolsIntegrations() {
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory>('All Apps');
  const [searchQuery, setSearchQuery] = useState('');
  const [configModal, setConfigModal] = useState<{
    connectorId: string;
    system: string;
    name: string;
    fields: CredentialField[];
    values: Record<string, string>;
  } | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const { data: apiConnectors, refetch } = useApi(connectorsApi.list);
  const testConnector = useMutation((id: string) => connectorsApi.test(id));
  const updateConnector = useMutation((payload: { id: string; body: Record<string, any> }) => connectorsApi.update(payload.id, payload.body));

  function openConfigModal(integration: Integration) {
    const apiConnector = (apiConnectors as any[])?.find((c: any) => c.system.toLowerCase() === integration.id);
    if (!apiConnector) return;
    const fields = CONNECTOR_CREDENTIAL_SCHEMAS[integration.id] ?? GENERIC_CREDENTIAL_FIELDS;
    const existing: Record<string, string> = {};
    if (apiConnector.auth_config && typeof apiConnector.auth_config === 'object') {
      for (const f of fields) {
        if (apiConnector.auth_config[f.key] !== undefined) {
          existing[f.key] = String(apiConnector.auth_config[f.key]);
        }
      }
    }
    setSaveStatus('idle');
    setConfigModal({ connectorId: apiConnector.id, system: integration.id, name: integration.name, fields, values: existing });
  }

  async function saveConfigModal() {
    if (!configModal) return;
    setSaveStatus('saving');
    try {
      await updateConnector.mutate({
        id: configModal.connectorId,
        body: { auth_config: configModal.values, status: 'active' },
      });
      setSaveStatus('saved');
      refetch();
      setTimeout(() => { setConfigModal(null); setSaveStatus('idle'); }, 1200);
    } catch {
      setSaveStatus('error');
    }
  }

  const categories: IntegrationCategory[] = ['All Apps', 'Support', 'Commerce', 'Communication', 'CRM', 'Knowledge', 'Productivity', 'Automation', 'AI'];

  const integrations = apiConnectors && apiConnectors.length > 0 
    ? apiConnectors.map(c => ({
        id: c.system.toLowerCase(),
        name: c.system,
        category: (c.category || 'Support') as IntegrationCategory,
        description: `Integration with ${c.system}`,
        powers: c.connector_capabilities?.length > 0 ? c.connector_capabilities[0].action_schema : 'Basic Sync',
        status: c.status === 'active' ? 'Connected' : c.status === 'error' ? 'Error' : 'Not Connected',
        icon: c.system.charAt(0),
        color: 'bg-indigo-600'
      })) as Integration[]
    : allIntegrations;

  const filteredIntegrations = integrations.filter(app => {
    const matchesCategory = activeCategory === 'All Apps' || app.category === activeCategory;
    const matchesSearch = app.name.toLowerCase().includes(searchQuery.toLowerCase()) || app.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const connectedCount = integrations.filter(app => app.status === 'Connected' || app.status === 'Syncing').length;
  const errorCount = integrations.filter(app => app.status === 'Error' || app.status === 'Reconnect Required').length;

  const renderIntegrationCard = (integration: Integration) => (
    <div key={integration.id} className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200/80 dark:border-gray-700 shadow-card p-6 flex flex-col md:flex-row items-center gap-6 group hover:shadow-md transition-all duration-200 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-gray-50 dark:from-gray-800/20 to-transparent pointer-events-none"></div>
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-card text-white ${integration.color}`}>
        {integration.icon === 'Z' ? (
          <span className="font-bold text-3xl tracking-tight">Z</span>
        ) : (
          <span className="material-symbols-outlined text-3xl">{integration.icon}</span>
        )}
      </div>
      <div className="flex-1 min-w-0 z-10 text-center md:text-left">
        <div className="flex flex-col md:flex-row items-center md:items-baseline gap-2 mb-2">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{integration.name}</h3>
          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
            integration.status === 'Error' || integration.status === 'Reconnect Required'
              ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/50'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600'
          }`}>
            Powers: {integration.powers}
          </span>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-2xl">{integration.description}</p>
      </div>
      <div className="flex flex-col items-center md:items-end gap-3 z-10 flex-shrink-0 md:pl-6 md:border-l border-gray-100 dark:border-gray-700">
        {integration.status === 'Connected' && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-md text-[11px] font-bold border border-green-100 dark:border-green-800/50">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Connected
          </div>
        )}
        {integration.status === 'Syncing' && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-md text-[11px] font-bold border border-blue-100 dark:border-blue-800/50">
            <span className="material-symbols-outlined text-[12px] animate-spin">sync</span> Syncing
          </div>
        )}
        {integration.status === 'Not Connected' && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-md text-[11px] font-bold border border-gray-200 dark:border-gray-700">
            Not Connected
          </div>
        )}
        {(integration.status === 'Error' || integration.status === 'Reconnect Required') && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md text-[11px] font-bold border border-red-100 dark:border-red-900/50 animate-pulse">
            <span className="material-symbols-outlined text-[12px]">warning</span> {integration.status}
          </div>
        )}
        
        <button
          onClick={() => openConfigModal(integration)}
          className={`text-sm font-semibold px-5 py-2 rounded-xl transition-colors shadow-card min-w-[100px] border ${
          integration.status === 'Connected' || integration.status === 'Syncing' ? 'text-gray-700 dark:text-white border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700' :
          integration.status === 'Error' || integration.status === 'Reconnect Required' ? 'text-red-600 bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900 hover:bg-red-100 dark:hover:bg-red-900/40' :
          'text-white bg-gray-900 dark:bg-white dark:text-black hover:bg-black dark:hover:bg-gray-200'
        }`}>
          {integration.status === 'Connected' ? 'Manage' :
           integration.status === 'Syncing' ? 'Configure' :
           integration.status === 'Error' || integration.status === 'Reconnect Required' ? 'Reconnect' : 'Connect'}
        </button>
      </div>
    </div>
  );

  const renderMiniCard = (app: Integration) => (
    <div key={app.id} onClick={() => openConfigModal(app)} className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200/80 dark:border-gray-700 shadow-card p-5 flex items-center gap-4 group hover:shadow-md transition-all cursor-pointer">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-white shadow-card ring-1 ring-white/20 ${app.color}`}>
        {app.icon === 'Z' ? (
          <span className="font-bold text-xl tracking-tight">Z</span>
        ) : (
          <span className="material-symbols-outlined text-2xl">{app.icon}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors truncate">{app.name}</h3>
          {(app.status === 'Connected' || app.status === 'Syncing') && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0"></span>
          )}
          {(app.status === 'Error' || app.status === 'Reconnect Required') && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0"></span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{app.category} · {app.powers}</p>
      </div>
      <button className="w-8 h-8 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-colors">
        <span className="material-symbols-outlined text-lg">
          {app.status === 'Connected' || app.status === 'Syncing' ? 'settings' : 'add'}
        </span>
      </button>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
        {/* Header */}
        <div className="p-6 pb-0 flex-shrink-0 z-20">
          <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card">
            <div className="px-6 py-4 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Tools & Integrations</h1>
                <p className="text-xs text-gray-500 mt-0.5">Manage your stack, migrations, and API connections.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-4 mr-2 border-r border-gray-200 dark:border-gray-700 pr-5 py-1">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Connected: {connectedCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Errors: {errorCount}</span>
                  </div>
                </div>
                <div className="relative w-64 mr-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-lg">search</span>
                  <input 
                    type="text" 
                    placeholder="Find an app..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white transition-all"
                  />
                </div>
                <button className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold hover:opacity-90 transition-opacity shadow-card flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">add_link</span>
                  Custom App
                </button>
              </div>
            </div>
            <div className="px-6 flex items-center space-x-8 border-t border-gray-100 dark:border-gray-800 pt-3 overflow-x-auto custom-scrollbar">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`pb-3 text-sm transition-colors border-b-2 whitespace-nowrap ${
                    activeCategory === category
                      ? 'font-bold text-gray-900 dark:text-white border-black dark:border-white'
                      : 'font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-transparent hover:border-gray-300'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <div className="space-y-10">
            
            {activeCategory === 'All Apps' && !searchQuery && (
              <>
                {/* Migration Center */}
                <section>
                  <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 px-1">Migration Center</h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Intercom Import */}
                    <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200/80 dark:border-gray-700 shadow-card p-6 relative overflow-hidden group hover:shadow-md transition-all duration-300 flex flex-col gap-4">
                      <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                        <span className="material-symbols-outlined text-8xl text-blue-500 -mr-6 -mt-6 rotate-12">move_up</span>
                      </div>
                      <div className="flex items-start justify-between z-10">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md flex-shrink-0">
                            <span className="material-symbols-outlined text-2xl">chat</span>
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-gray-900 dark:text-white">Import from Intercom</h3>
                            <span className="inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                              Est. 10-20 min
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 z-10">Seamlessly transfer historical conversations, user data, and tags.</p>
                      <div className="flex items-center justify-between mt-2 z-10">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center text-xs font-medium text-gray-600 dark:text-gray-300">
                            <span className="material-symbols-outlined text-green-500 text-sm mr-1">check_circle</span> Users
                          </div>
                          <div className="flex items-center text-xs font-medium text-gray-600 dark:text-gray-300">
                            <span className="material-symbols-outlined text-green-500 text-sm mr-1">check_circle</span> Conversations
                          </div>
                        </div>
                        <button className="px-4 py-2 bg-gray-900 hover:bg-black dark:bg-white dark:text-black dark:hover:bg-gray-200 text-white text-xs font-bold rounded-lg shadow-sm transition-all">Start Import</button>
                      </div>
                    </div>

                    {/* Zendesk Import */}
                    <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200/80 dark:border-gray-700 shadow-card p-6 relative overflow-hidden group hover:shadow-md transition-all duration-300 flex flex-col gap-4">
                      <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                        <span className="material-symbols-outlined text-8xl text-emerald-500 -mr-6 -mt-6 rotate-12">dataset</span>
                      </div>
                      <div className="flex items-start justify-between z-10">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md flex-shrink-0">
                            <span className="font-bold text-2xl tracking-tight">Z</span>
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-gray-900 dark:text-white">Import from Zendesk</h3>
                            <span className="inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                              Est. 20-40 min
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 z-10">Migrate complex tickets, macros, and Knowledge Base articles.</p>
                      <div className="flex items-center justify-between mt-2 z-10">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center text-xs font-medium text-gray-600 dark:text-gray-300">
                            <span className="material-symbols-outlined text-green-500 text-sm mr-1">check_circle</span> Tickets
                          </div>
                          <div className="flex items-center text-xs font-medium text-gray-600 dark:text-gray-300">
                            <span className="material-symbols-outlined text-green-500 text-sm mr-1">check_circle</span> Knowledge
                          </div>
                        </div>
                        <button className="px-4 py-2 bg-gray-900 hover:bg-black dark:bg-white dark:text-black dark:hover:bg-gray-200 text-white text-xs font-bold rounded-lg shadow-sm transition-all">Start Import</button>
                      </div>
                    </div>
                    
                    {/* Gorgias Import */}
                    <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200/80 dark:border-gray-700 shadow-card p-6 relative overflow-hidden group hover:shadow-md transition-all duration-300 flex flex-col gap-4">
                      <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                        <span className="material-symbols-outlined text-8xl text-indigo-500 -mr-6 -mt-6 rotate-12">headset_mic</span>
                      </div>
                      <div className="flex items-start justify-between z-10">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-indigo-500 flex items-center justify-center text-white shadow-md flex-shrink-0">
                            <span className="material-symbols-outlined text-2xl">headset_mic</span>
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-gray-900 dark:text-white">Import from Gorgias</h3>
                            <span className="inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                              Est. 15-30 min
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 z-10">Transfer e-commerce tickets, macros, and Shopify context.</p>
                      <div className="flex items-center justify-between mt-2 z-10">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center text-xs font-medium text-gray-600 dark:text-gray-300">
                            <span className="material-symbols-outlined text-green-500 text-sm mr-1">check_circle</span> Tickets
                          </div>
                          <div className="flex items-center text-xs font-medium text-gray-600 dark:text-gray-300">
                            <span className="material-symbols-outlined text-green-500 text-sm mr-1">check_circle</span> Macros
                          </div>
                        </div>
                        <button className="px-4 py-2 bg-gray-900 hover:bg-black dark:bg-white dark:text-black dark:hover:bg-gray-200 text-white text-xs font-bold rounded-lg shadow-sm transition-all">Start Import</button>
                      </div>
                    </div>

                    {/* Freshdesk Import */}
                    <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200/80 dark:border-gray-700 shadow-card p-6 relative overflow-hidden group hover:shadow-md transition-all duration-300 flex flex-col gap-4">
                      <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                        <span className="material-symbols-outlined text-8xl text-orange-500 -mr-6 -mt-6 rotate-12">support_agent</span>
                      </div>
                      <div className="flex items-start justify-between z-10">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center text-white shadow-md flex-shrink-0">
                            <span className="material-symbols-outlined text-2xl">support_agent</span>
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-gray-900 dark:text-white">Import from Freshdesk</h3>
                            <span className="inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                              Est. 15-30 min
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 z-10">Import tickets, contacts, and knowledge base articles.</p>
                      <div className="flex items-center justify-between mt-2 z-10">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center text-xs font-medium text-gray-600 dark:text-gray-300">
                            <span className="material-symbols-outlined text-green-500 text-sm mr-1">check_circle</span> Tickets
                          </div>
                          <div className="flex items-center text-xs font-medium text-gray-600 dark:text-gray-300">
                            <span className="material-symbols-outlined text-green-500 text-sm mr-1">check_circle</span> Contacts
                          </div>
                        </div>
                        <button className="px-4 py-2 bg-gray-900 hover:bg-black dark:bg-white dark:text-black dark:hover:bg-gray-200 text-white text-xs font-bold rounded-lg shadow-sm transition-all">Start Import</button>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Recent Activity */}
                <section>
                  <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200/80 dark:border-gray-700 shadow-card p-5 flex flex-col md:flex-row items-center gap-6">
                    <div className="flex-shrink-0 flex items-center gap-3 md:w-48">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-400">
                        <span className="material-symbols-outlined text-xl">history</span>
                      </div>
                      <h3 className="font-bold text-gray-900 dark:text-white text-sm uppercase tracking-wide">Recent Activity</h3>
                    </div>
                    <div className="flex-1 w-full md:w-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="flex gap-3 items-center p-2 rounded-lg bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center border border-gray-100 dark:border-gray-700 shadow-sm flex-shrink-0 text-blue-600">
                          <span className="font-bold text-xl tracking-tight">Z</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center">
                            <p className="text-xs font-bold text-gray-900 dark:text-white truncate">Zendesk import</p>
                            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">45%</span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1 mt-1.5 overflow-hidden">
                            <div className="bg-blue-600 h-1 rounded-full animate-pulse" style={{ width: '45%' }}></div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-3 items-center p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 border border-transparent hover:border-gray-100 dark:hover:border-gray-700 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center border border-gray-100 dark:border-gray-700 shadow-sm flex-shrink-0 text-green-600">
                          <span className="material-symbols-outlined text-base">shopping_bag</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">Shopify sync</p>
                          <p className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1 mt-0.5">
                            <span className="material-symbols-outlined text-[10px]">check_circle</span> Complete 2h ago
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3 items-center p-2 rounded-lg bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center border border-gray-100 dark:border-gray-700 shadow-sm flex-shrink-0 text-purple-700">
                          <span className="material-symbols-outlined text-base">tag</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">Slack</p>
                          <p className="text-[10px] text-red-600 dark:text-red-400 flex items-center gap-1 mt-0.5">
                            <span className="material-symbols-outlined text-[10px]">warning</span> Reconnect required
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3 items-center p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 border border-transparent hover:border-gray-100 dark:hover:border-gray-700 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center border border-gray-100 dark:border-gray-700 shadow-sm flex-shrink-0 text-red-500">
                          <span className="material-symbols-outlined text-base">mail</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">Gmail sync</p>
                          <p className="text-[10px] text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-0.5">
                            <span className="material-symbols-outlined text-[10px] animate-spin">sync</span> Syncing...
                          </p>
                        </div>
                      </div>
                    </div>
                    <button className="flex-shrink-0 text-xs font-bold text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white transition-colors px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm">View All Logs</button>
                  </div>
                </section>
              </>
            )}

            {/* Connected / Recommended Integrations */}
            {(activeCategory === 'All Apps' && !searchQuery) && (
              <section>
                <div className="flex items-center justify-between mb-4 px-1">
                  <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Connected & Recommended</h2>
                </div>
                <div className="flex flex-col gap-4">
                  {integrations.filter(app => topCriticalIds.includes(app.id)).map(renderIntegrationCard)}
                </div>
              </section>
            )}

            {/* Full Catalog */}
            <section>
              <div className="flex items-center justify-between mb-4 px-1">
                <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {activeCategory === 'All Apps' ? 'Full Catalog' : `${activeCategory} Apps`}
                </h2>
              </div>
              
              {filteredIntegrations.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 border-dashed">
                  <span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600 mb-2">search_off</span>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">No integrations found</p>
                  <p className="text-xs text-gray-500 mt-1">Try adjusting your search or category filter.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {filteredIntegrations.map(renderIntegrationCard)}
                </div>
              )}
            </section>

          </div>
        </div>
      </div>

      {/* ── Connector configuration modal ── */}
      {configModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Configure {configModal.name}</h2>
                <p className="mt-0.5 text-xs text-gray-500">Enter your credentials. They are stored encrypted in your workspace.</p>
              </div>
              <button onClick={() => setConfigModal(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Fields */}
            <div className="space-y-4 px-6 py-5">
              {configModal.fields.map((field) => (
                <label key={field.key} className="block">
                  <div className="mb-1 flex items-center gap-1">
                    <span className="text-sm font-semibold text-gray-700">{field.label}</span>
                    {field.required && <span className="text-red-500 text-xs">*</span>}
                  </div>
                  {field.hint && <p className="mb-1.5 text-[11px] text-gray-400">{field.hint}</p>}
                  <input
                    type={field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text'}
                    value={configModal.values[field.key] ?? ''}
                    onChange={(e) => setConfigModal((m) => m ? { ...m, values: { ...m.values, [field.key]: e.target.value } } : m)}
                    placeholder={field.placeholder ?? ''}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-500 focus:bg-white focus:ring-1 focus:ring-gray-400 transition-all"
                  />
                </label>
              ))}

              {/* Workflow node usage hint for messaging connectors */}
              {['slack', 'discord', 'telegram', 'teams', 'google_chat'].includes(configModal.system) && (
                <div className="flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-100 px-3 py-3">
                  <span className="material-symbols-outlined text-base text-blue-500 mt-0.5">info</span>
                  <p className="text-xs text-blue-700">
                    These credentials are used automatically by <strong>{configModal.name}</strong> workflow nodes.
                    Go to <strong>Workflows → Add Node → Human review</strong> to use them in an automation.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => setConfigModal(null)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveConfigModal}
                disabled={saveStatus === 'saving'}
                className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold transition-colors ${
                  saveStatus === 'saved' ? 'bg-green-500 text-white' :
                  saveStatus === 'error' ? 'bg-red-500 text-white' :
                  saveStatus === 'saving' ? 'bg-gray-400 text-white cursor-not-allowed' :
                  'bg-black text-white hover:bg-gray-800'
                }`}
              >
                {saveStatus === 'saving' ? (
                  <><span className="material-symbols-outlined animate-spin text-base">sync</span> Saving…</>
                ) : saveStatus === 'saved' ? (
                  <><span className="material-symbols-outlined text-base">check_circle</span> Connected!</>
                ) : saveStatus === 'error' ? (
                  <><span className="material-symbols-outlined text-base">error</span> Error — retry</>
                ) : (
                  'Save & Connect'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
