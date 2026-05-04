import React, { useEffect, useRef, useState } from 'react';
import { connectorsApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import { supabase } from '../api/supabase';
import ShopifyConnectModal from './integrations/ShopifyConnectModal';
import StripeConnectModal from './integrations/StripeConnectModal';
import GmailConnectModal from './integrations/GmailConnectModal';
import TwilioConnectModal from './integrations/TwilioConnectModal';
import WhatsAppConnectModal from './integrations/WhatsAppConnectModal';
import OutlookConnectModal from './integrations/OutlookConnectModal';
import PayPalConnectModal from './integrations/PayPalConnectModal';
import MessengerConnectModal from './integrations/MessengerConnectModal';
import InstagramConnectModal from './integrations/InstagramConnectModal';
import TelegramConnectModal from './integrations/TelegramConnectModal';
import PostmarkConnectModal from './integrations/PostmarkConnectModal';
import UPSConnectModal from './integrations/UPSConnectModal';
import DHLConnectModal from './integrations/DHLConnectModal';
import SalesforceConnectModal from './integrations/SalesforceConnectModal';
import HubSpotConnectModal from './integrations/HubSpotConnectModal';
import SlackConnectModal from './integrations/SlackConnectModal';
import ZendeskConnectModal from './integrations/ZendeskConnectModal';
import IntercomConnectModal from './integrations/IntercomConnectModal';
import NotionConnectModal from './integrations/NotionConnectModal';
import WooCommerceConnectModal from './integrations/WooCommerceConnectModal';
import CalendlyConnectModal from './integrations/CalendlyConnectModal';
import TeamsConnectModal from './integrations/TeamsConnectModal';
import LinearConnectModal from './integrations/LinearConnectModal';
import JiraConnectModal from './integrations/JiraConnectModal';
import ConfluenceConnectModal from './integrations/ConfluenceConnectModal';
import GitHubConnectModal from './integrations/GitHubConnectModal';
import FrontConnectModal from './integrations/FrontConnectModal';
import AircallConnectModal from './integrations/AircallConnectModal';
import GCalendarConnectModal from './integrations/GCalendarConnectModal';
import GDriveConnectModal from './integrations/GDriveConnectModal';
import ZoomConnectModal from './integrations/ZoomConnectModal';
import AsanaConnectModal from './integrations/AsanaConnectModal';
import PipedriveConnectModal from './integrations/PipedriveConnectModal';
import MailchimpConnectModal from './integrations/MailchimpConnectModal';
import KlaviyoConnectModal from './integrations/KlaviyoConnectModal';
import SegmentConnectModal from './integrations/SegmentConnectModal';
import QuickBooksConnectModal from './integrations/QuickBooksConnectModal';
import DocuSignConnectModal from './integrations/DocuSignConnectModal';
import SentryConnectModal from './integrations/SentryConnectModal';
import PlaidConnectModal from './integrations/PlaidConnectModal';
import GitLabConnectModal from './integrations/GitLabConnectModal';
import DiscordConnectModal from './integrations/DiscordConnectModal';
import { IntegrationLogo, integrationBgClass } from './integrations/logos';

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
  { id: 'front', name: 'Front', category: 'Support', description: 'Shared inbox · email · social · SMS unified.', powers: 'Inbox', status: 'Not Connected', icon: 'inbox', color: 'bg-violet-600' },
  
  // Commerce
  { id: 'shopify', name: 'Shopify', category: 'Commerce', description: 'Sync orders, customers, and products.', powers: 'Order Agent', status: 'Connected', icon: 'shopping_bag', color: 'bg-green-600' },
  { id: 'woocommerce', name: 'WooCommerce', category: 'Commerce', description: 'Open-source e-commerce plugin.', powers: 'Order Agent', status: 'Not Connected', icon: 'storefront', color: 'bg-purple-600' },
  { id: 'stripe', name: 'Stripe', category: 'Commerce', description: 'Manage payments, refunds, and subscriptions.', powers: 'Billing Agent', status: 'Error', icon: 'payments', color: 'bg-indigo-600' },
  { id: 'paypal', name: 'PayPal', category: 'Commerce', description: 'Online payments system.', powers: 'Billing Agent', status: 'Not Connected', icon: 'account_balance_wallet', color: 'bg-blue-700' },

  // Communication
  { id: 'slack', name: 'Slack', category: 'Communication', description: 'Team communication and alerts.', powers: 'Notifications', status: 'Reconnect Required', icon: 'tag', color: 'bg-purple-700' },
  { id: 'teams', name: 'Microsoft Teams', category: 'Communication', description: 'Workspace for real-time collaboration.', powers: 'Collaboration', status: 'Not Connected', icon: 'groups', color: 'bg-indigo-700' },
  { id: 'whatsapp', name: 'WhatsApp Business', category: 'Communication', description: 'Direct customer messaging.', powers: 'Messaging', status: 'Not Connected', icon: 'chat_bubble', color: 'bg-green-500' },
  { id: 'messenger', name: 'Facebook Messenger', category: 'Communication', description: 'Page messaging via Meta Graph.', powers: 'Inbox', status: 'Not Connected', icon: 'forum', color: 'bg-blue-500' },
  { id: 'instagram', name: 'Instagram', category: 'Communication', description: 'DMs, comments, mentions, story replies.', powers: 'Inbox', status: 'Not Connected', icon: 'photo_camera', color: 'bg-pink-500' },
  { id: 'telegram', name: 'Telegram', category: 'Communication', description: 'Bot inbox, slash commands, inline keyboards.', powers: 'Inbox', status: 'Not Connected', icon: 'send', color: 'bg-sky-500' },
  { id: 'gmail', name: 'Gmail / Google Workspace', category: 'Communication', description: 'Email integration and sync.', powers: 'Email Agent', status: 'Syncing', icon: 'mail', color: 'bg-red-500' },
  { id: 'outlook', name: 'Outlook / Microsoft 365 Mail', category: 'Communication', description: 'Enterprise email integration.', powers: 'Email Agent', status: 'Not Connected', icon: 'mark_email_unread', color: 'bg-blue-600' },
  { id: 'twilio', name: 'Twilio', category: 'Communication', description: 'SMS and voice communications.', powers: 'SMS Agent', status: 'Not Connected', icon: 'sms', color: 'bg-red-600' },
  { id: 'aircall', name: 'Aircall', category: 'Communication', description: 'Voice channel · call recordings + transcripts.', powers: 'Voice Agent', status: 'Not Connected', icon: 'call', color: 'bg-emerald-600' },
  { id: 'postmark', name: 'Postmark', category: 'Communication', description: 'Transactional email with high deliverability.', powers: 'Outbound Email', status: 'Not Connected', icon: 'mail', color: 'bg-amber-500' },

  // Shipping
  { id: 'ups', name: 'UPS', category: 'Commerce', description: 'Tracking, rates, address validation, label creation.', powers: 'Shipping', status: 'Not Connected', icon: 'local_shipping', color: 'bg-amber-700' },
  { id: 'dhl', name: 'DHL', category: 'Commerce', description: 'Unified tracking + DHL Express rates and shipping.', powers: 'Shipping', status: 'Not Connected', icon: 'local_shipping', color: 'bg-yellow-500' },

  // CRM
  { id: 'hubspot', name: 'HubSpot', category: 'CRM', description: 'Inbound marketing, sales, and service.', powers: 'CRM Context', status: 'Connected', icon: 'hub', color: 'bg-orange-500' },
  { id: 'salesforce', name: 'Salesforce', category: 'CRM', description: 'Customer relationship management.', powers: 'CRM Context', status: 'Not Connected', icon: 'cloud', color: 'bg-blue-500' },
  { id: 'pipedrive', name: 'Pipedrive', category: 'CRM', description: 'Sales CRM and pipeline management.', powers: 'CRM Context', status: 'Not Connected', icon: 'filter_alt', color: 'bg-green-600' },
  { id: 'mailchimp', name: 'Mailchimp', category: 'Communication', description: 'Email marketing · audiences · campaigns.', powers: 'Marketing', status: 'Not Connected', icon: 'campaign', color: 'bg-yellow-400' },
  { id: 'klaviyo', name: 'Klaviyo', category: 'Communication', description: 'Ecom email + SMS · profiles · flows · segments.', powers: 'Marketing', status: 'Not Connected', icon: 'mark_email_read', color: 'bg-black' },
  { id: 'segment', name: 'Segment', category: 'Automation', description: 'CDP · identity resolution · event pipeline.', powers: 'Data Layer', status: 'Not Connected', icon: 'hub', color: 'bg-emerald-500' },
  { id: 'quickbooks', name: 'QuickBooks', category: 'Commerce', description: 'Accounting · invoices · refunds reconciliation.', powers: 'Accounting', status: 'Not Connected', icon: 'account_balance', color: 'bg-emerald-700' },
  { id: 'docusign', name: 'DocuSign', category: 'CRM', description: 'Contracts · e-signature · envelopes.', powers: 'Sales', status: 'Not Connected', icon: 'draw', color: 'bg-yellow-500' },
  { id: 'sentry', name: 'Sentry', category: 'Productivity', description: 'Errors · issue grouping · alerts → tickets.', powers: 'Engineering', status: 'Not Connected', icon: 'bug_report', color: 'bg-purple-700' },
  { id: 'plaid', name: 'Plaid', category: 'Commerce', description: 'Bank verification · KYC · ACH/IBAN.', powers: 'Finance', status: 'Not Connected', icon: 'account_balance_wallet', color: 'bg-slate-900' },
  { id: 'gitlab', name: 'GitLab', category: 'Productivity', description: 'Issues · MRs · pipelines · self-hosted friendly.', powers: 'Engineering', status: 'Not Connected', icon: 'code', color: 'bg-orange-600' },
  { id: 'discord', name: 'Discord', category: 'Communication', description: 'Community channels · bot · slash commands.', powers: 'Inbox', status: 'Not Connected', icon: 'forum', color: 'bg-indigo-500' },

  // Knowledge
  { id: 'notion', name: 'Notion', category: 'Knowledge', description: 'Connected workspace for your docs.', powers: 'Knowledge Sync', status: 'Connected', icon: 'description', color: 'bg-gray-900' },
  { id: 'calendly', name: 'Calendly', category: 'Productivity', description: 'Book demos and human handoffs in-conversation.', powers: 'Scheduling', status: 'Not Connected', icon: 'event', color: 'bg-blue-600' },
  { id: 'gdrive', name: 'Google Drive', category: 'Knowledge', description: 'Cloud storage and file backup.', powers: 'Knowledge Sync', status: 'Not Connected', icon: 'add_to_drive', color: 'bg-blue-500' },
  { id: 'gcalendar', name: 'Google Calendar', category: 'Productivity', description: 'Internal availability · scheduling backbone.', powers: 'Scheduling', status: 'Not Connected', icon: 'event', color: 'bg-blue-500' },
  { id: 'zoom', name: 'Zoom', category: 'Communication', description: 'Meetings · recordings + AI Companion transcripts.', powers: 'Voice/Video', status: 'Not Connected', icon: 'videocam', color: 'bg-sky-600' },
  { id: 'asana', name: 'Asana', category: 'Productivity', description: 'Project management para ops, marketing y legal.', powers: 'Tasks', status: 'Not Connected', icon: 'check_circle', color: 'bg-rose-500' },
  { id: 'confluence', name: 'Confluence', category: 'Knowledge', description: 'Team workspace and documentation.', powers: 'Knowledge Sync', status: 'Not Connected', icon: 'menu_book', color: 'bg-blue-600' },

  // Productivity
  { id: 'jira', name: 'Jira', category: 'Productivity', description: 'Issue and project tracking.', powers: 'Ticketing', status: 'Not Connected', icon: 'bug_report', color: 'bg-blue-600' },
  { id: 'linear', name: 'Linear', category: 'Productivity', description: 'Engineering issues + escalation from inbox.', powers: 'Ticketing', status: 'Not Connected', icon: 'stacks', color: 'bg-indigo-600' },
  { id: 'github', name: 'GitHub', category: 'Productivity', description: 'Issues · PRs · escalation técnico desde inbox.', powers: 'Engineering', status: 'Not Connected', icon: 'code', color: 'bg-gray-900' },

  // Automation

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

// Systems that support the OAuth popup flow
const OAUTH_SYSTEMS = new Set(['google', 'gmail', 'slack', 'outlook']);

const OAUTH_BUTTON_LABEL: Record<string, string> = {
  google:  'Connect with Google',
  gmail:   'Connect with Google',
  slack:   'Connect with Slack',
  outlook: 'Connect with Microsoft',
};

const OAUTH_ICON: Record<string, string> = {
  google:  'G',
  gmail:   'G',
  slack:   '#',
  outlook: '⊞',
};

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
  const [oauthStatus, setOauthStatus] = useState<Record<string, 'connecting' | 'done' | 'error'>>({});
  const popupRef = useRef<Window | null>(null);

  // Shopify dedicated modal state (separate flow: OAuth-first + manual fallback).
  const [shopifyModalOpen, setShopifyModalOpen] = useState(false);
  const [shopifyExisting, setShopifyExisting] = useState<{
    id?: string;
    shop_domain?: string;
    scope?: string;
    auth_type?: string;
    last_health_check_at?: string | null;
    capabilities?: { reads?: string[]; writes?: string[]; webhooks?: string[] } | null;
  } | null>(null);
  const [shopifyToast, setShopifyToast] = useState<string | null>(null);

  // Stripe dedicated modal — same OAuth-first + manual fallback pattern.
  const [stripeModalOpen, setStripeModalOpen] = useState(false);
  const [stripeExisting, setStripeExisting] = useState<{
    stripe_user_id?: string;
    publishable_key?: string;
    scope?: string;
    livemode?: boolean;
    last_health_check_at?: string | null;
    capabilities?: { reads?: string[]; writes?: string[]; webhook_events?: string[] } | null;
  } | null>(null);
  const [stripeToast, setStripeToast] = useState<string | null>(null);

  // Gmail dedicated modal — OAuth-only (no manual key fallback exists for Gmail).
  const [gmailModalOpen, setGmailModalOpen] = useState(false);
  const [gmailExisting, setGmailExisting] = useState<{
    email?: string;
    display_name?: string | null;
    scope?: string;
    realtime_mode?: 'pubsub' | 'polling';
    watch_expiration?: string | null;
    history_id?: string | null;
    last_health_check_at?: string | null;
    capabilities?: { reads?: string[]; writes?: string[]; realtime?: string } | null;
  } | null>(null);
  const [gmailToast, setGmailToast] = useState<string | null>(null);

  // Twilio dedicated modal — API-key entry + phone-number picker.
  const [twilioModalOpen, setTwilioModalOpen] = useState(false);
  const [twilioExisting, setTwilioExisting] = useState<{
    account_sid?: string;
    account_name?: string;
    account_status?: string;
    auth_type?: 'api_key' | 'api_key_pair';
    balance?: { balance: string; currency: string } | null;
    phone_numbers?: Array<{ sid: string; phone_number: string; capabilities?: any }>;
    default_sms_from?: string | null;
    default_whatsapp_from?: string | null;
    last_health_check_at?: string | null;
    capabilities?: { sends?: string[]; reads?: string[] } | null;
  } | null>(null);

  // Outlook / Microsoft 365 modal — OAuth-only via Microsoft Identity v2.
  const [outlookModalOpen, setOutlookModalOpen] = useState(false);
  const [outlookExisting, setOutlookExisting] = useState<{
    email?: string;
    display_name?: string | null;
    scope?: string;
    realtime_mode?: 'webhook' | 'polling';
    subscription_id?: string | null;
    subscription_expires_at?: string | null;
    last_health_check_at?: string | null;
    capabilities?: { reads?: string[]; writes?: string[]; realtime?: string } | null;
  } | null>(null);
  const [outlookToast, setOutlookToast] = useState<string | null>(null);

  // Messenger / Instagram / Telegram modals.
  const [messengerModalOpen, setMessengerModalOpen] = useState(false);
  const [messengerExisting, setMessengerExisting] = useState<any>(null);
  const [instagramModalOpen, setInstagramModalOpen] = useState(false);
  const [instagramExisting, setInstagramExisting] = useState<any>(null);
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [telegramExisting, setTelegramExisting] = useState<any>(null);
  const [postmarkModalOpen, setPostmarkModalOpen] = useState(false);
  const [postmarkExisting, setPostmarkExisting] = useState<any>(null);
  const [upsModalOpen, setUpsModalOpen] = useState(false);
  const [upsExisting, setUpsExisting] = useState<any>(null);
  const [dhlModalOpen, setDhlModalOpen] = useState(false);
  const [dhlExisting, setDhlExisting] = useState<any>(null);
  const [salesforceModalOpen, setSalesforceModalOpen] = useState(false);
  const [salesforceExisting, setSalesforceExisting] = useState<any>(null);
  const [hubspotModalOpen, setHubspotModalOpen] = useState(false);
  const [hubspotExisting, setHubspotExisting] = useState<any>(null);
  const [slackModalOpen, setSlackModalOpen] = useState(false);
  const [slackExisting, setSlackExisting] = useState<any>(null);
  const [zendeskModalOpen, setZendeskModalOpen] = useState(false);
  const [zendeskExisting, setZendeskExisting] = useState<any>(null);
  const [intercomModalOpen, setIntercomModalOpen] = useState(false);
  const [intercomExisting, setIntercomExisting] = useState<any>(null);
  const [notionModalOpen, setNotionModalOpen] = useState(false);
  const [notionExisting, setNotionExisting] = useState<any>(null);
  const [wooModalOpen, setWooModalOpen] = useState(false);
  const [wooExisting, setWooExisting] = useState<any>(null);
  const [calendlyModalOpen, setCalendlyModalOpen] = useState(false);
  const [calendlyExisting, setCalendlyExisting] = useState<any>(null);
  const [teamsModalOpen, setTeamsModalOpen] = useState(false);
  const [teamsExisting, setTeamsExisting] = useState<any>(null);
  const [linearModalOpen, setLinearModalOpen] = useState(false);
  const [linearExisting, setLinearExisting] = useState<any>(null);
  const [jiraModalOpen, setJiraModalOpen] = useState(false);
  const [jiraExisting, setJiraExisting] = useState<any>(null);
  const [confluenceModalOpen, setConfluenceModalOpen] = useState(false);
  const [confluenceExisting, setConfluenceExisting] = useState<any>(null);
  const [githubModalOpen, setGithubModalOpen] = useState(false);
  const [githubExisting, setGithubExisting] = useState<any>(null);
  const [frontModalOpen, setFrontModalOpen] = useState(false);
  const [frontExisting, setFrontExisting] = useState<any>(null);
  const [aircallModalOpen, setAircallModalOpen] = useState(false);
  const [aircallExisting, setAircallExisting] = useState<any>(null);
  const [gcalendarModalOpen, setGcalendarModalOpen] = useState(false);
  const [gcalendarExisting, setGcalendarExisting] = useState<any>(null);
  const [gdriveModalOpen, setGdriveModalOpen] = useState(false);
  const [gdriveExisting, setGdriveExisting] = useState<any>(null);
  const [zoomModalOpen, setZoomModalOpen] = useState(false);
  const [zoomExisting, setZoomExisting] = useState<any>(null);
  const [asanaModalOpen, setAsanaModalOpen] = useState(false);
  const [asanaExisting, setAsanaExisting] = useState<any>(null);
  const [pipedriveModalOpen, setPipedriveModalOpen] = useState(false);
  const [pipedriveExisting, setPipedriveExisting] = useState<any>(null);
  const [mailchimpModalOpen, setMailchimpModalOpen] = useState(false);
  const [mailchimpExisting, setMailchimpExisting] = useState<any>(null);
  const [klaviyoModalOpen, setKlaviyoModalOpen] = useState(false);
  const [klaviyoExisting, setKlaviyoExisting] = useState<any>(null);
  const [segmentModalOpen, setSegmentModalOpen] = useState(false);
  const [segmentExisting, setSegmentExisting] = useState<any>(null);
  const [quickbooksModalOpen, setQuickbooksModalOpen] = useState(false);
  const [quickbooksExisting, setQuickbooksExisting] = useState<any>(null);
  const [docusignModalOpen, setDocusignModalOpen] = useState(false);
  const [docusignExisting, setDocusignExisting] = useState<any>(null);
  const [sentryModalOpen, setSentryModalOpen] = useState(false);
  const [sentryExisting, setSentryExisting] = useState<any>(null);
  const [plaidModalOpen, setPlaidModalOpen] = useState(false);
  const [plaidExisting, setPlaidExisting] = useState<any>(null);
  const [gitlabModalOpen, setGitlabModalOpen] = useState(false);
  const [gitlabExisting, setGitlabExisting] = useState<any>(null);
  const [discordModalOpen, setDiscordModalOpen] = useState(false);
  const [discordExisting, setDiscordExisting] = useState<any>(null);

  // PayPal modal — Client Credentials based, sandbox/live toggle.
  const [paypalModalOpen, setPaypalModalOpen] = useState(false);
  const [paypalExisting, setPaypalExisting] = useState<{
    mode?: 'sandbox' | 'live';
    app_id?: string;
    merchant_email?: string;
    webhook_id?: string;
    webhook_url?: string;
    webhook_registered?: boolean;
    webhook_registration_error?: string | null;
    last_health_check_at?: string | null;
    capabilities?: { reads?: string[]; writes?: string[] } | null;
  } | null>(null);

  // WhatsApp dedicated modal (Meta Cloud API direct, independent from Twilio).
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappExisting, setWhatsappExisting] = useState<{
    phone_number_id?: string;
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    waba_id?: string | null;
    verify_token?: string;
    webhook_callback_url?: string;
    webhook_subscribed?: boolean;
    template_count?: number;
    last_health_check_at?: string | null;
    capabilities?: { sends?: string[]; reads?: string[]; realtime?: string } | null;
  } | null>(null);

  // ── Detect OAuth callback redirect (?connected=shopify&shop=...) ─────────
  // Shopify's /callback handler redirects here after a successful install.
  // Surface a toast, refresh the connector list and clean the URL so a
  // browser refresh doesn't re-trigger the toast.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'shopify') {
      const shop = params.get('shop');
      setShopifyToast(shop ? `Shopify conectado: ${shop}` : 'Shopify conectado');
      params.delete('connected');
      params.delete('shop');
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
      window.history.replaceState({}, '', next);
      setTimeout(() => setShopifyToast(null), 4500);
    }
    if (params.get('connected') === 'outlook') {
      const email = params.get('email');
      setOutlookToast(email ? `Outlook conectado: ${email}` : 'Outlook conectado');
      params.delete('connected');
      params.delete('email');
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
      window.history.replaceState({}, '', next);
      setTimeout(() => setOutlookToast(null), 4500);
    }
    if (params.get('connected') === 'gmail') {
      const email = params.get('email');
      setGmailToast(email ? `Gmail conectado: ${email}` : 'Gmail conectado');
      params.delete('connected');
      params.delete('email');
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
      window.history.replaceState({}, '', next);
      setTimeout(() => setGmailToast(null), 4500);
    }
    if (params.get('connected') === 'stripe') {
      const account = params.get('account');
      const live = params.get('livemode') === '1';
      setStripeToast(account
        ? `Stripe conectado: ${account}${live ? ' · Live' : ' · Test'}`
        : 'Stripe conectado');
      params.delete('connected');
      params.delete('account');
      params.delete('livemode');
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
      window.history.replaceState({}, '', next);
      setTimeout(() => setStripeToast(null), 4500);
    }
  }, []);

  // ── Load current Shopify connector status (powers the modal pre-fill) ────
  async function refreshShopifyStatus() {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/integrations/shopify/status`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.connected) {
        setShopifyExisting({
          shop_domain: json.shop_domain,
          scope: json.scope,
          last_health_check_at: json.last_health_check_at,
          capabilities: json.capabilities,
        });
      } else {
        setShopifyExisting(null);
      }
    } catch {
      // non-fatal — modal still opens with empty state
    }
  }

  useEffect(() => {
    void refreshShopifyStatus();
  }, []);

  // ── Stripe status (parallel to Shopify) ─────────────────────────────────
  async function refreshStripeStatus() {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/integrations/stripe/status`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.connected) {
        setStripeExisting({
          stripe_user_id: json.stripe_user_id,
          publishable_key: json.publishable_key,
          scope: json.scope,
          livemode: json.livemode,
          last_health_check_at: json.last_health_check_at,
          capabilities: json.capabilities,
        });
      } else {
        setStripeExisting(null);
      }
    } catch {
      // non-fatal
    }
  }

  useEffect(() => {
    void refreshStripeStatus();
  }, []);

  // ── Gmail status ────────────────────────────────────────────────────────
  async function refreshGmailStatus() {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/integrations/gmail/status`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.connected) {
        setGmailExisting({
          email: json.email,
          display_name: json.display_name,
          scope: json.scope,
          realtime_mode: json.realtime_mode,
          watch_expiration: json.watch_expiration,
          history_id: json.history_id,
          last_health_check_at: json.last_health_check_at,
          capabilities: json.capabilities,
        });
      } else {
        setGmailExisting(null);
      }
    } catch {
      // non-fatal
    }
  }

  useEffect(() => {
    void refreshGmailStatus();
  }, []);

  // ── Twilio status (parallel pattern) ────────────────────────────────────
  async function refreshTwilioStatus() {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/integrations/twilio/status`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.connected) {
        setTwilioExisting({
          account_sid: json.account_sid,
          account_name: json.account_name,
          account_status: json.account_status,
          auth_type: json.auth_type,
          balance: json.balance,
          phone_numbers: json.phone_numbers,
          default_sms_from: json.default_sms_from,
          default_whatsapp_from: json.default_whatsapp_from,
          last_health_check_at: json.last_health_check_at,
          capabilities: json.capabilities,
        });
      } else {
        setTwilioExisting(null);
      }
    } catch {
      // non-fatal
    }
  }

  useEffect(() => {
    void refreshTwilioStatus();
  }, []);

  // ── Outlook status (Microsoft 365 / Graph) ──────────────────────────────
  async function refreshOutlookStatus() {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/integrations/outlook/status`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.connected) {
        setOutlookExisting({
          email: json.email,
          display_name: json.display_name,
          scope: json.scope,
          realtime_mode: json.realtime_mode,
          subscription_id: json.subscription_id,
          subscription_expires_at: json.subscription_expires_at,
          last_health_check_at: json.last_health_check_at,
          capabilities: json.capabilities,
        });
      } else {
        setOutlookExisting(null);
      }
    } catch {
      // non-fatal
    }
  }

  useEffect(() => {
    void refreshOutlookStatus();
  }, []);

  // ── PayPal status ───────────────────────────────────────────────────────
  async function refreshPayPalStatus() {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/integrations/paypal/status`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.connected) {
        setPaypalExisting({
          mode: json.mode,
          app_id: json.app_id,
          merchant_email: json.merchant_email,
          webhook_id: json.webhook_id,
          webhook_url: json.webhook_url,
          webhook_registered: json.webhook_registered,
          webhook_registration_error: json.webhook_registration_error,
          last_health_check_at: json.last_health_check_at,
          capabilities: json.capabilities,
        });
      } else {
        setPaypalExisting(null);
      }
    } catch {
      // non-fatal
    }
  }

  useEffect(() => {
    void refreshPayPalStatus();
  }, []);

  // ── Messenger / Instagram / Telegram status fetchers ────────────────────
  async function refreshSimpleStatus(system: 'messenger' | 'instagram' | 'telegram' | 'postmark' | 'ups' | 'dhl' | 'salesforce' | 'hubspot' | 'slack' | 'zendesk' | 'intercom' | 'notion' | 'woocommerce' | 'calendly' | 'teams' | 'linear' | 'jira' | 'confluence' | 'github' | 'front' | 'aircall' | 'gcalendar' | 'gdrive' | 'zoom' | 'asana' | 'pipedrive' | 'mailchimp' | 'klaviyo' | 'segment' | 'quickbooks' | 'docusign' | 'sentry' | 'plaid' | 'gitlab' | 'discord', setter: (v: any) => void) {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/integrations/${system}/status`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      setter(json.connected ? json : null);
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    void refreshSimpleStatus('messenger', setMessengerExisting);
    void refreshSimpleStatus('instagram', setInstagramExisting);
    void refreshSimpleStatus('telegram', setTelegramExisting);
    void refreshSimpleStatus('postmark', setPostmarkExisting);
    void refreshSimpleStatus('ups', setUpsExisting);
    void refreshSimpleStatus('dhl', setDhlExisting);
    void refreshSimpleStatus('salesforce', setSalesforceExisting);
    void refreshSimpleStatus('hubspot', setHubspotExisting);
    void refreshSimpleStatus('slack', setSlackExisting);
    void refreshSimpleStatus('zendesk', setZendeskExisting);
    void refreshSimpleStatus('intercom', setIntercomExisting);
    void refreshSimpleStatus('notion', setNotionExisting);
    void refreshSimpleStatus('woocommerce', setWooExisting);
    void refreshSimpleStatus('calendly', setCalendlyExisting);
    void refreshSimpleStatus('teams', setTeamsExisting);
    void refreshSimpleStatus('linear', setLinearExisting);
    void refreshSimpleStatus('jira', setJiraExisting);
    void refreshSimpleStatus('confluence', setConfluenceExisting);
    void refreshSimpleStatus('github', setGithubExisting);
    void refreshSimpleStatus('front', setFrontExisting);
    void refreshSimpleStatus('aircall', setAircallExisting);
    void refreshSimpleStatus('gcalendar', setGcalendarExisting);
    void refreshSimpleStatus('gdrive', setGdriveExisting);
    void refreshSimpleStatus('zoom', setZoomExisting);
    void refreshSimpleStatus('asana', setAsanaExisting);
    void refreshSimpleStatus('pipedrive', setPipedriveExisting);
    void refreshSimpleStatus('mailchimp', setMailchimpExisting);
    void refreshSimpleStatus('klaviyo', setKlaviyoExisting);
    void refreshSimpleStatus('segment', setSegmentExisting);
    void refreshSimpleStatus('quickbooks', setQuickbooksExisting);
    void refreshSimpleStatus('docusign', setDocusignExisting);
    void refreshSimpleStatus('sentry', setSentryExisting);
    void refreshSimpleStatus('plaid', setPlaidExisting);
    void refreshSimpleStatus('gitlab', setGitlabExisting);
    void refreshSimpleStatus('discord', setDiscordExisting);
  }, []);

  // ── WhatsApp status (Meta Cloud API direct) ─────────────────────────────
  async function refreshWhatsAppStatus() {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/integrations/whatsapp/status`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.connected) {
        setWhatsappExisting({
          phone_number_id: json.phone_number_id,
          display_phone_number: json.display_phone_number,
          verified_name: json.verified_name,
          quality_rating: json.quality_rating,
          waba_id: json.waba_id,
          verify_token: json.verify_token,
          webhook_callback_url: json.webhook_callback_url,
          webhook_subscribed: json.webhook_subscribed,
          template_count: json.template_count,
          last_health_check_at: json.last_health_check_at,
          capabilities: json.capabilities,
        });
      } else {
        setWhatsappExisting(null);
      }
    } catch {
      // non-fatal
    }
  }

  useEffect(() => {
    void refreshWhatsAppStatus();
  }, []);

  async function handleOAuthConnect(system: string) {
    setOauthStatus(prev => ({ ...prev, [system]: 'connecting' }));
    try {
      const { data: session } = await supabase.auth.getSession();
      const tenantId    = (session?.session?.user?.app_metadata?.tenant_id as string) ?? 'org_default';
      const workspaceId = (session?.session?.user?.app_metadata?.workspace_id as string) ?? 'ws_default';
      const apiBase     = (import.meta as any).env?.VITE_API_URL ?? '';
      const url = `${apiBase}/api/oauth-connectors/${system}/start?tenantId=${encodeURIComponent(tenantId)}&workspaceId=${encodeURIComponent(workspaceId)}`;

      const popup = window.open(url, `oauth_${system}`, 'width=520,height=640,menubar=no,toolbar=no,status=no');
      if (!popup) {
        throw new Error('Popup blocked — allow popups for this site and try again.');
      }
      popupRef.current = popup;

      // Poll for popup close as fallback
      const poll = setInterval(() => {
        if (popup.closed) {
          clearInterval(poll);
          setOauthStatus(prev => {
            if (prev[system] === 'connecting') return { ...prev, [system]: 'error' };
            return prev;
          });
        }
      }, 800);
    } catch (err: any) {
      setOauthStatus(prev => ({ ...prev, [system]: 'error' }));
      console.error('OAuth connect error:', err.message);
    }
  }

  const { data: apiConnectors, refetch } = useApi(connectorsApi.list);
  const testConnector = useMutation((id: string) => connectorsApi.test(id));
  const updateConnector = useMutation((payload: { id: string; body: Record<string, any> }) => connectorsApi.update(payload.id, payload.body));

  // Listen for postMessage from OAuth popup — placed after refetch is declared
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'oauth_success') {
        setOauthStatus(prev => ({ ...prev, [event.data.detail as string]: 'done' }));
        refetch();
      } else if (event.data?.type === 'oauth_error') {
        setOauthStatus(prev => ({ ...prev, _last: 'error' }));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [refetch]);

  function openConfigModal(integration: Integration) {
    // Shopify gets a dedicated modal: OAuth-first with a manual-credentials
    // fallback behind an "Advanced" expander. The generic credentials modal
    // (below) is skipped for shopify so users never see paste-token UI as
    // their default path.
    if (integration.id === 'shopify') {
      void refreshShopifyStatus();
      setShopifyModalOpen(true);
      return;
    }
    if (integration.id === 'stripe') {
      void refreshStripeStatus();
      setStripeModalOpen(true);
      return;
    }
    if (integration.id === 'gmail') {
      void refreshGmailStatus();
      setGmailModalOpen(true);
      return;
    }
    if (integration.id === 'twilio') {
      void refreshTwilioStatus();
      setTwilioModalOpen(true);
      return;
    }
    if (integration.id === 'whatsapp') {
      void refreshWhatsAppStatus();
      setWhatsappModalOpen(true);
      return;
    }
    if (integration.id === 'outlook') {
      void refreshOutlookStatus();
      setOutlookModalOpen(true);
      return;
    }
    if (integration.id === 'paypal') {
      void refreshPayPalStatus();
      setPaypalModalOpen(true);
      return;
    }
    if (integration.id === 'messenger') {
      void refreshSimpleStatus('messenger', setMessengerExisting);
      setMessengerModalOpen(true);
      return;
    }
    if (integration.id === 'instagram') {
      void refreshSimpleStatus('instagram', setInstagramExisting);
      setInstagramModalOpen(true);
      return;
    }
    if (integration.id === 'telegram') {
      void refreshSimpleStatus('telegram', setTelegramExisting);
      setTelegramModalOpen(true);
      return;
    }
    if (integration.id === 'postmark') {
      void refreshSimpleStatus('postmark', setPostmarkExisting);
      setPostmarkModalOpen(true);
      return;
    }
    if (integration.id === 'ups') {
      void refreshSimpleStatus('ups', setUpsExisting);
      setUpsModalOpen(true);
      return;
    }
    if (integration.id === 'dhl') {
      void refreshSimpleStatus('dhl', setDhlExisting);
      setDhlModalOpen(true);
      return;
    }
    if (integration.id === 'salesforce') {
      void refreshSimpleStatus('salesforce', setSalesforceExisting);
      setSalesforceModalOpen(true);
      return;
    }
    if (integration.id === 'hubspot') {
      void refreshSimpleStatus('hubspot', setHubspotExisting);
      setHubspotModalOpen(true);
      return;
    }
    if (integration.id === 'slack') {
      void refreshSimpleStatus('slack', setSlackExisting);
      setSlackModalOpen(true);
      return;
    }
    if (integration.id === 'zendesk') {
      void refreshSimpleStatus('zendesk', setZendeskExisting);
      setZendeskModalOpen(true);
      return;
    }
    if (integration.id === 'intercom') {
      void refreshSimpleStatus('intercom', setIntercomExisting);
      setIntercomModalOpen(true);
      return;
    }
    if (integration.id === 'notion') {
      void refreshSimpleStatus('notion', setNotionExisting);
      setNotionModalOpen(true);
      return;
    }
    if (integration.id === 'woocommerce') {
      void refreshSimpleStatus('woocommerce', setWooExisting);
      setWooModalOpen(true);
      return;
    }
    if (integration.id === 'calendly') {
      void refreshSimpleStatus('calendly', setCalendlyExisting);
      setCalendlyModalOpen(true);
      return;
    }
    if (integration.id === 'teams') {
      void refreshSimpleStatus('teams', setTeamsExisting);
      setTeamsModalOpen(true);
      return;
    }
    if (integration.id === 'linear') {
      void refreshSimpleStatus('linear', setLinearExisting);
      setLinearModalOpen(true);
      return;
    }
    if (integration.id === 'jira') {
      void refreshSimpleStatus('jira', setJiraExisting);
      setJiraModalOpen(true);
      return;
    }
    if (integration.id === 'confluence') {
      void refreshSimpleStatus('confluence', setConfluenceExisting);
      setConfluenceModalOpen(true);
      return;
    }
    if (integration.id === 'github') {
      void refreshSimpleStatus('github', setGithubExisting);
      setGithubModalOpen(true);
      return;
    }
    if (integration.id === 'front') {
      void refreshSimpleStatus('front', setFrontExisting);
      setFrontModalOpen(true);
      return;
    }
    if (integration.id === 'aircall') {
      void refreshSimpleStatus('aircall', setAircallExisting);
      setAircallModalOpen(true);
      return;
    }
    if (integration.id === 'gcalendar') {
      void refreshSimpleStatus('gcalendar', setGcalendarExisting);
      setGcalendarModalOpen(true);
      return;
    }
    if (integration.id === 'gdrive') {
      void refreshSimpleStatus('gdrive', setGdriveExisting);
      setGdriveModalOpen(true);
      return;
    }
    if (integration.id === 'zoom') {
      void refreshSimpleStatus('zoom', setZoomExisting);
      setZoomModalOpen(true);
      return;
    }
    if (integration.id === 'asana') {
      void refreshSimpleStatus('asana', setAsanaExisting);
      setAsanaModalOpen(true);
      return;
    }
    if (integration.id === 'pipedrive') {
      void refreshSimpleStatus('pipedrive', setPipedriveExisting);
      setPipedriveModalOpen(true);
      return;
    }
    if (integration.id === 'mailchimp') {
      void refreshSimpleStatus('mailchimp', setMailchimpExisting);
      setMailchimpModalOpen(true);
      return;
    }
    if (integration.id === 'klaviyo') {
      void refreshSimpleStatus('klaviyo', setKlaviyoExisting);
      setKlaviyoModalOpen(true);
      return;
    }
    if (integration.id === 'segment') {
      void refreshSimpleStatus('segment', setSegmentExisting);
      setSegmentModalOpen(true);
      return;
    }
    if (integration.id === 'quickbooks') {
      void refreshSimpleStatus('quickbooks', setQuickbooksExisting);
      setQuickbooksModalOpen(true);
      return;
    }
    if (integration.id === 'docusign') {
      void refreshSimpleStatus('docusign', setDocusignExisting);
      setDocusignModalOpen(true);
      return;
    }
    if (integration.id === 'sentry') {
      void refreshSimpleStatus('sentry', setSentryExisting);
      setSentryModalOpen(true);
      return;
    }
    if (integration.id === 'plaid') {
      void refreshSimpleStatus('plaid', setPlaidExisting);
      setPlaidModalOpen(true);
      return;
    }
    if (integration.id === 'gitlab') {
      void refreshSimpleStatus('gitlab', setGitlabExisting);
      setGitlabModalOpen(true);
      return;
    }
    if (integration.id === 'discord') {
      void refreshSimpleStatus('discord', setDiscordExisting);
      setDiscordModalOpen(true);
      return;
    }
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

  const integrations = (apiConnectors && apiConnectors.length > 0
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
    : allIntegrations
  ).map((app): Integration => {
    // Shopify status is sourced from /api/integrations/shopify/status (the
    // OAuth-installed connector), not from the static fallback list. So the
    // card's "Connect / Manage" label and pill match what the merchant has
    // actually set up.
    if (app.id === 'shopify') {
      return { ...app, status: shopifyExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'stripe') {
      return { ...app, status: stripeExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'gmail') {
      return { ...app, status: gmailExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'twilio') {
      return { ...app, status: twilioExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'whatsapp') {
      return { ...app, status: whatsappExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'outlook') {
      return { ...app, status: outlookExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'paypal') {
      return { ...app, status: paypalExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'messenger') {
      return { ...app, status: messengerExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'instagram') {
      return { ...app, status: instagramExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'telegram') {
      return { ...app, status: telegramExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'postmark') {
      return { ...app, status: postmarkExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'ups') {
      return { ...app, status: upsExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'dhl') {
      return { ...app, status: dhlExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'salesforce') {
      return { ...app, status: salesforceExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'hubspot') {
      return { ...app, status: hubspotExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'slack') {
      return { ...app, status: slackExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'zendesk') {
      return { ...app, status: zendeskExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'intercom') {
      return { ...app, status: intercomExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'notion') {
      return { ...app, status: notionExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'woocommerce') {
      return { ...app, status: wooExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'calendly') {
      return { ...app, status: calendlyExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'teams') {
      return { ...app, status: teamsExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'linear') {
      return { ...app, status: linearExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'jira') {
      return { ...app, status: jiraExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'confluence') {
      return { ...app, status: confluenceExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'github') {
      return { ...app, status: githubExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'front') {
      return { ...app, status: frontExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'aircall') {
      return { ...app, status: aircallExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'gcalendar') {
      return { ...app, status: gcalendarExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'gdrive') {
      return { ...app, status: gdriveExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'zoom') {
      return { ...app, status: zoomExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'asana') {
      return { ...app, status: asanaExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'pipedrive') {
      return { ...app, status: pipedriveExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'mailchimp') {
      return { ...app, status: mailchimpExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'klaviyo') {
      return { ...app, status: klaviyoExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'segment') {
      return { ...app, status: segmentExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'quickbooks') {
      return { ...app, status: quickbooksExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'docusign') {
      return { ...app, status: docusignExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'sentry') {
      return { ...app, status: sentryExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'plaid') {
      return { ...app, status: plaidExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'gitlab') {
      return { ...app, status: gitlabExisting ? 'Connected' : 'Not Connected' };
    }
    if (app.id === 'discord') {
      return { ...app, status: discordExisting ? 'Connected' : 'Not Connected' };
    }
    return app;
  });

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
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-card text-white ${integrationBgClass(integration.id) || integration.color}`}>
        <IntegrationLogo id={integration.id} size={32} />
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
        
        {/* OAuth connect button for supported systems */}
        {OAUTH_SYSTEMS.has(integration.id) &&
         integration.status !== 'Connected' &&
         integration.status !== 'Syncing' ? (
          <button
            onClick={() => void handleOAuthConnect(integration.id)}
            disabled={oauthStatus[integration.id] === 'connecting'}
            className="flex items-center gap-2 text-sm font-semibold px-5 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-card min-w-[160px] disabled:opacity-60"
          >
            <span className="text-base font-bold w-4 text-center">{OAUTH_ICON[integration.id]}</span>
            {oauthStatus[integration.id] === 'connecting'
              ? 'Opening…'
              : OAUTH_BUTTON_LABEL[integration.id] ?? 'Connect'}
          </button>
        ) : (
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
        )}
      </div>
    </div>
  );

  const renderMiniCard = (app: Integration) => (
    <div key={app.id} onClick={() => openConfigModal(app)} className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200/80 dark:border-gray-700 shadow-card p-5 flex items-center gap-4 group hover:shadow-md transition-all cursor-pointer">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-white shadow-card ring-1 ring-white/20 ${integrationBgClass(app.id) || app.color}`}>
        <IntegrationLogo id={app.id} size={24} />
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

      {/* Shopify dedicated connect modal (OAuth-first with manual fallback) */}
      <ShopifyConnectModal
        open={shopifyModalOpen}
        onClose={() => setShopifyModalOpen(false)}
        onChanged={() => {
          void refreshShopifyStatus();
          refetch();
        }}
        existing={shopifyExisting}
      />

      {/* Stripe dedicated connect modal */}
      <StripeConnectModal
        open={stripeModalOpen}
        onClose={() => setStripeModalOpen(false)}
        onChanged={() => {
          void refreshStripeStatus();
          refetch();
        }}
        existing={stripeExisting}
      />

      {/* Gmail dedicated connect modal (Google OAuth, Pub/Sub real-time) */}
      <GmailConnectModal
        open={gmailModalOpen}
        onClose={() => setGmailModalOpen(false)}
        onChanged={() => {
          void refreshGmailStatus();
          refetch();
        }}
        existing={gmailExisting}
      />

      {/* Twilio dedicated connect modal (SMS + WhatsApp Business via Twilio) */}
      <TwilioConnectModal
        open={twilioModalOpen}
        onClose={() => setTwilioModalOpen(false)}
        onChanged={() => {
          void refreshTwilioStatus();
          refetch();
        }}
        existing={twilioExisting}
      />

      {/* WhatsApp dedicated connect modal (Meta Cloud API direct, independent from Twilio) */}
      <WhatsAppConnectModal
        open={whatsappModalOpen}
        onClose={() => setWhatsappModalOpen(false)}
        onChanged={() => {
          void refreshWhatsAppStatus();
          refetch();
        }}
        existing={whatsappExisting}
      />

      {/* Outlook / Microsoft 365 dedicated connect modal */}
      <OutlookConnectModal
        open={outlookModalOpen}
        onClose={() => setOutlookModalOpen(false)}
        onChanged={() => {
          void refreshOutlookStatus();
          refetch();
        }}
        existing={outlookExisting}
      />

      {/* PayPal dedicated connect modal */}
      <PayPalConnectModal
        open={paypalModalOpen}
        onClose={() => setPaypalModalOpen(false)}
        onChanged={() => {
          void refreshPayPalStatus();
          refetch();
        }}
        existing={paypalExisting}
      />

      {/* Inbox channels: Messenger / Instagram / Telegram */}
      <MessengerConnectModal
        open={messengerModalOpen}
        onClose={() => setMessengerModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('messenger', setMessengerExisting); refetch(); }}
        existing={messengerExisting}
      />
      <InstagramConnectModal
        open={instagramModalOpen}
        onClose={() => setInstagramModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('instagram', setInstagramExisting); refetch(); }}
        existing={instagramExisting}
      />
      <TelegramConnectModal
        open={telegramModalOpen}
        onClose={() => setTelegramModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('telegram', setTelegramExisting); refetch(); }}
        existing={telegramExisting}
      />
      <PostmarkConnectModal
        open={postmarkModalOpen}
        onClose={() => setPostmarkModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('postmark', setPostmarkExisting); refetch(); }}
        existing={postmarkExisting}
      />
      <UPSConnectModal
        open={upsModalOpen}
        onClose={() => setUpsModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('ups', setUpsExisting); refetch(); }}
        existing={upsExisting}
      />
      <DHLConnectModal
        open={dhlModalOpen}
        onClose={() => setDhlModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('dhl', setDhlExisting); refetch(); }}
        existing={dhlExisting}
      />
      <SalesforceConnectModal
        open={salesforceModalOpen}
        onClose={() => setSalesforceModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('salesforce', setSalesforceExisting); refetch(); }}
        existing={salesforceExisting}
      />
      <HubSpotConnectModal
        open={hubspotModalOpen}
        onClose={() => setHubspotModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('hubspot', setHubspotExisting); refetch(); }}
        existing={hubspotExisting}
      />
      <SlackConnectModal
        open={slackModalOpen}
        onClose={() => setSlackModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('slack', setSlackExisting); refetch(); }}
        existing={slackExisting}
      />
      <ZendeskConnectModal
        open={zendeskModalOpen}
        onClose={() => setZendeskModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('zendesk', setZendeskExisting); refetch(); }}
        existing={zendeskExisting}
      />
      <IntercomConnectModal
        open={intercomModalOpen}
        onClose={() => setIntercomModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('intercom', setIntercomExisting); refetch(); }}
        existing={intercomExisting}
      />
      <NotionConnectModal
        open={notionModalOpen}
        onClose={() => setNotionModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('notion', setNotionExisting); refetch(); }}
        existing={notionExisting}
      />
      <WooCommerceConnectModal
        open={wooModalOpen}
        onClose={() => setWooModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('woocommerce', setWooExisting); refetch(); }}
        existing={wooExisting}
      />
      <CalendlyConnectModal
        open={calendlyModalOpen}
        onClose={() => setCalendlyModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('calendly', setCalendlyExisting); refetch(); }}
        existing={calendlyExisting}
      />
      <TeamsConnectModal
        open={teamsModalOpen}
        onClose={() => setTeamsModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('teams', setTeamsExisting); refetch(); }}
        existing={teamsExisting}
      />
      <LinearConnectModal
        open={linearModalOpen}
        onClose={() => setLinearModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('linear', setLinearExisting); refetch(); }}
        existing={linearExisting}
      />
      <JiraConnectModal
        open={jiraModalOpen}
        onClose={() => setJiraModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('jira', setJiraExisting); refetch(); }}
        existing={jiraExisting}
      />
      <ConfluenceConnectModal
        open={confluenceModalOpen}
        onClose={() => setConfluenceModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('confluence', setConfluenceExisting); refetch(); }}
        existing={confluenceExisting}
      />
      <GitHubConnectModal
        open={githubModalOpen}
        onClose={() => setGithubModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('github', setGithubExisting); refetch(); }}
        existing={githubExisting}
      />
      <FrontConnectModal
        open={frontModalOpen}
        onClose={() => setFrontModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('front', setFrontExisting); refetch(); }}
        existing={frontExisting}
      />
      <AircallConnectModal
        open={aircallModalOpen}
        onClose={() => setAircallModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('aircall', setAircallExisting); refetch(); }}
        existing={aircallExisting}
      />
      <GCalendarConnectModal
        open={gcalendarModalOpen}
        onClose={() => setGcalendarModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('gcalendar', setGcalendarExisting); refetch(); }}
        existing={gcalendarExisting}
      />
      <GDriveConnectModal
        open={gdriveModalOpen}
        onClose={() => setGdriveModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('gdrive', setGdriveExisting); refetch(); }}
        existing={gdriveExisting}
      />
      <ZoomConnectModal
        open={zoomModalOpen}
        onClose={() => setZoomModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('zoom', setZoomExisting); refetch(); }}
        existing={zoomExisting}
      />
      <AsanaConnectModal
        open={asanaModalOpen}
        onClose={() => setAsanaModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('asana', setAsanaExisting); refetch(); }}
        existing={asanaExisting}
      />
      <PipedriveConnectModal
        open={pipedriveModalOpen}
        onClose={() => setPipedriveModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('pipedrive', setPipedriveExisting); refetch(); }}
        existing={pipedriveExisting}
      />
      <MailchimpConnectModal
        open={mailchimpModalOpen}
        onClose={() => setMailchimpModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('mailchimp', setMailchimpExisting); refetch(); }}
        existing={mailchimpExisting}
      />
      <KlaviyoConnectModal
        open={klaviyoModalOpen}
        onClose={() => setKlaviyoModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('klaviyo', setKlaviyoExisting); refetch(); }}
        existing={klaviyoExisting}
      />
      <SegmentConnectModal
        open={segmentModalOpen}
        onClose={() => setSegmentModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('segment', setSegmentExisting); refetch(); }}
        existing={segmentExisting}
      />
      <QuickBooksConnectModal
        open={quickbooksModalOpen}
        onClose={() => setQuickbooksModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('quickbooks', setQuickbooksExisting); refetch(); }}
        existing={quickbooksExisting}
      />
      <DocuSignConnectModal
        open={docusignModalOpen}
        onClose={() => setDocusignModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('docusign', setDocusignExisting); refetch(); }}
        existing={docusignExisting}
      />
      <SentryConnectModal
        open={sentryModalOpen}
        onClose={() => setSentryModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('sentry', setSentryExisting); refetch(); }}
        existing={sentryExisting}
      />
      <PlaidConnectModal
        open={plaidModalOpen}
        onClose={() => setPlaidModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('plaid', setPlaidExisting); refetch(); }}
        existing={plaidExisting}
      />
      <GitLabConnectModal
        open={gitlabModalOpen}
        onClose={() => setGitlabModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('gitlab', setGitlabExisting); refetch(); }}
        existing={gitlabExisting}
      />
      <DiscordConnectModal
        open={discordModalOpen}
        onClose={() => setDiscordModalOpen(false)}
        onChanged={() => { void refreshSimpleStatus('discord', setDiscordExisting); refetch(); }}
        existing={discordExisting}
      />

      {/* OAuth callback toasts (stacked) */}
      {shopifyToast ? (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-800 shadow-2xl dark:border-emerald-800/40 dark:bg-[#171717] dark:text-emerald-200">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {shopifyToast}
        </div>
      ) : null}
      {stripeToast ? (
        <div className="fixed right-6 z-50 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-800 shadow-2xl dark:border-emerald-800/40 dark:bg-[#171717] dark:text-emerald-200" style={{ bottom: shopifyToast ? '5.5rem' : '1.5rem' }}>
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {stripeToast}
        </div>
      ) : null}
      {gmailToast ? (
        <div
          className="fixed right-6 z-50 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-800 shadow-2xl dark:border-emerald-800/40 dark:bg-[#171717] dark:text-emerald-200"
          style={{ bottom: (shopifyToast ? 1 : 0) * 88 + (stripeToast ? 1 : 0) * 88 + 24 + 'px' }}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {gmailToast}
        </div>
      ) : null}
      {outlookToast ? (
        <div
          className="fixed right-6 z-50 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-800 shadow-2xl dark:border-emerald-800/40 dark:bg-[#171717] dark:text-emerald-200"
          style={{ bottom: ((shopifyToast ? 1 : 0) + (stripeToast ? 1 : 0) + (gmailToast ? 1 : 0)) * 88 + 24 + 'px' }}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {outlookToast}
        </div>
      ) : null}
    </div>
  );
}
