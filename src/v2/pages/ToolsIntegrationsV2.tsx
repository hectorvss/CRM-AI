// ToolsIntegrationsV2 — migrado por agent-tools-integrations-01.
// ─────────────────────────────────────────────────────────────────────────────
// What works (this iteration):
//   • Lista de integraciones desde connectorsApi.list() (real backend)
//   • Sidebar (236px) — "Integraciones" header + filtros por estado y categoría
//   • Search + filtrado combinado (status + category + texto)
//   • Counters: Conectados / Con error / Total
//   • Configurar credenciales → modal con CONNECTOR_CREDENTIAL_SCHEMAS por sistema
//     • Guarda con connectorsApi.update(id, { auth_config, status: 'active' })
//   • Probar conexión → connectorsApi.test(id) (toast con resultado)
//   • Desconectar → connectorsApi.delete(id) (con confirmación inline)
//   • Catálogo estático de 47 integraciones (`allIntegrations`) — para los apps
//     que no estén aún en backend, "Connect" abre el modal y crea una entry vía
//     update (si el backend la pre-creó) o muestra mensaje pendiente.
//
// Pending for later iterations (still in src/components/ToolsIntegrations.tsx):
//   • Flujos OAuth dedicados (Shopify, Stripe, Gmail, Twilio, WhatsApp, Outlook,
//     PayPal, Messenger, Instagram, Telegram, Postmark, UPS, DHL, Salesforce,
//     HubSpot, Slack, Zendesk, Intercom, Notion, WooCommerce, Calendly, Teams,
//     Linear, Jira, Confluence, GitHub, Front, Aircall, GCalendar, GDrive,
//     Zoom, Asana, Pipedrive, Mailchimp, Klaviyo, Segment, QuickBooks,
//     DocuSign, Sentry, Plaid, GitLab, Discord) — los 41 modales dedicados
//     en src/components/integrations/ usan endpoints REST específicos
//     (/api/integrations/{system}/status) que no están en connectorsApi.
//   • Migration Center (Intercom / Zendesk / Gorgias import cards)
//   • Top Critical apps section (sólo se muestran si están conectados)
//   • IntegrationLogo component — V2 usa la inicial + bg color como placeholder
//   • Custom App button (creación manual de connector)
//   • Webhook callback URL detection (?connected=shopify&shop=...) post-OAuth
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect } from 'react';
import { connectorsApi } from '../../api/client';
import { useApi, useMutation } from '../../api/hooks';

type IntegrationCategory = 'All Apps' | 'Support' | 'Commerce' | 'Communication' | 'CRM' | 'Knowledge' | 'Productivity' | 'Automation' | 'AI';
type StatusFilter = 'all' | 'connected' | 'error' | 'not_connected';

interface CredentialField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder?: string;
  hint?: string;
  required?: boolean;
}

// Same schemas as original ToolsIntegrations.tsx (subset of high-frequency systems).
const CONNECTOR_CREDENTIAL_SCHEMAS: Record<string, CredentialField[]> = {
  slack: [
    { key: 'bot_token', label: 'Bot Token', type: 'password', placeholder: 'xoxb-...', hint: 'From your Slack App → OAuth & Permissions → Bot User OAuth Token', required: true },
    { key: 'channel', label: 'Default channel (optional)', type: 'text', placeholder: '#support-alerts' },
  ],
  discord: [
    { key: 'webhook_url', label: 'Webhook URL', type: 'url', placeholder: 'https://discord.com/api/webhooks/...', required: true },
  ],
  telegram: [
    { key: 'bot_token', label: 'Bot Token', type: 'password', placeholder: '123456:ABC-...', hint: 'From @BotFather on Telegram', required: true },
    { key: 'default_chat_id', label: 'Default chat ID (optional)', type: 'text', placeholder: '-100xxxxxxxxxx' },
  ],
  teams: [
    { key: 'webhook_url', label: 'Incoming Webhook URL', type: 'url', placeholder: 'https://outlook.office.com/webhook/...', required: true },
  ],
  shopify: [
    { key: 'shop_domain', label: 'Shop domain', type: 'text', placeholder: 'your-store.myshopify.com', required: true },
    { key: 'admin_api_token', label: 'Admin API access token', type: 'password', placeholder: 'shpat_...', required: true },
    { key: 'webhook_secret', label: 'Webhook secret (optional)', type: 'password' },
  ],
  stripe: [
    { key: 'secret_key', label: 'Secret key', type: 'password', placeholder: 'sk_live_...', required: true },
    { key: 'webhook_secret', label: 'Webhook secret', type: 'password', placeholder: 'whsec_...' },
  ],
  zendesk: [
    { key: 'subdomain', label: 'Subdomain', type: 'text', placeholder: 'your-company', required: true },
    { key: 'email', label: 'Agent email', type: 'text', placeholder: 'agent@yourcompany.com', required: true },
    { key: 'api_token', label: 'API token', type: 'password', required: true },
  ],
  intercom: [
    { key: 'access_token', label: 'Access token', type: 'password', placeholder: 'dG9rO...', required: true },
  ],
  hubspot: [
    { key: 'api_key', label: 'Private App Token', type: 'password', placeholder: 'pat-na1-...', required: true },
  ],
  anthropic: [
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'sk-ant-...', hint: 'From console.anthropic.com → API Keys.', required: true },
  ],
  openai: [
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'sk-...', hint: 'From platform.openai.com → API keys.', required: true },
  ],
  ollama: [
    { key: 'base_url', label: 'Ollama server URL', type: 'url', placeholder: 'http://localhost:11434', required: true },
  ],
  gemini: [
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'AIzaSy...', required: true },
  ],
};

