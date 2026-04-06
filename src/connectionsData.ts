export const connectionCategories = [
  {
    category: 'ORCHESTRATION',
    agents: [
      {
        name: 'Supervisor',
        icon: 'account_tree', iconColor: 'text-purple-600', locked: true, active: true,
        role: 'Orchestrates the overall agent flow',
        summary: 'Reads from 3 sources · Reports to 5 agents · 4 steps',
        receivesFrom: ['Intent Router', 'Context Window', 'Tool execution results'],
        uses: ['current case context', 'routing state', 'system orchestration state'],
        does: ['decides which specialized agent should act next', 'manages agent hand-offs', 'keeps the flow coherent'],
        reportsTo: ['Reconciliation Agent', 'Knowledge Retriever', 'Customer Communication Agent', 'Helpdesk Agent', 'other specialized agents depending on intent'],
        writesTo: ['routing / orchestration state only'],
        blockedBy: ['no valid route', 'missing intent confidence', 'upstream context incomplete'],
        steps: [
          { num: 1, title: 'Receive routing context', desc: 'Receives from Intent Router', output: 'Routing state', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Evaluate next best specialist', desc: 'Uses current case context', output: 'Target agent identified', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Hand off to target agent', desc: 'Passes context to target', output: 'Agent invoked', reportsTo: 'Target Agent', mode: 'Automatic' },
          { num: 4, title: 'Track orchestration state', desc: 'Writes to orchestration state', output: 'State updated', reportsTo: 'Audit Log', mode: 'Automatic' }
        ]
      },
      {
        name: 'Approval Gatekeeper',
        icon: 'approval_delegation', iconColor: 'text-indigo-600', active: true,
        role: 'Handles human approval requirements for high-risk actions',
        summary: 'Reads from 3 sources · Reports to 3 agents · 4 steps',
        receivesFrom: ['Case Resolution Planner', 'Resolution Executor', 'policy rules / thresholds'],
        uses: ['risk thresholds', 'confidence thresholds', 'action sensitivity rules'],
        does: ['intercepts high-risk actions', 'decides whether human approval is required', 'blocks execution until sign-off if needed'],
        reportsTo: ['Resolution Executor', 'SLA & Escalation Agent', 'Audit & Observability Agent'],
        writesTo: ['approval state', 'approval request record'],
        blockedBy: ['approval pending', 'approval rejected', 'threshold exceeded', 'low confidence'],
        steps: [
          { num: 1, title: 'Receive proposed action', desc: 'Receives from Case Resolution Planner', output: 'Action evaluated', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Evaluate approval requirement', desc: 'Uses risk thresholds', output: 'Approval decision', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Create approval gate', desc: 'Writes to approval state', output: 'Approval requested', reportsTo: 'Human Approver', mode: 'Approval-gated' },
          { num: 4, title: 'Release or block execution', desc: 'Based on approval result', output: 'Execution signal', reportsTo: 'Resolution Executor', mode: 'Automatic' }
        ]
      },
      {
        name: 'QA / Policy Check',
        icon: 'security', iconColor: 'text-blue-600', active: true,
        role: 'Performs pre-send / pre-execution safety, policy, and quality validation',
        summary: 'Reads from 3 sources · Reports to 3 agents · 4 steps',
        receivesFrom: ['Composer + Translator', 'Resolution Executor', 'Customer Communication Agent'],
        uses: ['policy rules', 'brand voice rules', 'restricted action rules', 'compliance constraints'],
        does: ['validates pre-send responses', 'validates pre-write actions', 'ensures compliance and safe execution packaging'],
        reportsTo: ['Customer Communication Agent', 'Resolution Executor', 'Approval Gatekeeper when escalation needed'],
        writesTo: ['validation result', 'compliance status'],
        blockedBy: ['restricted content', 'non-compliant action', 'unsafe execution package'],
        steps: [
          { num: 1, title: 'Receive draft/action candidate', desc: 'Receives from Composer or Executor', output: 'Candidate loaded', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Validate against policy and quality rules', desc: 'Uses policy rules', output: 'Validation check', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Return pass/fail result', desc: 'Writes to validation result', output: 'Pass/Fail', reportsTo: 'Requesting Agent', mode: 'Automatic' },
          { num: 4, title: 'Escalate if unsafe', desc: 'Reports to Approval Gatekeeper', output: 'Escalation', reportsTo: 'Approval Gatekeeper', mode: 'Automatic' }
        ]
      }
    ]
  },
  {
    category: 'INGEST & INTELLIGENCE',
    agents: [
      {
        name: 'Channel Ingest',
        icon: 'mail', iconColor: 'text-orange-600', active: true,
        role: 'Receives inbound channel events and converts them into normalized intake events.',
        summary: 'Reads from 4 sources · Reports to 1 agent · 4 steps',
        receivesFrom: ['Email', 'Web Chat', 'WhatsApp if enabled', 'inbound support channel events'],
        uses: ['channel payload', 'sender metadata', 'message body', 'timestamps'],
        does: ['converts raw inbound events into normalized intake events', 'captures first operational context'],
        reportsTo: ['Canonicalizer'],
        writesTo: ['intake event stream'],
        blockedBy: ['channel disabled', 'malformed inbound payload', 'authentication / delivery issue'],
        steps: [
          { num: 1, title: 'Receive raw inbound message', desc: 'Reads from Email/Chat', output: 'Raw payload', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Extract basic metadata', desc: 'Uses sender metadata', output: 'Extracted metadata', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Normalize channel event', desc: 'Converts to standard format', output: 'Normalized event', reportsTo: 'Self', mode: 'Automatic' },
          { num: 4, title: 'Pass to Canonicalizer', desc: 'Writes to intake stream', output: 'Intake event', reportsTo: 'Canonicalizer', mode: 'Automatic' }
        ]
      },
      {
        name: 'Canonicalizer',
        icon: 'cleaning_services', iconColor: 'text-emerald-600', active: true,
        role: 'Normalizes entities, fields, and event structure.',
        summary: 'Reads from 4 sources · Reports to 2 agents · 4 steps',
        receivesFrom: ['Channel Ingest', 'tool results', 'system events', 'webhook payloads'],
        uses: ['parsing logic', 'normalization rules', 'entity extraction logic'],
        does: ['standardizes customer, order, refund, payment, return, subscription, and channel data', 'creates canonical case context'],
        reportsTo: ['Intent Router', 'Reconciliation Agent when directly invoked'],
        writesTo: ['canonical context object'],
        blockedBy: ['missing required identifiers', 'malformed event', 'unparseable payload'],
        steps: [
          { num: 1, title: 'Receive raw event', desc: 'Reads from Channel Ingest', output: 'Raw event', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Extract structured entities', desc: 'Uses extraction logic', output: 'Entities', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Normalize fields and states', desc: 'Uses normalization rules', output: 'Standardized data', reportsTo: 'Self', mode: 'Automatic' },
          { num: 4, title: 'Output canonical context', desc: 'Writes to canonical context', output: 'Canonical context', reportsTo: 'Intent Router', mode: 'Automatic' }
        ]
      },
      {
        name: 'Intent Router',
        icon: 'split_scene', iconColor: 'text-cyan-600', active: true,
        role: 'Classifies the task and routes it to the correct next agent.',
        summary: 'Reads from 1 source · Reports to 5 agents · 4 steps',
        receivesFrom: ['Canonicalizer'],
        uses: ['intent classification', 'confidence scoring', 'routing schema'],
        does: ['determines task type', 'routes to the correct specialist agent'],
        reportsTo: ['Supervisor', 'Reconciliation Agent', 'Knowledge Retriever', 'Customer Communication Agent', 'Helpdesk Agent depending on intent'],
        writesTo: ['routing decision'],
        blockedBy: ['ambiguous task', 'low confidence classification', 'insufficient context'],
        steps: [
          { num: 1, title: 'Receive canonical context', desc: 'Reads from Canonicalizer', output: 'Context loaded', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Classify task type', desc: 'Uses intent classification', output: 'Task type', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Score confidence', desc: 'Uses confidence scoring', output: 'Confidence score', reportsTo: 'Self', mode: 'Automatic' },
          { num: 4, title: 'Emit routing decision', desc: 'Writes to routing decision', output: 'Route', reportsTo: 'Supervisor', mode: 'Automatic' }
        ]
      },
      {
        name: 'Knowledge Retriever',
        icon: 'menu_book', iconColor: 'text-amber-600', active: false,
        role: 'Fetches relevant policies, SOPs, and operational guidance.',
        summary: 'Reads from 4 sources · Reports to 4 agents · 4 steps',
        receivesFrom: ['Supervisor', 'Case Resolution Planner', 'QA / Policy Check', 'Customer Communication Agent'],
        uses: ['Knowledge module', 'policies', 'SOPs', 'playbooks', 'exceptions'],
        does: ['retrieves relevant operational and policy knowledge', 'provides context to planning, QA, and messaging'],
        reportsTo: ['Case Resolution Planner', 'QA / Policy Check', 'Customer Communication Agent', 'Composer + Translator'],
        writesTo: ['knowledge bundle / citations / policy context'],
        blockedBy: ['knowledge source missing', 'article not configured', 'stale or incomplete policy coverage'],
        steps: [
          { num: 1, title: 'Receive knowledge need', desc: 'Reads from requesting agent', output: 'Query intent', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Query relevant policies/SOPs', desc: 'Uses Knowledge module', output: 'Raw articles', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Return structured knowledge context', desc: 'Formats knowledge bundle', output: 'Structured knowledge', reportsTo: 'Self', mode: 'Automatic' },
          { num: 4, title: 'Pass to downstream consumer', desc: 'Writes to context', output: 'Context enriched', reportsTo: 'Requesting Agent', mode: 'Automatic' }
        ]
      },
      {
        name: 'Composer + Translator',
        icon: 'edit_note', iconColor: 'text-pink-600', active: true,
        role: 'Drafts and localizes internal and customer-facing messages.',
        summary: 'Reads from 3 sources · Reports to 3 agents · 4 steps',
        receivesFrom: ['Customer Communication Agent', 'Helpdesk Agent', 'Knowledge Retriever'],
        uses: ['approved context', 'policy guidance', 'tone rules', 'language preferences'],
        does: ['drafts customer-facing and internal messages', 'localizes and adapts communication'],
        reportsTo: ['QA / Policy Check', 'Helpdesk Agent', 'Customer Communication Agent'],
        writesTo: ['message draft', 'localized variants'],
        blockedBy: ['insufficient context', 'language preference missing', 'policy-dependent wording unresolved'],
        steps: [
          { num: 1, title: 'Receive communication objective', desc: 'Reads from Customer Comm Agent', output: 'Objective loaded', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Draft message', desc: 'Uses approved context', output: 'Raw draft', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Localize / adapt tone', desc: 'Uses language preferences', output: 'Localized draft', reportsTo: 'Self', mode: 'Automatic' },
          { num: 4, title: 'Return draft for QA or send pipeline', desc: 'Writes to message draft', output: 'Final draft', reportsTo: 'QA / Policy Check', mode: 'Automatic' }
        ]
      }
    ]
  },
  {
    category: 'RESOLUTION & RECONCILIATION',
    agents: [
      {
        name: 'Reconciliation Agent',
        icon: 'compare_arrows', iconColor: 'text-rose-600', locked: true, active: true,
        role: 'Detects contradictions across systems',
        summary: 'Reads from 9 sources · Reports to 3 agents · 5 steps',
        receivesFrom: ['Supervisor', 'Canonicalizer', 'Stripe Agent', 'Shopify Agent', 'OMS / ERP Agent', 'Returns Agent', 'CRM / Customer Identity Agent', 'Recharge / Subscription Agent', 'Logistics / Tracking Agent'],
        uses: ['system state comparisons', 'source-of-truth rules', 'contradiction detection logic', 'ID alignment data'],
        does: ['compares states across systems', 'detects contradictions', 'identifies broken operational domains', 'flags stale syncs, missing IDs, blocked downstream flows', 'opens conflict context for Resolve and Case Graph'],
        reportsTo: ['Case Resolution Planner', 'Audit & Observability Agent', 'SLA & Escalation Agent when critical'],
        writesTo: ['contradiction summary', 'conflict domain', 'source-of-truth comparison result'],
        blockedBy: ['connector missing', 'critical system unreadable', 'identity mapping unresolved', 'confidence too low'],
        steps: [
          { num: 1, title: 'Receive normalized case context', desc: 'Reads from Canonicalizer', output: 'Context loaded', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Pull relevant system states', desc: 'Reads from connected tools', output: 'System states', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Compare domain states', desc: 'Uses source-of-truth rules', output: 'Comparison result', reportsTo: 'Self', mode: 'Automatic' },
          { num: 4, title: 'Detect contradiction or healthy state', desc: 'Uses detection logic', output: 'Contradiction identified', reportsTo: 'Self', mode: 'Automatic' },
          { num: 5, title: 'Open structured conflict output', desc: 'Writes to contradiction summary', output: 'Conflict context', reportsTo: 'Case Resolution Planner', mode: 'Automatic' }
        ]
      },
      {
        name: 'Case Resolution Planner',
        icon: 'schema', iconColor: 'text-fuchsia-600', active: true,
        role: 'Converts detected contradictions into resolution plans',
        summary: 'Reads from 5 sources · Reports to 4 agents · 5 steps',
        receivesFrom: ['Reconciliation Agent', 'Knowledge Retriever', 'Approval Gatekeeper rules', 'CRM / Customer Identity Agent', 'Identity Mapping Agent'],
        uses: ['contradiction summary', 'source-of-truth rules', 'policy context', 'customer context', 'available integrations'],
        does: ['selects resolution path', 'defines AI vs manual vs approval-first', 'builds the step-by-step plan', 'estimates risk and expected final state'],
        reportsTo: ['Resolution Executor', 'Workflow Runtime Agent', 'Approval Gatekeeper', 'Customer Communication Agent'],
        writesTo: ['resolution strategy', 'execution plan', 'expected post-resolution state'],
        blockedBy: ['source of truth not defined', 'identity ambiguity', 'required system unavailable', 'policy conflict unresolved'],
        steps: [
          { num: 1, title: 'Receive contradiction package', desc: 'Reads from Reconciliation Agent', output: 'Package loaded', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Evaluate policy and risk', desc: 'Uses policy context', output: 'Risk assessment', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Select resolution strategy', desc: 'Uses source-of-truth rules', output: 'Strategy chosen', reportsTo: 'Self', mode: 'Automatic' },
          { num: 4, title: 'Build step-by-step plan', desc: 'Uses available integrations', output: 'Execution plan', reportsTo: 'Self', mode: 'Automatic' },
          { num: 5, title: 'Emit execution-ready plan', desc: 'Writes to execution plan', output: 'Plan ready', reportsTo: 'Resolution Executor', mode: 'Automatic' }
        ]
      },
      {
        name: 'Resolution Executor',
        icon: 'play_circle', iconColor: 'text-lime-600', active: true,
        role: 'Executes the approved external/system-facing resolution steps',
        summary: 'Reads from 4 sources · Reports to 4 agents · 5 steps',
        receivesFrom: ['Case Resolution Planner', 'Approval Gatekeeper', 'QA / Policy Check', 'system-specific agents'],
        uses: ['approved execution plan', 'write-enabled system bindings', 'target IDs and mappings'],
        does: ['executes approved external actions', 'creates/updates records', 'retries failed writebacks', 'propagates canonical state to external systems'],
        reportsTo: ['Workflow Runtime Agent', 'Audit & Observability Agent', 'Customer Communication Agent', 'SLA & Escalation Agent when execution fails'],
        writesTo: ['external system updates', 'execution result'],
        blockedBy: ['approval missing', 'write access disabled', 'missing ID mapping', 'downstream system unavailable', 'policy fail'],
        steps: [
          { num: 1, title: 'Receive approved plan', desc: 'Reads from Case Resolution Planner', output: 'Plan loaded', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Validate executable targets', desc: 'Uses target IDs', output: 'Targets verified', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Execute system writebacks', desc: 'Uses write-enabled bindings', output: 'External updates', reportsTo: 'External Systems', mode: 'Write-enabled' },
          { num: 4, title: 'Return execution result', desc: 'Writes to execution result', output: 'Result status', reportsTo: 'Self', mode: 'Automatic' },
          { num: 5, title: 'Trigger downstream recovery', desc: 'Reports to Workflow Runtime Agent', output: 'Recovery signal', reportsTo: 'Workflow Runtime Agent', mode: 'Automatic' }
        ]
      },
      {
        name: 'Workflow Runtime Agent',
        icon: 'account_tree', iconColor: 'text-indigo-600', active: true,
        role: 'Manages internal workflow progression after reconciliation and execution.',
        summary: 'Reads from 3 sources · Reports to 3 agents · 4 steps',
        receivesFrom: ['Case Resolution Planner', 'Resolution Executor', 'Workflows module'],
        uses: ['internal workflow state', 'conflict recovery status', 'resolution progress'],
        does: ['pauses, resumes, or advances internal workflows', 'unblocks internal workflow steps after reconciliation', 'syncs internal workflow state with external execution results'],
        reportsTo: ['SLA & Escalation Agent', 'Audit & Observability Agent', 'Customer Communication Agent when workflow completion matters'],
        writesTo: ['workflow progression state'],
        blockedBy: ['external execution incomplete', 'unresolved dependency', 'workflow rule conflict'],
        steps: [
          { num: 1, title: 'Receive resolution outcome', desc: 'Reads from Resolution Executor', output: 'Outcome loaded', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Evaluate workflow blockers', desc: 'Uses internal workflow state', output: 'Blockers identified', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Resume/advance internal workflow', desc: 'Uses resolution progress', output: 'Workflow advanced', reportsTo: 'Self', mode: 'Automatic' },
          { num: 4, title: 'Persist workflow state update', desc: 'Writes to progression state', output: 'State saved', reportsTo: 'Audit & Observability Agent', mode: 'Automatic' }
        ]
      }
    ]
  },
  {
    category: 'IDENTITY & CUSTOMER TRUTH',
    agents: [
      {
        name: 'Identity Mapping Agent',
        icon: 'fingerprint', iconColor: 'text-teal-600', active: true,
        role: 'Resolves entity and identity links across systems',
        summary: 'Reads from 7 sources · Reports to 3 agents · 4 steps',
        receivesFrom: ['Canonicalizer', 'CRM / Customer Identity Agent', 'Stripe Agent', 'Shopify Agent', 'OMS / ERP Agent', 'Helpdesk Agent', 'Returns Agent'],
        uses: ['identity resolution logic', 'entity linkage rules', 'match confidence'],
        does: ['links customer/order/refund/return/payment identities across systems', 'detects duplicates, missing IDs, ambiguous mappings', 'prevents unsafe execution when identity is unclear'],
        reportsTo: ['Reconciliation Agent', 'Case Resolution Planner', 'Resolution Executor'],
        writesTo: ['mapping result', 'missing ID warning', 'canonical link recommendation'],
        blockedBy: ['low confidence match', 'duplicate entity conflict', 'no canonical customer source available'],
        steps: [
          { num: 1, title: 'Receive entity references', desc: 'Reads from Canonicalizer', output: 'References loaded', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Compare cross-system identifiers', desc: 'Uses entity linkage rules', output: 'Comparison result', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Determine mapping confidence', desc: 'Uses match confidence', output: 'Confidence score', reportsTo: 'Self', mode: 'Automatic' },
          { num: 4, title: 'Output valid mapping or blocker', desc: 'Writes to mapping result', output: 'Mapping / Blocker', reportsTo: 'Reconciliation Agent', mode: 'Automatic' }
        ]
      },
      {
        name: 'CRM / Customer Identity Agent',
        icon: 'contact_page', iconColor: 'text-slate-600', active: false,
        role: 'Provides canonical customer truth from CRM/identity source',
        summary: 'Reads from 3 sources · Reports to 4 agents · 4 steps',
        receivesFrom: ['Identity Mapping Agent', 'Reconciliation Agent', 'Customers module'],
        uses: ['CRM / identity source', 'customer profile data', 'VIP/risk/account ownership metadata'],
        does: ['provides canonical customer truth', 'supplies segment, VIP, risk, and ownership context', 'supports identity and resolution flows with customer master data'],
        reportsTo: ['Identity Mapping Agent', 'Reconciliation Agent', 'Case Resolution Planner', 'Customer Communication Agent'],
        writesTo: ['canonical customer profile', 'identity truth package'],
        blockedBy: ['CRM connector missing', 'customer not found', 'stale identity source'],
        steps: [
          { num: 1, title: 'Receive customer lookup request', desc: 'Reads from Identity Mapping Agent', output: 'Lookup intent', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Fetch canonical profile', desc: 'Uses CRM source', output: 'Raw profile', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Return customer truth context', desc: 'Uses profile data', output: 'Truth context', reportsTo: 'Self', mode: 'Automatic' },
          { num: 4, title: 'Pass to dependent agents', desc: 'Writes to identity truth package', output: 'Package delivered', reportsTo: 'Reconciliation Agent', mode: 'Automatic' }
        ]
      }
    ]
  },
  {
    category: 'SYSTEM / TOOL AGENTS',
    agents: [
      {
        name: 'Helpdesk Agent',
        icon: 'support_agent', iconColor: 'text-sky-600', active: false,
        role: 'Reads/writes tickets, tags, notes, and support metadata in the helpdesk system',
        summary: 'Reads from 4 sources · Reports to 3 agents · 4 steps',
        receivesFrom: ['Supervisor', 'Customer Communication Agent', 'Composer + Translator', 'support platform events'],
        uses: ['helpdesk system', 'ticket threads', 'internal notes', 'tags and ticket states'],
        does: ['reads and updates tickets', 'adds notes/tags/status changes', 'syncs support state into the SaaS', 'applies communication updates in the helpdesk'],
        reportsTo: ['Audit & Observability Agent', 'SLA & Escalation Agent', 'Customers / Case context'],
        writesTo: ['helpdesk ticket state', 'internal note', 'reply draft application'],
        blockedBy: ['helpdesk connector missing', 'insufficient permissions', 'ticket not linked'],
        steps: [
          { num: 1, title: 'Receive support update request', desc: 'Reads from Customer Comm Agent', output: 'Update intent', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Read/write helpdesk data', desc: 'Uses helpdesk system', output: 'Data updated', reportsTo: 'Helpdesk', mode: 'Write-enabled' },
          { num: 3, title: 'Sync support state', desc: 'Uses ticket states', output: 'State synced', reportsTo: 'Self', mode: 'Automatic' },
          { num: 4, title: 'Return update result', desc: 'Writes to ticket state', output: 'Result', reportsTo: 'Audit & Observability Agent', mode: 'Automatic' }
        ]
      },
      {
        name: 'Stripe Agent',
        icon: 'credit_card', iconColor: 'text-indigo-600', active: false,
        role: 'Reads and updates payment, refund, dispute, and subscription state in Stripe.',
        summary: 'Reads from 3 sources · Reports to 3 agents · 4 steps',
        receivesFrom: ['Reconciliation Agent', 'Resolution Executor', 'Recharge / Subscription Agent when relevant'],
        uses: ['Stripe', 'payment/refund/dispute/subscription records'],
        does: ['reads and updates Stripe-side payment/refund/dispute/subscription state', 'provides payment/refund truth', 'executes approved Stripe actions'],
        reportsTo: ['Reconciliation Agent', 'Resolution Executor', 'Audit & Observability Agent'],
        writesTo: ['Stripe state/result'],
        blockedBy: ['Stripe not connected', 'write disabled', 'missing payment/refund ID'],
        steps: [
          { num: 1, title: 'Receive Stripe task', desc: 'Reads from Resolution Executor', output: 'Task loaded', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Read current Stripe state', desc: 'Uses Stripe API', output: 'Current state', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Execute approved action if needed', desc: 'Uses Stripe API', output: 'Action executed', reportsTo: 'Stripe', mode: 'Write-enabled' },
          { num: 4, title: 'Return Stripe result', desc: 'Writes to Stripe state/result', output: 'Result', reportsTo: 'Resolution Executor', mode: 'Automatic' }
        ]
      },
      {
        name: 'Shopify Agent',
        icon: 'shopping_bag', iconColor: 'text-emerald-600', active: false,
        role: 'Reads and updates order, customer, and commerce state in Shopify.',
        summary: 'Reads from 4 sources · Reports to 3 agents · 4 steps',
        receivesFrom: ['Reconciliation Agent', 'Resolution Executor', 'Returns Agent', 'Identity Mapping Agent'],
        uses: ['Shopify', 'order/customer/commerce records'],
        does: ['reads and updates Shopify-side order/customer/commerce state', 'provides order truth and commerce context'],
        reportsTo: ['Reconciliation Agent', 'Resolution Executor', 'Identity Mapping Agent'],
        writesTo: ['Shopify state/result'],
        blockedBy: ['Shopify not connected', 'insufficient permissions', 'missing order/customer ID'],
        steps: [
          { num: 1, title: 'Receive Shopify task', desc: 'Reads from Resolution Executor', output: 'Task loaded', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Read current Shopify state', desc: 'Uses Shopify API', output: 'Current state', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Execute approved update if needed', desc: 'Uses Shopify API', output: 'Update executed', reportsTo: 'Shopify', mode: 'Write-enabled' },
          { num: 4, title: 'Return Shopify result', desc: 'Writes to Shopify state/result', output: 'Result', reportsTo: 'Resolution Executor', mode: 'Automatic' }
        ]
      },
      {
        name: 'OMS / ERP Agent',
        icon: 'inventory', iconColor: 'text-stone-600', active: false,
        role: 'Handles back-office order/refund/return records in OMS/ERP',
        summary: 'Reads from 4 sources · Reports to 3 agents · 4 steps',
        receivesFrom: ['Reconciliation Agent', 'Resolution Executor', 'Identity Mapping Agent', 'Returns Agent'],
        uses: ['OMS / ERP system', 'sales orders', 'refund records', 'return authorizations'],
        does: ['reads and updates back-office operational records', 'creates missing OMS/ERP refs', 'aligns back-office state with canonical resolution'],
        reportsTo: ['Reconciliation Agent', 'Resolution Executor', 'Workflow Runtime Agent'],
        writesTo: ['OMS/ERP state/result'],
        blockedBy: ['OMS/ERP not connected', 'missing ref', 'writeback disabled', 'ERP-side validation failure'],
        steps: [
          { num: 1, title: 'Receive OMS/ERP task', desc: 'Reads from Resolution Executor', output: 'Task loaded', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Read current back-office state', desc: 'Uses OMS/ERP system', output: 'Current state', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Create/update required record', desc: 'Uses OMS/ERP system', output: 'Record updated', reportsTo: 'OMS/ERP', mode: 'Write-enabled' },
          { num: 4, title: 'Return alignment result', desc: 'Writes to OMS/ERP state/result', output: 'Result', reportsTo: 'Resolution Executor', mode: 'Automatic' }
        ]
      },
      {
        name: 'Returns Agent',
        icon: 'assignment_return', iconColor: 'text-orange-600', active: false,
        role: 'Handles return lifecycle state, block/unblock logic, label/inspection/restock progression',
        summary: 'Reads from 5 sources · Reports to 3 agents · 4 steps',
        receivesFrom: ['Reconciliation Agent', 'Resolution Executor', 'Shopify Agent', 'OMS / ERP Agent', 'Logistics / Tracking Agent'],
        uses: ['return workflow state', 'labels', 'inspection/restock data', 'refund linkage'],
        does: ['manages return lifecycle state', 'detects and unblocks blocked return flows', 'connects refund truth to return progression'],
        reportsTo: ['Reconciliation Agent', 'Workflow Runtime Agent', 'Customer Communication Agent'],
        writesTo: ['return flow state', 'block/unblock result'],
        blockedBy: ['return tool not connected', 'refund not reconciled', 'warehouse state incomplete'],
        steps: [
          { num: 1, title: 'Receive return domain task', desc: 'Reads from Reconciliation Agent', output: 'Task loaded', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Read current return status', desc: 'Uses return workflow state', output: 'Current status', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Check refund dependency', desc: 'Uses refund linkage', output: 'Dependency checked', reportsTo: 'Self', mode: 'Automatic' },
          { num: 4, title: 'Update/unblock return progression', desc: 'Writes to return flow state', output: 'Progression updated', reportsTo: 'Workflow Runtime Agent', mode: 'Write-enabled' }
        ]
      },
      {
        name: 'Recharge / Subscription Agent',
        icon: 'autorenew', iconColor: 'text-violet-600', active: false,
        role: 'Handles subscription/renewal/charge state for subscription commerce',
        summary: 'Reads from 4 sources · Reports to 3 agents · 4 steps',
        receivesFrom: ['Reconciliation Agent', 'Resolution Executor', 'Stripe Agent', 'Shopify Agent'],
        uses: ['Recharge', 'subscriptions', 'renewals', 'charges'],
        does: ['reads and updates subscription lifecycle state', 'detects subscription contradictions', 'performs authorized subscription actions'],
        reportsTo: ['Reconciliation Agent', 'Resolution Executor', 'Customer Communication Agent when subscription communication is needed'],
        writesTo: ['subscription state/result'],
        blockedBy: ['Recharge not connected', 'unsupported merchant', 'write disabled', 'missing subscription reference'],
        steps: [
          { num: 1, title: 'Receive subscription task', desc: 'Reads from Resolution Executor', output: 'Task loaded', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Read current subscription state', desc: 'Uses Recharge', output: 'Current state', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Execute approved change if needed', desc: 'Uses Recharge', output: 'Change executed', reportsTo: 'Recharge', mode: 'Write-enabled' },
          { num: 4, title: 'Return subscription result', desc: 'Writes to subscription state/result', output: 'Result', reportsTo: 'Resolution Executor', mode: 'Automatic' }
        ]
      },
      {
        name: 'Logistics / Tracking Agent',
        icon: 'local_shipping', iconColor: 'text-blue-600', active: false,
        role: 'Handles shipment/tracking/address-related logistics signals',
        summary: 'Reads from 3 sources · Reports to 3 agents · 4 steps',
        receivesFrom: ['Reconciliation Agent', 'Returns Agent', 'Shopify Agent'],
        uses: ['EasyPost / WMS / 3PL', 'shipment/tracking/address data'],
        does: ['reads shipment/tracking events', 'verifies delivery and address state', 'surfaces logistics contradictions and shipping impact'],
        reportsTo: ['Reconciliation Agent', 'Returns Agent', 'Customer Communication Agent when delivery context is needed'],
        writesTo: ['logistics truth / shipping impact result'],
        blockedBy: ['logistics connector missing', 'stale tracking', 'address data incomplete'],
        steps: [
          { num: 1, title: 'Receive logistics task', desc: 'Reads from Reconciliation Agent', output: 'Task loaded', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Read tracking/address state', desc: 'Uses EasyPost / WMS', output: 'Current state', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Evaluate contradiction or impact', desc: 'Uses tracking data', output: 'Evaluation result', reportsTo: 'Self', mode: 'Automatic' },
          { num: 4, title: 'Return logistics result', desc: 'Writes to logistics truth', output: 'Result', reportsTo: 'Reconciliation Agent', mode: 'Automatic' }
        ]
      }
    ]
  },
  {
    category: 'OBSERVABILITY & COMMUNICATION',
    agents: [
      {
        name: 'SLA & Escalation Agent',
        icon: 'warning', iconColor: 'text-red-600', active: true,
        role: 'Monitors aging cases, stalled resolutions, delayed approvals, and blocked flows',
        summary: 'Reads from 6 sources · Reports to 4 agents · 4 steps',
        receivesFrom: ['Reconciliation Agent', 'Case Resolution Planner', 'Resolution Executor', 'Workflow Runtime Agent', 'Helpdesk Agent', 'Audit & Observability Agent'],
        uses: ['SLA thresholds', 'aging case data', 'blocked flow state', 'approval waiting times'],
        does: ['monitors delays and stalls', 'escalates overdue contradictions or blocked executions', 'raises urgency when operations are stuck'],
        reportsTo: ['human owners', 'Helpdesk Agent', 'Audit & Observability Agent', 'Supervisor if rerouting is needed'],
        writesTo: ['escalation event', 'urgency level'],
        blockedBy: ['owner unknown', 'escalation route undefined'],
        steps: [
          { num: 1, title: 'Receive aging/stall signal', desc: 'Reads from Audit & Observability Agent', output: 'Signal loaded', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Evaluate SLA breach', desc: 'Uses SLA thresholds', output: 'Breach status', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Create escalation', desc: 'Uses aging case data', output: 'Escalation created', reportsTo: 'Self', mode: 'Automatic' },
          { num: 4, title: 'Notify owner and mark urgency', desc: 'Writes to escalation event', output: 'Notification sent', reportsTo: 'Helpdesk Agent', mode: 'Automatic' }
        ]
      },
      {
        name: 'Customer Communication Agent',
        icon: 'chat', iconColor: 'text-blue-600', active: true,
        role: 'Decides when customer-facing communication should happen based on real reconciled operational state',
        summary: 'Reads from 5 sources · Reports to 3 agents · 4 steps',
        receivesFrom: ['Case Resolution Planner', 'Resolution Executor', 'Workflow Runtime Agent', 'CRM / Customer Identity Agent', 'Reconciliation Agent'],
        uses: ['communication policy', 'reconciled operational truth', 'customer profile', 'Composer + Translator', 'Helpdesk Agent'],
        does: ['decides when communication is safe and necessary', 'coordinates customer-facing updates', 'prevents incorrect communication during contradictions'],
        reportsTo: ['Composer + Translator', 'Helpdesk Agent', 'Audit & Observability Agent'],
        writesTo: ['communication request', 'approved communication state'],
        blockedBy: ['truth not reconciled yet', 'policy hold active', 'customer channel unavailable'],
        steps: [
          { num: 1, title: 'Receive communication trigger', desc: 'Reads from Resolution Executor', output: 'Trigger loaded', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Check reconciled truth and policy', desc: 'Uses communication policy', output: 'Check result', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Request message drafting', desc: 'Uses Composer + Translator', output: 'Draft requested', reportsTo: 'Composer + Translator', mode: 'Automatic' },
          { num: 4, title: 'Hand off to Helpdesk/send path', desc: 'Writes to communication request', output: 'Handoff complete', reportsTo: 'Helpdesk Agent', mode: 'Automatic' }
        ]
      },
      {
        name: 'Audit & Observability Agent',
        icon: 'visibility', iconColor: 'text-gray-600', locked: true, active: true,
        role: 'Records executions, failures, retries, overrides, and recurring contradictions',
        summary: 'Reads from all execution agents · Reports to 4 agents · 4 steps',
        receivesFrom: ['all execution-related agents', 'all important runtime events', 'integration health signals'],
        uses: ['execution logs', 'retries', 'failures', 'overrides', 'recurring contradiction data'],
        does: ['records every important action', 'tracks system reliability', 'surfaces recurring blockers and unhealthy patterns', 'supports logs, analytics, and debugging'],
        reportsTo: ['Logs', 'Analytics', 'SLA & Escalation Agent', 'admin/ops visibility'],
        writesTo: ['audit trail', 'observability records', 'recurring issue signals'],
        blockedBy: ['none should block main operations', 'degraded logging should be visible but non-fatal'],
        steps: [
          { num: 1, title: 'Receive runtime event', desc: 'Reads from any agent', output: 'Event loaded', reportsTo: 'Self', mode: 'Automatic' },
          { num: 2, title: 'Record action/failure/result', desc: 'Uses execution logs', output: 'Record created', reportsTo: 'Self', mode: 'Automatic' },
          { num: 3, title: 'Detect patterns if relevant', desc: 'Uses recurring contradiction data', output: 'Pattern detected', reportsTo: 'Self', mode: 'Automatic' },
          { num: 4, title: 'Publish observability signal', desc: 'Writes to audit trail', output: 'Signal published', reportsTo: 'Logs / Analytics', mode: 'Automatic' }
        ]
      }
    ]
  }
];
