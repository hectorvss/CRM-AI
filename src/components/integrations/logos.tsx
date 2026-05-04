/**
 * src/components/integrations/logos.tsx
 *
 * Original brand logos for every integration in the catalog.
 *
 * Strategy: we use https://cdn.simpleicons.org/<slug>/<hex> which serves
 * the official brand SVG with the brand colour baked in, MIT-licensed,
 * 3000+ brands. Each logo is rendered as an <img>; we pass it
 * background-less inside the colored card and on a white tile inside the
 * modal header.
 *
 * Where Simple Icons doesn't have the brand or the icon doesn't read well
 * at small sizes (e.g. UPS, Postmark, custom-app), we fall back to a
 * Material Symbols glyph kept from the previous design.
 */

import React from 'react';

// Map: integration id -> Simple Icons slug + brand hex (no #).
// When both `slug` and `hex` are present we render the cdn.simpleicons.org SVG.
// When `materialIcon` is present we render a Material Symbols glyph.
// `bg` is the card chip background (Tailwind class).
export interface IntegrationLogoSpec {
  slug?: string;          // simpleicons slug (e.g. 'shopify')
  hex?: string;           // brand color hex (no '#'), used as <img color>
  materialIcon?: string;  // Material Symbols glyph name when SVG isn't used
  bg: string;             // Tailwind bg class for the chip
  fg?: string;            // Tailwind text class for material glyph (default white)
  // Whether to render the SVG as monochrome white over the brand bg.
  // Useful when the SVG would clash with its own bg (e.g. Stripe purple on purple).
  monochromeWhite?: boolean;
}