const GENERIC_CREDENTIAL_FIELDS: CredentialField[] = [
  { key: 'api_key', label: 'API Key / Token', type: 'password', placeholder: 'Your API key or access token', required: true },
  { key: 'base_url', label: 'Base URL (optional)', type: 'url', placeholder: 'https://api.example.com' },
];

// Static catalog (same content as original component, condensed).
interface CatalogApp {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  powers: string;
  initial: string;
  bg: string;
}

const CATALOG: CatalogApp[] = [
  { id: 'zendesk',     name: 'Zendesk',                   category: 'Support',       description: 'Sync tickets, macros, and customer data.',        powers: 'Ticketing',       initial: 'Z', bg: 'bg-emerald-600' },
  { id: 'intercom',    name: 'Intercom',                  category: 'Support',       description: 'Manage conversations and user attributes.',       powers: 'Messaging',       initial: 'I', bg: 'bg-blue-600' },
  { id: 'front',       name: 'Front',                     category: 'Support',       description: 'Shared inbox · email · social · SMS unified.',    powers: 'Inbox',           initial: 'F', bg: 'bg-violet-600' },
  { id: 'shopify',     name: 'Shopify',                   category: 'Commerce',      description: 'Sync orders, customers, and products.',           powers: 'Order Agent',     initial: 'S', bg: 'bg-green-600' },
  { id: 'woocommerce', name: 'WooCommerce',               category: 'Commerce',      description: 'Open-source e-commerce plugin.',                  powers: 'Order Agent',     initial: 'W', bg: 'bg-purple-600' },
  { id: 'stripe',      name: 'Stripe',                    category: 'Commerce',      description: 'Manage payments, refunds, and subscriptions.',    powers: 'Billing Agent',   initial: 'S', bg: 'bg-indigo-600' },
  { id: 'paypal',      name: 'PayPal',                    category: 'Commerce',      description: 'Online payments system.',                         powers: 'Billing Agent',   initial: 'P', bg: 'bg-blue-700' },
  { id: 'slack',       name: 'Slack',                     category: 'Communication', description: 'Team communication and alerts.',                  powers: 'Notifications',   initial: '#', bg: 'bg-purple-700' },
  { id: 'teams',       name: 'Microsoft Teams',           category: 'Communication', description: 'Workspace for real-time collaboration.',          powers: 'Collaboration',   initial: 'T', bg: 'bg-indigo-700' },
  { id: 'whatsapp',    name: 'WhatsApp Business',         category: 'Communication', description: 'Direct customer messaging.',                      powers: 'Messaging',       initial: 'W', bg: 'bg-green-500' },
  { id: 'messenger',   name: 'Facebook Messenger',        category: 'Communication', description: 'Page messaging via Meta Graph.',                  powers: 'Inbox',           initial: 'M', bg: 'bg-blue-500' },
  { id: 'instagram',   name: 'Instagram',                 category: 'Communication', description: 'DMs, comments, mentions, story replies.',        powers: 'Inbox',           initial: 'I', bg: 'bg-pink-500' },
  { id: 'telegram',    name: 'Telegram',                  category: 'Communication', description: 'Bot inbox, slash commands, inline keyboards.',   powers: 'Inbox',           initial: 'T', bg: 'bg-sky-500' },
  { id: 'gmail',       name: 'Gmail / Google Workspace',  category: 'Communication', description: 'Email integration and sync.',                     powers: 'Email Agent',     initial: 'G', bg: 'bg-red-500' },
  { id: 'outlook',     name: 'Outlook / Microsoft 365',   category: 'Communication', description: 'Enterprise email integration.',                   powers: 'Email Agent',     initial: 'O', bg: 'bg-blue-600' },
  { id: 'twilio',      name: 'Twilio',                    category: 'Communication', description: 'SMS and voice communications.',                   powers: 'SMS Agent',       initial: 'T', bg: 'bg-red-600' },
  { id: 'aircall',     name: 'Aircall',                   category: 'Communication', description: 'Voice channel · call recordings + transcripts.',  powers: 'Voice Agent',     initial: 'A', bg: 'bg-emerald-600' },
  { id: 'postmark',    name: 'Postmark',                  category: 'Communication', description: 'Transactional email with high deliverability.',   powers: 'Outbound Email',  initial: 'P', bg: 'bg-amber-500' },
  { id: 'discord',     name: 'Discord',                   category: 'Communication', description: 'Community channels · bot · slash commands.',      powers: 'Inbox',           initial: 'D', bg: 'bg-indigo-500' },
  { id: 'mailchimp',   name: 'Mailchimp',                 category: 'Communication', description: 'Email marketing · audiences · campaigns.',       powers: 'Marketing',       initial: 'M', bg: 'bg-yellow-400' },
  { id: 'klaviyo',     name: 'Klaviyo',                   category: 'Communication', description: 'Ecom email + SMS · profiles · flows.',           powers: 'Marketing',       initial: 'K', bg: 'bg-black' },
  { id: 'zoom',        name: 'Zoom',                      category: 'Communication', description: 'Meetings · recordings + AI Companion.',          powers: 'Voice/Video',     initial: 'Z', bg: 'bg-sky-600' },
  { id: 'ups',         name: 'UPS',                       category: 'Commerce',      description: 'Tracking, rates, address validation.',           powers: 'Shipping',        initial: 'U', bg: 'bg-amber-700' },
  { id: 'dhl',         name: 'DHL',                       category: 'Commerce',      description: 'Unified tracking + DHL Express rates.',          powers: 'Shipping',        initial: 'D', bg: 'bg-yellow-500' },
  { id: 'quickbooks',  name: 'QuickBooks',                category: 'Commerce',      description: 'Accounting · invoices · refunds reconciliation.', powers: 'Accounting',      initial: 'Q', bg: 'bg-emerald-700' },
  { id: 'plaid',       name: 'Plaid',                     category: 'Commerce',      description: 'Bank verification · KYC · ACH/IBAN.',            powers: 'Finance',         initial: 'P', bg: 'bg-slate-900' },
  { id: 'hubspot',     name: 'HubSpot',                   category: 'CRM',           description: 'Inbound marketing, sales, and service.',         powers: 'CRM Context',     initial: 'H', bg: 'bg-orange-500' },
  { id: 'salesforce',  name: 'Salesforce',                category: 'CRM',           description: 'Customer relationship management.',              powers: 'CRM Context',     initial: 'S', bg: 'bg-blue-500' },
  { id: 'pipedrive',   name: 'Pipedrive',                 category: 'CRM',           description: 'Sales CRM and pipeline management.',             powers: 'CRM Context',     initial: 'P', bg: 'bg-green-600' },
  { id: 'docusign',    name: 'DocuSign',                  category: 'CRM',           description: 'Contracts · e-signature · envelopes.',          powers: 'Sales',           initial: 'D', bg: 'bg-yellow-500' },
  { id: 'notion',      name: 'Notion',                    category: 'Knowledge',     description: 'Connected workspace for your docs.',             powers: 'Knowledge Sync',  initial: 'N', bg: 'bg-gray-900' },
  { id: 'gdrive',      name: 'Google Drive',              category: 'Knowledge',     description: 'Cloud storage and file backup.',                 powers: 'Knowledge Sync',  initial: 'G', bg: 'bg-blue-500' },
  { id: 'confluence',  name: 'Confluence',                category: 'Knowledge',     description: 'Team workspace and documentation.',              powers: 'Knowledge Sync',  initial: 'C', bg: 'bg-blue-600' },
  { id: 'jira',        name: 'Jira',                      category: 'Productivity',  description: 'Issue and project tracking.',                    powers: 'Ticketing',       initial: 'J', bg: 'bg-blue-600' },
  { id: 'linear',      name: 'Linear',                    category: 'Productivity',  description: 'Engineering issues + escalation.',               powers: 'Ticketing',       initial: 'L', bg: 'bg-indigo-600' },
  { id: 'github',      name: 'GitHub',                    category: 'Productivity',  description: 'Issues · PRs · escalation técnico.',            powers: 'Engineering',     initial: 'G', bg: 'bg-gray-900' },
  { id: 'gitlab',      name: 'GitLab',                    category: 'Productivity',  description: 'Issues · MRs · pipelines · self-hosted.',       powers: 'Engineering',     initial: 'G', bg: 'bg-orange-600' },
  { id: 'sentry',      name: 'Sentry',                    category: 'Productivity',  description: 'Errors · issue grouping · alerts.',             powers: 'Engineering',     initial: 'S', bg: 'bg-purple-700' },
  { id: 'asana',       name: 'Asana',                     category: 'Productivity',  description: 'Project management for ops, marketing, legal.', powers: 'Tasks',           initial: 'A', bg: 'bg-rose-500' },
  { id: 'calendly',    name: 'Calendly',                  category: 'Productivity',  description: 'Book demos and human handoffs.',                 powers: 'Scheduling',      initial: 'C', bg: 'bg-blue-600' },
  { id: 'gcalendar',   name: 'Google Calendar',           category: 'Productivity',  description: 'Internal availability · scheduling.',           powers: 'Scheduling',      initial: 'G', bg: 'bg-blue-500' },
  { id: 'segment',     name: 'Segment',                   category: 'Automation',    description: 'CDP · identity resolution · event pipeline.',  powers: 'Data Layer',      initial: 'S', bg: 'bg-emerald-500' },
  { id: 'anthropic',   name: 'Anthropic Claude',          category: 'AI',            description: 'Claude models (3.5 Sonnet, Opus 4) for AI nodes.', powers: 'ai.anthropic',  initial: 'A', bg: 'bg-orange-800' },
  { id: 'openai',      name: 'OpenAI',                    category: 'AI',            description: 'GPT-4o, embeddings, DALL·E for AI nodes.',       powers: 'ai.openai',       initial: 'O', bg: 'bg-gray-900' },
  { id: 'gemini',      name: 'Google Gemini',             category: 'AI',            description: 'Gemini Pro/Flash models for AI nodes.',          powers: 'ai.gemini',       initial: 'G', bg: 'bg-blue-600' },
  { id: 'ollama',      name: 'Ollama (local AI)',         category: 'AI',            description: 'Self-hosted Ollama server for open-source models.', powers: 'ai.ollama',     initial: 'O', bg: 'bg-gray-700' },
];

