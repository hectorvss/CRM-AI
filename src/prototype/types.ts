// ─────────────────────────────────────────────────────────────────────────────
// Shared types for the Clain prototype
// Extracted from the monolithic Prototype.tsx (auto-split, behavior-preserving).
// ─────────────────────────────────────────────────────────────────────────────

import { type ReactNode } from 'react';


export type View = 'superAgent' | 'inbox' | 'contacts' | 'allLeads' | 'settings' | 'imports' | 'personal' | 'security' | 'notifications' | 'visible' | 'tokens' | 'accountAccess' | 'multilingual' | 'assignments' | 'macros' | 'tickets' | 'sla' | 'aiInbox' | 'automation' | 'appStore' | 'connectors' | 'labels' | 'people' | 'companies' | 'workspaceSecurity' | 'workspaceMultilingual' | 'workspaceHours' | 'workspaceBrands' | 'billing' | 'messenger' | 'email' | 'phone' | 'whatsapp' | 'discord' | 'sms' | 'social' | 'allChannels' | 'inboxTeam' | 'fin' | 'knowledge' | 'reports' | 'outbound' | 'workspaceGeneral' | 'workspaceTeammates' | 'auth' | 'developer' | 'customObjects' | 'topics' | 'switchChannel' | 'slackChannel' | 'helpCenter' | 'featuresComparison' | 'billingPlans' | 'cannedResponses' | 'customFilters' | 'emailTemplates' | 'customRoles' | 'aiFeedback' | 'callsLive' | 'mcpServers' | 'agentChat' | 'audiences' | 'finSettings' | 'dataConversaciones' | 'clainHub' | 'webAnalytics';

// Icon Library (Figma node 1-85798) — 47 variantes de Component 1, 13 components con variants/hover
// Cada variante es una composición SVG distinta. Se extraen on-demand vía nodeIds:
//   variant=1  → 1:85189   variant=2  → 1:85194   variant=3  → 1:85197   ...
//   variant=45 → 1:85328   variant=46 → 1:85331   variant=47 → 1:85334
// Para añadir un icono nuevo: pedir get_design_context del nodeId correspondiente, sumar
// las URLs al ICON_LIBRARY map y usar <LibraryIcon v="N" /> donde haga falta.
// LibraryV2 (file QhrV4aBbAAqTxgWhaK8hGP, node 3-23460) — 91 variantes Component 1
// Para identificarlos: ir a `?icons=v2` en el navegador, ver cuál es cada uno
export type IconVariant = '1' | '2' | '45'
  | 'v2-1' | 'v2-2' | 'v2-3' | 'v2-4' | 'v2-5' | 'v2-6' | 'v2-7' | 'v2-8' | 'v2-9' | 'v2-10'
  | 'v2-11' | 'v2-12' | 'v2-13' | 'v2-14' | 'v2-15' | 'v2-16' | 'v2-17' | 'v2-18' | 'v2-19' | 'v2-20'
  | 'v2-21' | 'v2-22' | 'v2-23' | 'v2-24' | 'v2-25' | 'v2-26' | 'v2-27' | 'v2-28' | 'v2-29' | 'v2-30'
  | 'v2-31' | 'v2-32' | 'v2-33' | 'v2-34' | 'v2-35' | 'v2-36' | 'v2-37' | 'v2-38' | 'v2-39' | 'v2-40'
  | 'v2-41' | 'v2-42' | 'v2-43' | 'v2-44' | 'v2-45' | 'v2-46' | 'v2-47' | 'v2-48' | 'v2-49' | 'v2-50'
  | 'v2-51' | 'v2-52' | 'v2-53' | 'v2-54' | 'v2-55' | 'v2-56' | 'v2-57' | 'v2-58' | 'v2-59' | 'v2-60'
  | 'v2-61' | 'v2-62' | 'v2-63' | 'v2-64' | 'v2-65' | 'v2-66' | 'v2-67' | 'v2-68' | 'v2-69' | 'v2-70'
  | 'v2-71' | 'v2-72' | 'v2-73' | 'v2-74' | 'v2-75' | 'v2-76' | 'v2-77' | 'v2-78' | 'v2-79' | 'v2-80'
  | 'v2-81' | 'v2-82' | 'v2-83' | 'v2-84' | 'v2-85' | 'v2-86' | 'v2-87' | 'v2-88' | 'v2-89' | 'v2-90'
  | 'v2-91';

export type Conversation = {
  id: string;
  channel: string;
  preview: string;
  time: string;
  avatarColor: string;
  avatarLetter: string;
  active?: boolean;
  customerName?: string;
  customerEmail?: string;
  company?: string;
  status?: string;
  priority?: string;
  riskLevel?: string;
  assignee?: string;
  team?: string;
  caseNumber?: string;
  tags?: string[];
  orderId?: string;
  sourceChannel?: string;
  aiSummary?: string;
  resolvedBy?: string | null;
  approvalState?: string;
  approvalRequestId?: string | null;
  aiHandled?: boolean;
  raw?: any;
};

// ─────────────────────────────────────────────────────────────────────────────
// Dropdown — single reusable popover-menu component used in place of native
// <select> across the prototype. Matches the design ref the user shared:
// rounded card, optional left icon, optional right-aligned keyboard
// shortcut, optional divider before an item, optional danger styling.
//
// Usage:
//   <Dropdown
//     value={typeFilter}
//     onChange={setTypeFilter}
//     items={[
//       { value: 'any',     label: 'Tipo: cualquiera' },
//       { value: 'article', label: 'Artículo' },
//       { value: 'policy',  label: 'Política' },
//     ]}
//   />
//
// For action menus (no value, just buttons) pass items with a `onSelect`
// override or use the generic `onChange` callback (each item's value is
// just the id of the action that fires).
// ─────────────────────────────────────────────────────────────────────────────
export type DropdownItem = {
  value: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  divider?: boolean;
  disabled?: boolean;
};

export type Attachment = { id: string; name: string; size: number; type: string; dataUrl?: string; url?: string };
export type Message = {
  id: string; from: "user" | "agent" | "bot"; text: string; time: string;
  senderName?: string; attachments?: Attachment[];
  /** Fin AI Agent metadata (docs/fin-ai-agent-spec.md): private drafts carry
   *  send/discard actions in the inbox; confidence/citations feed answer inspection. */
  isFinDraft?: boolean;
  confidence?: number | null;
  citations?: string[];
};

// â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type AgentMode = 'auto' | 'product_analytics' | 'sql' | 'session_replay' | 'error_tracking' | 'surveys' | 'flags' | 'llm_analytics';