export const INTEGRATION_LOGOS: Record<string, IntegrationLogoSpec> = {
  // Support
  zendesk:    { slug: 'zendesk',     hex: '03363D', bg: 'bg-emerald-700',  monochromeWhite: true },
  intercom:   { slug: 'intercom',    hex: '6AFDEF', bg: 'bg-blue-600',     monochromeWhite: true },
  gorgias:    { materialIcon: 'headset_mic', bg: 'bg-indigo-500' },
  freshdesk:  { slug: 'freshworks',  hex: 'FF5A1F', bg: 'bg-orange-500',   monochromeWhite: true },
  helpscout:  { slug: 'helpscout',   hex: '1292EE', bg: 'bg-blue-400',     monochromeWhite: true },
  front:      { slug: 'front',       hex: 'A857F0', bg: 'bg-violet-600',   monochromeWhite: true },

  // Commerce
  shopify:     { slug: 'shopify',     hex: '7AB55C', bg: 'bg-green-600',    monochromeWhite: true },
  woocommerce: { slug: 'woocommerce', hex: '96588A', bg: 'bg-purple-600',   monochromeWhite: true },
  bigcommerce: { slug: 'bigcommerce', hex: '121118', bg: 'bg-gray-800',     monochromeWhite: true },
  stripe:      { slug: 'stripe',      hex: '635BFF', bg: 'bg-indigo-600',   monochromeWhite: true },
  paypal:      { slug: 'paypal',      hex: '003087', bg: 'bg-blue-700',     monochromeWhite: true },
  adyen:       { slug: 'adyen',       hex: '0ABF53', bg: 'bg-green-500',    monochromeWhite: true },
  recharge:    { materialIcon: 'autorenew', bg: 'bg-teal-500' },
  loopreturns: { materialIcon: 'keyboard_return', bg: 'bg-gray-900' },
  shipstation: { materialIcon: 'local_shipping', bg: 'bg-green-700' },
  aftership:   { materialIcon: 'share_location', bg: 'bg-yellow-600' },

  // Communication
  slack:     { slug: 'slack',     hex: '4A154B', bg: 'bg-purple-700', monochromeWhite: true },
  teams:     { slug: 'microsoftteams', hex: '6264A7', bg: 'bg-indigo-700', monochromeWhite: true },
  whatsapp:  { slug: 'whatsapp',  hex: '25D366', bg: 'bg-green-500',   monochromeWhite: true },
  messenger: { slug: 'messenger', hex: '00B2FF', bg: 'bg-blue-500',    monochromeWhite: true },
  instagram: { slug: 'instagram', hex: 'E4405F', bg: 'bg-pink-500',    monochromeWhite: true },
  telegram:  { slug: 'telegram',  hex: '26A5E4', bg: 'bg-sky-500',     monochromeWhite: true },
  gmail:     { slug: 'gmail',     hex: 'EA4335', bg: 'bg-red-500',     monochromeWhite: true },
  outlook:   { slug: 'maildotru', hex: '0078D4', bg: 'bg-blue-600',    monochromeWhite: true }, // (no Outlook slug → use generic mail Material)
  twilio:    { slug: 'twilio',    hex: 'F22F46', bg: 'bg-red-600',     monochromeWhite: true },
  postmark:  { materialIcon: 'mail', bg: 'bg-amber-500' },
  aircall:   { slug: 'aircall',   hex: '00B388', bg: 'bg-emerald-600', monochromeWhite: true },
  mailchimp: { slug: 'mailchimp', hex: 'FFE01B', bg: 'bg-yellow-400',  fg: 'text-black' },
  klaviyo:   { slug: 'klaviyo',   hex: '000000', bg: 'bg-black',       monochromeWhite: true },
  discord:   { slug: 'discord',   hex: '5865F2', bg: 'bg-indigo-500',  monochromeWhite: true },

  // Shipping (commerce category)
  ups: { slug: 'ups', hex: '521801', bg: 'bg-amber-700', monochromeWhite: true },
  dhl: { slug: 'dhl', hex: 'FFCC00', bg: 'bg-yellow-500', fg: 'text-black' },

  // CRM
  hubspot:    { slug: 'hubspot',    hex: 'FF7A59', bg: 'bg-orange-500',  monochromeWhite: true },
  salesforce: { slug: 'salesforce', hex: '00A1E0', bg: 'bg-blue-500',    monochromeWhite: true },
  pipedrive:  { slug: 'pipedrive',  hex: '1A1A1A', bg: 'bg-green-600',   monochromeWhite: true },
  docusign:   { slug: 'docusign',   hex: 'FFCC22', bg: 'bg-yellow-500',  fg: 'text-black' },

  // Knowledge
  notion:     { slug: 'notion',     hex: '000000', bg: 'bg-gray-900',    monochromeWhite: true },
  gdrive:     { slug: 'googledrive', hex: '4285F4', bg: 'bg-blue-500',   monochromeWhite: true },
  confluence: { slug: 'confluence', hex: '172B4D', bg: 'bg-blue-600',    monochromeWhite: true },

  // Productivity
  jira:       { slug: 'jira',     hex: '0052CC', bg: 'bg-blue-600',     monochromeWhite: true },
  linear:     { slug: 'linear',   hex: '5E6AD2', bg: 'bg-indigo-600',   monochromeWhite: true },
  github:     { slug: 'github',   hex: '181717', bg: 'bg-gray-900',     monochromeWhite: true },
  gitlab:     { slug: 'gitlab',   hex: 'FC6D26', bg: 'bg-orange-600',   monochromeWhite: true },
  asana:      { slug: 'asana',    hex: 'F06A6A', bg: 'bg-rose-500',     monochromeWhite: true },
  calendly:   { slug: 'calendly', hex: '006BFF', bg: 'bg-blue-600',     monochromeWhite: true },
  gcalendar:  { slug: 'googlecalendar', hex: '4285F4', bg: 'bg-blue-500', monochromeWhite: true },
  zoom:       { slug: 'zoom',     hex: '0B5CFF', bg: 'bg-sky-600',      monochromeWhite: true },
  sentry:     { slug: 'sentry',   hex: '362D59', bg: 'bg-purple-700',   monochromeWhite: true },

  // Commerce / Finance
  quickbooks: { slug: 'quickbooks', hex: '2CA01C', bg: 'bg-emerald-700', monochromeWhite: true },
  plaid:      { slug: 'plaid',      hex: '111111', bg: 'bg-slate-900',  monochromeWhite: true },

  // Automation
  segment:   { slug: 'segment',  hex: '52BD95', bg: 'bg-emerald-500',  monochromeWhite: true },
  zapier:    { slug: 'zapier',   hex: 'FF4F00', bg: 'bg-orange-600',   monochromeWhite: true },
  customapp: { materialIcon: 'webhook', bg: 'bg-gray-800' },

  // AI providers
  anthropic: { slug: 'anthropic', hex: 'D97757', bg: 'bg-orange-800',  monochromeWhite: true },
  openai:    { slug: 'openai',    hex: '412991', bg: 'bg-violet-700',  monochromeWhite: true },
  ollama:    { slug: 'ollama',    hex: 'FFFFFF', bg: 'bg-gray-700',    monochromeWhite: true },
  gemini:    { slug: 'googlegemini', hex: '8E75B2', bg: 'bg-violet-500', monochromeWhite: true },
};

interface LogoProps {
  id: string;
  size?: number;     // px (default 24)
  className?: string;
}

/**
 * Render an integration's logo as an <img> (Simple Icons CDN) or a
 * Material Symbols glyph. Designed to sit inside a colored chip.
 */
export function IntegrationLogo({ id, size = 24, className = '' }: LogoProps) {
  const spec = INTEGRATION_LOGOS[id];
  if (!spec) {
    // Unknown id — render a generic puzzle icon.
    return <span className={`material-symbols-outlined text-white ${className}`} style={{ fontSize: `${size}px` }} aria-hidden>extension</span>;
  }

  if (spec.slug) {
    // Use white when the chip bg is the brand color (default) so the SVG reads.
    const colour = spec.monochromeWhite ? 'ffffff' : spec.hex ?? 'ffffff';
    const url = `https://cdn.simpleicons.org/${spec.slug}/${colour}`;
    return (
      <img
        src={url}
        alt={`${id} logo`}
        width={size}
        height={size}
        className={`select-none ${className}`}
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    );
  }

  return (
    <span
      className={`material-symbols-outlined ${spec.fg ?? 'text-white'} ${className}`}
      style={{ fontSize: `${size}px` }}
      aria-hidden
    >
      {spec.materialIcon ?? 'extension'}
    </span>
  );
}

/** Resolve the chip background class for an integration. */
export function integrationBgClass(id: string): string {
  return INTEGRATION_LOGOS[id]?.bg ?? 'bg-gray-700';
}