const CATEGORIES: IntegrationCategory[] = ['All Apps', 'Support', 'Commerce', 'Communication', 'CRM', 'Knowledge', 'Productivity', 'Automation', 'AI'];

// Map raw connector → status pill label
type Status = 'Connected' | 'Error' | 'Not Connected';
function connectorStatus(c: any): Status {
  if (!c) return 'Not Connected';
  if (c.status === 'active') return 'Connected';
  if (c.status === 'error') return 'Error';
  return 'Not Connected';
}

// ── Sidebar (236px) ─────────────────────────────────────────────────────────
function IntegrationsSidebar({
  category,
  status,
  onCategory,
  onStatus,
  counts,
}: {
  category: IntegrationCategory;
  status: StatusFilter;
  onCategory: (c: IntegrationCategory) => void;
  onStatus: (s: StatusFilter) => void;
  counts: { connected: number; errors: number; notConnected: number };
}) {
  const [openStatus, setOpenStatus] = useState(true);
  const [openCategories, setOpenCategories] = useState(true);

  const Chev = ({ open }: { open: boolean }) => (
    <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 fill-[#646462] transition-transform ${open ? 'rotate-90' : ''}`}>
      <path d="M6 4l4 4-4 4z"/>
    </svg>
  );

  const itemCls = (active: boolean) =>
    `relative flex items-center gap-2 h-8 pl-3 pr-3 py-1 rounded-lg cursor-pointer text-[13px] w-full text-left transition-colors ${
      active
        ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]'
        : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
    }`;

  return (
    <div className="flex flex-col h-full w-[236px] bg-[#f8f8f7] border-r border-[#e9eae6] flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Integraciones</span>
      </div>

      <div className="flex-1 overflow-y-auto pl-3 pr-3 pb-4 flex flex-col gap-0.5">
        {/* Todos */}
        <button
          onClick={() => { onCategory('All Apps'); onStatus('all'); }}
          className={itemCls(category === 'All Apps' && status === 'all')}
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z"/></svg>
          <span className="flex-1">Todas</span>
        </button>

        {/* Estado */}
        <div className="mt-3">
          <button onClick={() => setOpenStatus(o => !o)} className="w-full flex items-center justify-between h-8 px-3 cursor-pointer hover:bg-[#ededea]/40 rounded-[6px]">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Estado</span>
            <Chev open={openStatus} />
          </button>
          {openStatus && (
            <div className="flex flex-col gap-0.5 mt-0.5">
              <button onClick={() => onStatus('connected')} className={itemCls(status === 'connected')}>
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#158613]"><circle cx="8" cy="8" r="5"/></svg>
                <span className="flex-1">Conectados</span>
                <span className="text-[12px] text-[#646462]">{counts.connected}</span>
              </button>
              <button onClick={() => onStatus('error')} className={itemCls(status === 'error')}>
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#9a3412]"><path d="M8 1l7 13H1z"/></svg>
                <span className="flex-1">Con error</span>
                <span className="text-[12px] text-[#646462]">{counts.errors}</span>
              </button>
              <button onClick={() => onStatus('not_connected')} className={itemCls(status === 'not_connected')}>
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><circle cx="8" cy="8" r="5" fillOpacity="0.5"/></svg>
                <span className="flex-1">No conectados</span>
                <span className="text-[12px] text-[#646462]">{counts.notConnected}</span>
              </button>
            </div>
          )}
        </div>

        {/* Categorías */}
        <div className="mt-3">
          <button onClick={() => setOpenCategories(o => !o)} className="w-full flex items-center justify-between h-8 px-3 cursor-pointer hover:bg-[#ededea]/40 rounded-[6px]">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Categorías</span>
            <Chev open={openCategories} />
          </button>
          {openCategories && (
            <div className="flex flex-col gap-0.5 mt-0.5">
              {CATEGORIES.filter(c => c !== 'All Apps').map(cat => (
                <button key={cat} onClick={() => onCategory(cat)} className={itemCls(category === cat)}>
                  <span className="w-4 h-4 flex items-center justify-center">
                    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#1a1a1a]"><circle cx="8" cy="8" r="3"/></svg>
                  </span>
                  <span className="flex-1">{cat}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Integration card ────────────────────────────────────────────────────────
function IntegrationCard({
  app,
  status,
  onConfigure,
  onTest,
  onDisconnect,
  testing,
}: {
  app: CatalogApp;
  status: Status;
  onConfigure: () => void;
  onTest: () => void;
  onDisconnect: () => void;
  testing: boolean;
}) {
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const StatusPill = () => {
    if (status === 'Connected') {
      return (
        <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[#158613]/10 text-[#158613] text-[11px] font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-[#158613]" /> Conectado
        </span>
      );
    }
    if (status === 'Error') {
      return (
        <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[#9a3412]/10 text-[#9a3412] text-[11px] font-semibold">
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#9a3412]"><path d="M8 1l7 13H1z"/></svg> Error
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[#e9eae6] text-[#646462] text-[11px] font-semibold">
        No conectado
      </span>
    );
  };

  return (
    <div className="bg-white rounded-[12px] border border-[#e9eae6] p-5 flex items-start gap-4 hover:border-[#c8c9c4] transition-colors">
      <div className={`w-12 h-12 rounded-[10px] flex items-center justify-center flex-shrink-0 text-white font-bold text-[18px] ${app.bg}`}>
        {app.initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-[15px] font-semibold text-[#1a1a1a]">{app.name}</h3>
          <span className="text-[11px] font-semibold text-[#646462] bg-[#f3f3f1] px-2 py-0.5 rounded-md border border-[#e9eae6]">
            {app.powers}
          </span>
          <StatusPill />
        </div>
        <p className="text-[13px] text-[#646462] mt-1 leading-[18px]">{app.description}</p>
        <div className="flex items-center gap-2 mt-3">
          {status === 'Connected' && (
            <>
              <button
                onClick={onConfigure}
                className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] border border-[#e9eae6] hover:bg-[#ededea]"
              >
                Configurar
              </button>
              <button
                onClick={onTest}
                disabled={testing}
                className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] border border-[#e9eae6] hover:bg-[#ededea] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {testing ? 'Probando…' : 'Probar'}
              </button>
              {!confirmDisconnect ? (
                <button
                  onClick={() => setConfirmDisconnect(true)}
                  className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#9a3412] hover:bg-[#9a3412]/10"
                >
                  Desconectar
                </button>
              ) : (
                <span className="flex items-center gap-1.5 ml-1">
                  <span className="text-[12px] text-[#646462]">¿Confirmar?</span>
                  <button
                    onClick={() => { setConfirmDisconnect(false); onDisconnect(); }}
                    className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#9a3412] hover:bg-[#7a2812]"
                  >
                    Sí, desconectar
                  </button>
                  <button
                    onClick={() => setConfirmDisconnect(false)}
                    className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] border border-[#e9eae6] hover:bg-[#ededea]"
                  >
                    Cancelar
                  </button>
                </span>
              )}
            </>
          )}
          {status === 'Error' && (
            <button
              onClick={onConfigure}
              className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#9a3412] hover:bg-[#7a2812]"
            >
              Reconectar
            </button>
          )}
          {status === 'Not Connected' && (
            <button
              onClick={onConfigure}
              className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black"
            >
              Conectar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Configure modal ─────────────────────────────────────────────────────────
function ConfigureModal({
  open,
  app,
  initialValues,
  saveStatus,
  onChange,
  onSave,
  onClose,
  notSupported,
}: {
  open: boolean;
  app: CatalogApp | null;
  initialValues: Record<string, string>;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onChange: (k: string, v: string) => void;
  onSave: () => void;
  onClose: () => void;
  notSupported: boolean;
}) {
  if (!open || !app) return null;
  const fields = CONNECTOR_CREDENTIAL_SCHEMAS[app.id] ?? GENERIC_CREDENTIAL_FIELDS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[#e9eae6] bg-white shadow-[0px_8px_32px_rgba(20,20,20,0.2)]">
        <div className="flex items-center justify-between border-b border-[#e9eae6] px-6 py-4">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.2px] text-[#1a1a1a]">Configurar {app.name}</h2>
            <p className="mt-0.5 text-[12px] text-[#646462]">Las credenciales se guardan cifradas en tu workspace.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f3f3f1]" aria-label="Cerrar">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#1a1a1a]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
          </button>
        </div>

        {notSupported ? (
          <div className="px-6 py-6">
            <div className="flex items-start gap-3 rounded-xl bg-[#f8f8f7] border border-[#e9eae6] px-4 py-3">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462] mt-0.5 flex-shrink-0"><circle cx="8" cy="8" r="7" fillOpacity="0.2"/><path d="M7 4h2v5H7zM7 11h2v2H7z"/></svg>
              <p className="text-[13px] text-[#1a1a1a] leading-[18px]">
                <strong>{app.name}</strong> aún no está disponible en este workspace. El backend no tiene una entrada
                pre-creada para este conector. Pídele a un administrador que aprovisione el conector
                o usa la consola original (sin <code className="bg-white border border-[#e9eae6] rounded px-1 text-[11px]">?v2=1</code>) para configurarlo vía OAuth dedicado.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-6 py-5">
            {fields.map(field => (
              <label key={field.key} className="block">
                <div className="mb-1 flex items-center gap-1">
                  <span className="text-[13px] font-semibold text-[#1a1a1a]">{field.label}</span>
                  {field.required && <span className="text-[#9a3412] text-[11px]">*</span>}
                </div>
                {field.hint && <p className="mb-1.5 text-[11px] text-[#646462]">{field.hint}</p>}
                <input
                  type={field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text'}
                  value={initialValues[field.key] ?? ''}
                  onChange={e => onChange(field.key, e.target.value)}
                  placeholder={field.placeholder ?? ''}
                  className="w-full rounded-lg border border-[#e9eae6] bg-[#f8f8f7] px-3 py-2 text-[13px] text-[#1a1a1a] outline-none placeholder:text-[#646462] focus:border-[#1a1a1a] focus:bg-white transition-colors"
                />
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-[#e9eae6] px-6 py-4">
          <button
            onClick={onClose}
            className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] border border-[#e9eae6] hover:bg-[#ededea]"
          >
            Cancelar
          </button>
          {!notSupported && (
            <button
              onClick={onSave}
              disabled={saveStatus === 'saving'}
              className={`px-4 h-8 rounded-full text-[13px] font-semibold transition-colors ${
                saveStatus === 'saved' ? 'bg-[#158613] text-white' :
                saveStatus === 'error' ? 'bg-[#9a3412] text-white' :
                saveStatus === 'saving' ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed' :
                'bg-[#1a1a1a] text-white hover:bg-black'
              }`}
            >
              {saveStatus === 'saving' ? 'Guardando…' :
               saveStatus === 'saved' ? '¡Conectado!' :
               saveStatus === 'error' ? 'Error — reintentar' :
               'Guardar y conectar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Toast (simple) ──────────────────────────────────────────────────────────
function Toast({ message, kind, onClose }: { message: string; kind: 'ok' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm">
      <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 shadow-[0px_4px_16px_rgba(20,20,20,0.15)] ${
        kind === 'ok'
          ? 'bg-white border-[#158613]/40 text-[#1a1a1a]'
          : 'bg-white border-[#9a3412]/40 text-[#1a1a1a]'
      }`}>
        <span className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${kind === 'ok' ? 'bg-[#158613]' : 'bg-[#9a3412]'}`} />
        <p className="text-[13px] leading-[18px] flex-1">{message}</p>
        <button onClick={onClose} className="text-[#646462] hover:text-[#1a1a1a]" aria-label="Cerrar">
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
        </button>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function ToolsIntegrationsV2() {
  const [category, setCategory] = useState<IntegrationCategory>('All Apps');
  const [status, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const [configOpen, setConfigOpen] = useState(false);
  const [configApp, setConfigApp] = useState<CatalogApp | null>(null);
  const [configConnectorId, setConfigConnectorId] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [testingId, setTestingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; kind: 'ok' | 'error' } | null>(null);

  const { data: connectors, loading, error, refetch } = useApi<any[]>(connectorsApi.list, [], []);
  const updateMutation = useMutation((p: { id: string; body: Record<string, any> }) => connectorsApi.update(p.id, p.body));
  const deleteMutation = useMutation((id: string) => connectorsApi.delete(id));
  const testMutation = useMutation((id: string) => connectorsApi.test(id));

  // Index real connectors by lowercased system id
  const connectorsBySystem = useMemo(() => {
    const map = new Map<string, any>();
    (connectors ?? []).forEach(c => {
      if (c?.system) map.set(String(c.system).toLowerCase(), c);
    });
    return map;
  }, [connectors]);

  // Build the displayed list: catalog ∪ any backend connectors not in catalog
  const displayed = useMemo(() => {
    const fromCatalog = CATALOG.map(app => ({ app, connector: connectorsBySystem.get(app.id) ?? null }));
    const catalogIds = new Set(CATALOG.map(a => a.id));
    const extras = (connectors ?? [])
      .filter(c => c?.system && !catalogIds.has(String(c.system).toLowerCase()))
      .map(c => ({
        app: {
          id: String(c.system).toLowerCase(),
          name: c.system,
          category: (c.category || 'Automation') as IntegrationCategory,
          description: `Conector ${c.system}`,
          powers: 'Custom',
          initial: String(c.system).charAt(0).toUpperCase(),
          bg: 'bg-indigo-600',
        } as CatalogApp,
        connector: c,
      }));
    return [...fromCatalog, ...extras];
  }, [connectors, connectorsBySystem]);

  const counts = useMemo(() => {
    let connected = 0;
    let errors = 0;
    let notConnected = 0;
    for (const { connector } of displayed) {
      const s = connectorStatus(connector);
      if (s === 'Connected') connected++;
      else if (s === 'Error') errors++;
      else notConnected++;
    }
    return { connected, errors, notConnected };
  }, [displayed]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return displayed.filter(({ app, connector }) => {
      if (category !== 'All Apps' && app.category !== category) return false;
      if (status !== 'all') {
        const s = connectorStatus(connector);
        if (status === 'connected' && s !== 'Connected') return false;
        if (status === 'error' && s !== 'Error') return false;
        if (status === 'not_connected' && s !== 'Not Connected') return false;
      }
      if (q && !(app.name.toLowerCase().includes(q) || app.description.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [displayed, category, status, search]);

  function openConfigure(app: CatalogApp) {
    const connector = connectorsBySystem.get(app.id);
    setConfigApp(app);
    setConfigConnectorId(connector?.id ?? null);
    const fields = CONNECTOR_CREDENTIAL_SCHEMAS[app.id] ?? GENERIC_CREDENTIAL_FIELDS;
    const existing: Record<string, string> = {};
    const cfg = connector?.authConfig ?? connector?.auth_config;
    if (cfg && typeof cfg === 'object') {
      for (const f of fields) {
        if (cfg[f.key] !== undefined) existing[f.key] = String(cfg[f.key]);
      }
    }
    setConfigValues(existing);
    setSaveStatus('idle');
    setConfigOpen(true);
  }

  async function saveConfig() {
    if (!configConnectorId) return;
    setSaveStatus('saving');
    const result = await updateMutation.mutate({
      id: configConnectorId,
      body: { auth_config: configValues, status: 'active' },
    });
    if (result === null) {
      setSaveStatus('error');
      return;
    }
    setSaveStatus('saved');
    refetch();
    setTimeout(() => {
      setConfigOpen(false);
      setSaveStatus('idle');
    }, 1100);
  }

  async function testConnector(app: CatalogApp) {
    const connector = connectorsBySystem.get(app.id);
    if (!connector?.id) return;
    setTestingId(connector.id);
    const result = await testMutation.mutate(connector.id);
    setTestingId(null);
    if (result === null) {
      setToast({ message: `${app.name}: la prueba falló — revisa credenciales`, kind: 'error' });
    } else {
      const ok = result?.ok ?? result?.success ?? true;
      setToast({
        message: ok
          ? `${app.name}: conexión correcta`
          : `${app.name}: la prueba falló — ${result?.message ?? 'sin detalles'}`,
        kind: ok ? 'ok' : 'error',
      });
    }
    refetch();
  }

  async function disconnect(app: CatalogApp) {
    const connector = connectorsBySystem.get(app.id);
    if (!connector?.id) return;
    const result = await deleteMutation.mutate(connector.id);
    if (result === null) {
      setToast({ message: `Error al desconectar ${app.name}`, kind: 'error' });
    } else {
      setToast({ message: `${app.name} desconectado`, kind: 'ok' });
    }
    refetch();
  }

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden">
      <IntegrationsSidebar
        category={category}
        status={status}
        onCategory={setCategory}
        onStatus={setStatusFilter}
        counts={counts}
      />

      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 h-16 border-b border-[#e9eae6] flex-shrink-0">
          <div>
            <h1 className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">
              {category === 'All Apps' ? 'Todas las integraciones' : category}
              {status !== 'all' && (
                <span className="text-[14px] font-normal text-[#646462] ml-2">
                  · {status === 'connected' ? 'Conectados' : status === 'error' ? 'Con error' : 'No conectados'}
                </span>
              )}
            </h1>
            <p className="text-[12px] text-[#646462] mt-0.5">
              {counts.connected} conectados · {counts.errors} con error · {displayed.length} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462] absolute left-3 top-1/2 -translate-y-1/2" strokeWidth="1.5">
                <circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/>
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar app…"
                className="w-64 h-8 pl-8 pr-3 rounded-full border border-[#e9eae6] bg-[#f8f8f7] text-[13px] text-[#1a1a1a] placeholder:text-[#646462] focus:outline-none focus:border-[#1a1a1a] focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="text-center text-[13px] text-[#646462] py-12">Cargando integraciones…</div>
          )}
          {!loading && error && (
            <div className="bg-[#9a3412]/10 border border-[#9a3412]/30 rounded-xl px-4 py-3 text-[13px] text-[#1a1a1a]">
              Error cargando integraciones: {error}.{' '}
              <button onClick={refetch} className="underline font-semibold">Reintentar</button>
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-12">
              <p className="text-[14px] text-[#1a1a1a] font-semibold">No se encontraron integraciones</p>
              <p className="text-[12px] text-[#646462] mt-1">Prueba a quitar filtros o cambiar la búsqueda.</p>
            </div>
          )}
          {!loading && !error && filtered.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-w-[1200px]">
              {filtered.map(({ app, connector }) => {
                const s = connectorStatus(connector);
                return (
                  <IntegrationCard
                    key={app.id}
                    app={app}
                    status={s}
                    onConfigure={() => openConfigure(app)}
                    onTest={() => testConnector(app)}
                    onDisconnect={() => disconnect(app)}
                    testing={testingId === connector?.id}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ConfigureModal
        open={configOpen}
        app={configApp}
        initialValues={configValues}
        saveStatus={saveStatus}
        onChange={(k, v) => setConfigValues(prev => ({ ...prev, [k]: v }))}
        onSave={saveConfig}
        onClose={() => { setConfigOpen(false); setSaveStatus('idle'); }}
        notSupported={configConnectorId === null}
      />

      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </div>
  );
}
