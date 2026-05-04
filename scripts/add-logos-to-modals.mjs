/**
 * Bulk-update integration modal headers to use IntegrationLogo + brand bg.
 *
 * For each *ConnectModal.tsx in src/components/integrations:
 *   - Map filename to integration id (lowercased, drop "ConnectModal").
 *   - Add `import { IntegrationLogo } from './logos';` if missing.
 *   - Replace the chip's `<span className="material-symbols-outlined text-[22px]">XXX</span>`
 *     with `<IntegrationLogo id="<id>" size={22} />`.
 *
 * Idempotent — re-running is a no-op once the modal already imports IntegrationLogo.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODAL_DIR = path.join(__dirname, '..', 'src', 'components', 'integrations');

// Filename -> catalog id. Most map by lowercasing the prefix; a few exceptions.
const MAP = {
  ShopifyConnectModal: 'shopify',
  StripeConnectModal: 'stripe',
  GmailConnectModal: 'gmail',
  TwilioConnectModal: 'twilio',
  WhatsAppConnectModal: 'whatsapp',
  OutlookConnectModal: 'outlook',
  PayPalConnectModal: 'paypal',
  MessengerConnectModal: 'messenger',
  InstagramConnectModal: 'instagram',
  TelegramConnectModal: 'telegram',
  PostmarkConnectModal: 'postmark',
  UPSConnectModal: 'ups',
  DHLConnectModal: 'dhl',
  SalesforceConnectModal: 'salesforce',
  HubSpotConnectModal: 'hubspot',
  SlackConnectModal: 'slack',
  ZendeskConnectModal: 'zendesk',
  IntercomConnectModal: 'intercom',
  NotionConnectModal: 'notion',
  WooCommerceConnectModal: 'woocommerce',
  CalendlyConnectModal: 'calendly',
  TeamsConnectModal: 'teams',
  LinearConnectModal: 'linear',
  JiraConnectModal: 'jira',
  ConfluenceConnectModal: 'confluence',
  GitHubConnectModal: 'github',
  FrontConnectModal: 'front',
  AircallConnectModal: 'aircall',
  GCalendarConnectModal: 'gcalendar',
  GDriveConnectModal: 'gdrive',
  ZoomConnectModal: 'zoom',
  AsanaConnectModal: 'asana',
  PipedriveConnectModal: 'pipedrive',
  MailchimpConnectModal: 'mailchimp',
  KlaviyoConnectModal: 'klaviyo',
  SegmentConnectModal: 'segment',
  QuickBooksConnectModal: 'quickbooks',
  DocuSignConnectModal: 'docusign',
  SentryConnectModal: 'sentry',
  PlaidConnectModal: 'plaid',
  GitLabConnectModal: 'gitlab',
  DiscordConnectModal: 'discord',
};

async function processFile(filename, integrationId) {
  const file = path.join(MODAL_DIR, filename + '.tsx');
  let src;
  try { src = await fs.readFile(file, 'utf8'); }
  catch { console.warn(`skip: ${filename} not found`); return false; }

  let changed = false;

  // 1. Add import if missing.
  if (!/from\s+['"]\.\/logos['"]/.test(src)) {
    // Place after the last existing import in the file.
    const m = src.match(/(^import[^\n]+\n)+/m);
    if (m) {
      const insertAt = m.index + m[0].length;
      src = src.slice(0, insertAt) + `import { IntegrationLogo } from './logos';\n` + src.slice(insertAt);
      changed = true;
    }
  }

  // 2. Replace the header chip's material icon span. Match flexibly:
  //    <span className="material-symbols-outlined text-[22px]">SOMETHING</span>
  //    Only the FIRST occurrence (the header chip) — body sections may have
  //    other icons we leave alone.
  const chipRe = /<span className="material-symbols-outlined text-\[22px\]">[^<]+<\/span>/;
  if (chipRe.test(src)) {
    src = src.replace(chipRe, `<IntegrationLogo id="${integrationId}" size={22} />`);
    changed = true;
  }

  if (changed) {
    await fs.writeFile(file, src, 'utf8');
    console.log(`✔ ${filename} → id="${integrationId}"`);
    return true;
  }
  console.log(`= ${filename} (no changes)`);
  return false;
}

(async () => {
  let touched = 0;
  for (const [filename, id] of Object.entries(MAP)) {
    if (await processFile(filename, id)) touched++;
  }
  console.log(`\n${touched}/${Object.keys(MAP).length} modals updated.`);
})();
