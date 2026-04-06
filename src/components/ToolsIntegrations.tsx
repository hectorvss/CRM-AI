import React, { useState } from 'react';

type IntegrationCategory = 'All Apps' | 'Support' | 'Commerce' | 'Communication' | 'CRM' | 'Knowledge' | 'Productivity' | 'Automation';

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
  { id: 'customapp', name: 'Custom App / Webhooks', category: 'Automation', description: 'Connect private APIs and internal systems.', powers: 'Custom Actions', status: 'Connected', icon: 'webhook', color: 'bg-gray-800' }
];

const topCriticalIds = [
  'zendesk', 'intercom', 'gorgias', 'shopify', 'stripe', 'recharge', 
  'slack', 'gmail', 'notion', 'hubspot', 'zapier', 'customapp'
];

export default function ToolsIntegrations() {
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory>('All Apps');
  const [searchQuery, setSearchQuery] = useState('');

  const categories: IntegrationCategory[] = ['All Apps', 'Support', 'Commerce', 'Communication', 'CRM', 'Knowledge', 'Productivity', 'Automation'];

  const filteredIntegrations = allIntegrations.filter(app => {
    const matchesCategory = activeCategory === 'All Apps' || app.category === activeCategory;
    const matchesSearch = app.name.toLowerCase().includes(searchQuery.toLowerCase()) || app.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const connectedCount = allIntegrations.filter(app => app.status === 'Connected' || app.status === 'Syncing').length;
  const errorCount = allIntegrations.filter(app => app.status === 'Error' || app.status === 'Reconnect Required').length;

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
        
        <button className={`text-sm font-semibold px-5 py-2 rounded-xl transition-colors shadow-card min-w-[100px] border ${
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
    <div key={app.id} className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200/80 dark:border-gray-700 shadow-card p-5 flex items-center gap-4 group hover:shadow-md transition-all cursor-pointer">
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
                  {allIntegrations.filter(app => topCriticalIds.includes(app.id)).map(renderIntegrationCard)}
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
    </div>
  );
}
