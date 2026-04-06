import React from 'react';

export const mockArticleDetails: Record<string, any> = {
  'KB-1024': {
    id: 'KB-1024',
    type: 'Policy',
    title: 'Refund Policy - Annual Plans',
    owner: 'John Doe',
    ownerInitials: 'JD',
    lastUpdated: '2 hours ago',
    domain: 'Refunds',
    scope: 'Annual Plans',
    reviewOwner: 'Finance Ops',
    purpose: 'Defines the eligibility criteria and decision logic for refunding annual-plan customers. Used by Approvals, Payments, AI recommendations, and refund workflows.',
    content: (
      <>
        <h2>1. Overview</h2>
        <p>At HelpDesk AI, we strive to ensure customer satisfaction while balancing sustainable business practices. This policy outlines the conditions under which annual subscribers are eligible for a refund.</p>

        <hr className="my-8 border-gray-100 dark:border-gray-800" />

        <h2>2. Policy Rules & Triggers</h2>

        <h3>Applies When</h3>
        <p>This policy is triggered under the following conditions:</p>
        <ul>
          <li>A customer explicitly requests a refund on an <strong>annual plan</strong>.</li>
          <li>The subscription activation or renewal occurred within the eligibility window.</li>
          <li>No active chargeback or payment dispute exists for the transaction.</li>
          <li>The refund request enters the support, payments, or approvals flow.</li>
        </ul>

        <h3>Eligibility Window</h3>
        <p>Customers on annual plans are eligible for a full refund if requested within the "cooling-off" period. This allows evaluation of the full feature set in a production environment.</p>
        <ul>
          <li><strong>0-30 Days:</strong> 100% Refund of the annual prepay amount.</li>
          <li><strong>31+ Days:</strong> Prorated refund based on remaining full months, minus a 20% early termination fee calculated on the remaining balance.</li>
        </ul>

        <h3>Allows</h3>
        <ul>
          <li><strong>Full refunds</strong> within the first 30 days of the annual cycle.</li>
          <li><strong>Prorated refunds</strong> after 30 days, subject to the early termination fee.</li>
        </ul>

        <h3>Blocks</h3>
        <ul>
          <li><strong>AI Usage Overages:</strong> Refund of any AI token overages incurred prior to cancellation.</li>
          <li><strong>Custom Integrations:</strong> Refund of professional services fees for custom workflow setup after service delivery.</li>
        </ul>

        <h3>Exceptions & Edge Cases</h3>
        <p>Refunds may be denied or modified under specific circumstances:</p>
        <ul>
          <li><strong>Account Abuse:</strong> If the account was flagged for Terms of Service violations, all refunds are blocked.</li>
          <li><strong>Promotional Plans:</strong> Annual plans purchased with a discount &gt;50% are strictly non-refundable after 7 days.</li>
        </ul>

        <hr className="my-8 border-gray-100 dark:border-gray-800" />

        <h2>3. System & Operational Impact</h2>

        <h3>Operational Impact</h3>
        <ul>
          <li><strong>Affects modules:</strong> Payments, Approvals, Workflows, Case Graph.</li>
          <li><strong>Used in:</strong> Refund decisions, high-value approval reviews, AI refund recommendations.</li>
          <li><strong>Can trigger:</strong> Manual approval routing when the refund amount exceeds the automated threshold.</li>
          <li><strong>Can block:</strong> Automatic refund execution if the request falls outside the policy window.</li>
        </ul>

        <h3>Workflow Impact</h3>
        <p>The following workflow steps depend on this policy:</p>
        <ul>
          <li><strong>Refund — High value:</strong> Evaluated at Step 2 (Check Policy).</li>
          <li><strong>Refund Eligibility Check:</strong> Automatically blocks execution if the request is outside the eligibility window.</li>
          <li><strong>Approval Routing:</strong> Routes to Finance Ops for Annual Plan Refunds.</li>
        </ul>

        <h3>Approval Impact</h3>
        <p>This policy governs the following approval routing logic:</p>
        <ul>
          <li>Refunds exceeding the automated threshold require <strong>manual approval</strong>.</li>
          <li>Policy exceptions require <strong>manager review</strong>.</li>
          <li>This document is cited in approval reasoning for high-value refunds.</li>
        </ul>

        <h3>Used by AI</h3>
        <p>The AI Copilot and automated agents use this policy for:</p>
        <ul>
          <li>Generating <strong>refund recommendations</strong> for agents.</li>
          <li>Providing <strong>approval reasoning</strong> summaries for managers.</li>
          <li>Explaining <strong>payment conflicts</strong> in the Case Graph.</li>
          <li>Drafting <strong>customer-facing clarifications</strong> regarding refund denials.</li>
        </ul>
      </>
    ),
    aiCitationPreview: {
      text: '"According to the Refund Policy (#KB-1024), annual plan subscribers can receive a full refund if they cancel within the first 30 days. After this period, refunds are prorated for remaining months and subject to a 20% early termination fee. Note that fees for usage overages and professional services are non-refundable."',
      sources: ['Overview', 'Eligibility Window']
    },
    aiPerformance: [
      { val: '142', label: 'Citations', color: 'indigo' },
      { val: '4.8', label: 'Feedback Quality', color: 'green' },
      { val: '12', label: 'Escalations', color: 'amber' },
      { val: '85%', label: 'Usage Freq.', color: 'indigo' }
    ],
    linkedWorkflows: [
      { title: 'Refund — High value (Pro)', desc: 'Step 2: Check Policy' },
      { title: 'Refund Eligibility Check', desc: 'Blocks execution if outside window' }
    ],
    linkedApprovals: [
      { title: 'High-value refund approval', desc: 'Requires manager review' },
      { title: 'Refund exception review', desc: 'Manual override for annual policy' }
    ],
    linkedModules: ['Payments', 'Approvals', 'Workflows', 'Case Graph', 'Inbox Copilot'],
    gaps: [
      'Missing exception coverage for enterprise plans',
      'Stale operational references to legacy billing system'
    ]
  },
  'KB-1025': {
    id: 'KB-1025',
    type: 'Article',
    title: 'GDPR Data Export',
    owner: 'Sarah Lee',
    ownerInitials: 'SL',
    lastUpdated: '1 day ago',
    domain: 'Legal & Compliance',
    scope: 'EU Customers',
    reviewOwner: 'Data Protection Officer',
    purpose: 'Defines the procedure and technical steps for exporting user data in compliance with GDPR Article 20 (Right to Data Portability). Used by Support, Engineering, and automated compliance workflows.',
    content: (
      <>
        <h2>1. Overview</h2>
        <p>This standard operating procedure (SOP) outlines the steps required to fulfill a GDPR Data Export request. It ensures that we provide users with a structured, commonly used, and machine-readable format of their personal data within the legally mandated 30-day timeframe.</p>

        <hr className="my-8 border-gray-100 dark:border-gray-800" />

        <h2>2. Policy Rules & Triggers</h2>

        <h3>Applies When</h3>
        <p>This SOP is triggered under the following conditions:</p>
        <ul>
          <li>A user submits a formal "Data Export" or "Subject Access Request" (SAR).</li>
          <li>The user is verified to be a resident of the European Union or UK.</li>
          <li>The request is routed through the Privacy Portal or escalated via Support.</li>
        </ul>

        <h3>Eligibility Window</h3>
        <p>Requests must be fulfilled promptly and within legal limits:</p>
        <ul>
          <li><strong>Standard Deadline:</strong> 30 calendar days from the date of identity verification.</li>
          <li><strong>Extension:</strong> Can be extended by an additional 60 days for complex requests, but the user must be notified within the first 30 days.</li>
        </ul>

        <h3>Allows</h3>
        <ul>
          <li><strong>Automated Export:</strong> Users can trigger a self-serve export from their Account Settings.</li>
          <li><strong>Manual Compilation:</strong> Support agents can trigger a backend job for complex enterprise accounts.</li>
        </ul>

        <h3>Blocks</h3>
        <ul>
          <li><strong>Unverified Requests:</strong> Export is blocked if the requester's identity cannot be cryptographically or manually verified.</li>
          <li><strong>Third-Party Data:</strong> Data belonging to other users (e.g., in shared workspaces) is excluded from the export.</li>
        </ul>

        <h3>Exceptions & Edge Cases</h3>
        <ul>
          <li><strong>Suspended Accounts:</strong> Users with suspended accounts due to fraud investigations must undergo a manual legal review before data is released.</li>
        </ul>

        <hr className="my-8 border-gray-100 dark:border-gray-800" />

        <h2>3. System & Operational Impact</h2>

        <h3>Operational Impact</h3>
        <ul>
          <li><strong>Affects modules:</strong> User Settings, Security, Support Inbox, Data Engineering.</li>
          <li><strong>Used in:</strong> Compliance audits, support ticket resolution, automated data pipelines.</li>
          <li><strong>Can trigger:</strong> Alerts to the Legal team if a request approaches the 30-day deadline.</li>
        </ul>

        <h3>Workflow Impact</h3>
        <p>The following workflow steps depend on this SOP:</p>
        <ul>
          <li><strong>GDPR Request Triage:</strong> Automatically routes SARs to the Privacy queue.</li>
          <li><strong>Data Compilation Job:</strong> Triggers the asynchronous database extraction process.</li>
        </ul>

        <h3>Approval Impact</h3>
        <ul>
          <li>Manual exports for Enterprise accounts require <strong>DPO approval</strong>.</li>
          <li>Extensions beyond 30 days require <strong>Legal approval</strong>.</li>
        </ul>

        <h3>Used by AI</h3>
        <p>The AI Copilot uses this SOP for:</p>
        <ul>
          <li>Guiding users on how to use the self-serve export tool.</li>
          <li>Drafting compliance-approved responses to SAR emails.</li>
          <li>Flagging potential identity verification issues to human agents.</li>
        </ul>
      </>
    ),
    aiCitationPreview: {
      text: '"To comply with GDPR, data export requests must be fulfilled within 30 days of identity verification. Users can initiate a self-serve export from their Account Settings. If the request is complex, the deadline can be extended by 60 days, provided the user is notified. Unverified requests will be blocked."',
      sources: ['Eligibility Window', 'Allows', 'Blocks']
    },
    aiPerformance: [
      { val: '89', label: 'Citations', color: 'indigo' },
      { val: '4.9', label: 'Feedback Quality', color: 'green' },
      { val: '2', label: 'Escalations', color: 'amber' },
      { val: '92%', label: 'Usage Freq.', color: 'indigo' }
    ],
    linkedWorkflows: [
      { title: 'SAR Processing', desc: 'Step 1: Identity Verification' },
      { title: 'Data Compilation Job', desc: 'Triggers backend extraction' }
    ],
    linkedApprovals: [
      { title: 'Enterprise Data Export', desc: 'Requires DPO review' },
      { title: 'Deadline Extension', desc: 'Requires Legal approval' }
    ],
    linkedModules: ['Security', 'Support Inbox', 'Workflows', 'Compliance'],
    gaps: [
      'Missing details on handling exports for deleted accounts'
    ]
  },
  'KB-1026': {
    id: 'KB-1026',
    type: 'Snippet',
    title: 'Password Reset Instructions',
    owner: 'Mike K.',
    ownerInitials: 'MK',
    lastUpdated: '3 days ago',
    domain: 'Authentication',
    scope: 'All Users',
    reviewOwner: 'Support Ops',
    purpose: 'Standardized response snippet providing clear, step-by-step instructions for users who are unable to access their accounts and need to reset their passwords.',
    content: (
      <>
        <h2>1. Overview</h2>
        <p>This snippet provides the approved, secure instructions for guiding users through the password reset process. It is designed to be easily inserted into support tickets or used by the AI chatbot.</p>

        <hr className="my-8 border-gray-100 dark:border-gray-800" />

        <h2>2. Policy Rules & Triggers</h2>

        <h3>Applies When</h3>
        <ul>
          <li>A user reports they forgot their password.</li>
          <li>A user's account is temporarily locked due to multiple failed login attempts.</li>
          <li>A proactive security reset is triggered by the system.</li>
        </ul>

        <h3>Allows</h3>
        <ul>
          <li><strong>Self-Serve Reset:</strong> Directing users to the `/forgot-password` endpoint.</li>
          <li><strong>Magic Link:</strong> Sending a one-time login link if the standard reset fails.</li>
        </ul>

        <h3>Blocks</h3>
        <ul>
          <li><strong>Manual Password Setting:</strong> Support agents are strictly prohibited from manually setting or communicating passwords.</li>
          <li><strong>Resetting without Email Access:</strong> If the user cannot access the email on file, the account recovery protocol must be used instead.</li>
        </ul>

        <hr className="my-8 border-gray-100 dark:border-gray-800" />

        <h2>3. System & Operational Impact</h2>

        <h3>Operational Impact</h3>
        <ul>
          <li><strong>Affects modules:</strong> Authentication, Support Inbox, AI Chatbot.</li>
          <li><strong>Used in:</strong> Ticket macros, automated chatbot responses.</li>
        </ul>

        <h3>Workflow Impact</h3>
        <ul>
          <li><strong>Account Lockout Flow:</strong> Automatically sends this snippet when an account is locked.</li>
        </ul>

        <h3>Used by AI</h3>
        <p>The AI uses this snippet to:</p>
        <ul>
          <li>Instantly resolve "forgot password" queries in the chat widget.</li>
          <li>Identify when a user is actually requesting an account recovery (no email access) and route accordingly.</li>
        </ul>
      </>
    ),
    aiCitationPreview: {
      text: '"To reset your password, please visit the login page and click \'Forgot Password\'. Enter the email address associated with your account, and we will send you a secure reset link. Please note that for security reasons, our support team cannot manually change your password."',
      sources: ['Overview', 'Blocks']
    },
    aiPerformance: [
      { val: '1.2k', label: 'Citations', color: 'indigo' },
      { val: '4.5', label: 'Feedback Quality', color: 'green' },
      { val: '45', label: 'Escalations', color: 'amber' },
      { val: '98%', label: 'Usage Freq.', color: 'indigo' }
    ],
    linkedWorkflows: [
      { title: 'Account Lockout Auto-Responder', desc: 'Sends snippet on lockout' }
    ],
    linkedApprovals: [],
    linkedModules: ['Authentication', 'Support Inbox', 'AI Chatbot'],
    gaps: [
      'Needs translation into Spanish and French'
    ]
  },
  'KB-1027': {
    id: 'KB-1027',
    type: 'Playbook',
    title: 'Churn Prevention Script',
    owner: 'John Doe',
    ownerInitials: 'JD',
    lastUpdated: '5 days ago',
    domain: 'Customer Success',
    scope: 'Pro & Enterprise',
    reviewOwner: 'CS Leadership',
    purpose: 'Provides a structured conversation framework and concession guidelines for Customer Success Managers (CSMs) when dealing with high-value accounts at risk of cancellation.',
    content: (
      <>
        <h2>1. Overview</h2>
        <p>This playbook outlines the strategies and authorized concessions for retaining Pro and Enterprise customers who have expressed an intent to cancel. The goal is to uncover the root cause of churn and offer targeted solutions to salvage the relationship.</p>

        <hr className="my-8 border-gray-100 dark:border-gray-800" />

        <h2>2. Policy Rules & Triggers</h2>

        <h3>Applies When</h3>
        <ul>
          <li>A Pro or Enterprise customer clicks "Cancel Subscription".</li>
          <li>Health score drops below 30 (Red).</li>
          <li>A customer explicitly mentions moving to a competitor.</li>
        </ul>

        <h3>Allows</h3>
        <p>CSMs are authorized to offer the following concessions without prior approval:</p>
        <ul>
          <li><strong>Discount:</strong> Up to 15% off the next renewal cycle.</li>
          <li><strong>Training:</strong> One free customized team onboarding session.</li>
          <li><strong>Feature Access:</strong> 30-day trial of an Enterprise feature (for Pro customers).</li>
        </ul>

        <h3>Blocks</h3>
        <ul>
          <li><strong>Permanent Discounts:</strong> Discounts cannot be applied in perpetuity.</li>
          <li><strong>Free Months:</strong> Offering entirely free months is blocked unless approved by the VP of Sales.</li>
        </ul>

        <h3>Exceptions & Edge Cases</h3>
        <ul>
          <li><strong>Strategic Accounts:</strong> Accounts marked as "Strategic" bypass standard limits and escalate directly to the VP of Sales for custom retention packages.</li>
        </ul>

        <hr className="my-8 border-gray-100 dark:border-gray-800" />

        <h2>3. System & Operational Impact</h2>

        <h3>Operational Impact</h3>
        <ul>
          <li><strong>Affects modules:</strong> CRM, Billing, Customer Success Portal.</li>
          <li><strong>Used in:</strong> CSM 1:1s, retention reporting.</li>
        </ul>

        <h3>Workflow Impact</h3>
        <ul>
          <li><strong>Cancellation Request:</strong> Pauses the automated cancellation for 48 hours to allow CSM intervention.</li>
          <li><strong>Discount Application:</strong> Automatically applies the authorized 15% discount code in the billing system.</li>
        </ul>

        <h3>Approval Impact</h3>
        <ul>
          <li>Discounts &gt; 15% require <strong>CS Director approval</strong>.</li>
          <li>Free months require <strong>VP of Sales approval</strong>.</li>
        </ul>

        <h3>Used by AI</h3>
        <p>The AI Copilot uses this playbook to:</p>
        <ul>
          <li>Analyze customer sentiment and suggest the most relevant concession (e.g., suggesting training if the issue is adoption).</li>
          <li>Draft follow-up emails for the CSM based on the playbook structure.</li>
        </ul>
      </>
    ),
    aiCitationPreview: {
      text: '"For accounts at risk of churning, CSMs can offer up to a 15% discount on the next renewal or a free customized training session. Permanent discounts and free months are not permitted without executive approval. Strategic accounts should be escalated immediately."',
      sources: ['Allows', 'Blocks', 'Exceptions']
    },
    aiPerformance: [
      { val: '34', label: 'Citations', color: 'indigo' },
      { val: '4.2', label: 'Feedback Quality', color: 'green' },
      { val: '8', label: 'Escalations', color: 'amber' },
      { val: '45%', label: 'Usage Freq.', color: 'indigo' }
    ],
    linkedWorkflows: [
      { title: 'Cancellation Pause', desc: 'Delays cancellation by 48h' },
      { title: 'Retention Discount Apply', desc: 'Applies authorized discount' }
    ],
    linkedApprovals: [
      { title: 'High Discount Approval', desc: 'Requires CS Director' },
      { title: 'Free Month Approval', desc: 'Requires VP of Sales' }
    ],
    linkedModules: ['CRM', 'Billing', 'CS Portal'],
    gaps: [
      'Needs updated competitor battlecards linked'
    ]
  },
  'KB-1028': {
    id: 'KB-1028',
    type: 'Article',
    title: 'API Rate Limits',
    owner: 'Alex B.',
    ownerInitials: 'AB',
    lastUpdated: '1 week ago',
    domain: 'Engineering',
    scope: 'Developers',
    reviewOwner: 'Platform Team',
    purpose: 'Defines the technical rate limits for the public API, the behavior when limits are exceeded, and the process for requesting limit increases.',
    content: (
      <>
        <h2>1. Overview</h2>
        <p>To ensure platform stability and fair usage, HelpDesk AI enforces rate limits on all public API endpoints. This document details the thresholds, response codes, and escalation paths for API consumers.</p>

        <hr className="my-8 border-gray-100 dark:border-gray-800" />

        <h2>2. Policy Rules & Triggers</h2>

        <h3>Applies When</h3>
        <ul>
          <li>Any external system makes a request to `api.helpdesk.ai`.</li>
          <li>A customer integrates a third-party application via OAuth.</li>
        </ul>

        <h3>Eligibility Window (Limits)</h3>
        <ul>
          <li><strong>Basic Plan:</strong> 100 requests per minute (RPM).</li>
          <li><strong>Pro Plan:</strong> 1,000 requests per minute (RPM).</li>
          <li><strong>Enterprise Plan:</strong> 10,000 requests per minute (RPM).</li>
        </ul>

        <h3>Allows</h3>
        <ul>
          <li><strong>Burst Traffic:</strong> Allows short bursts up to 2x the RPM limit for a maximum of 5 seconds.</li>
          <li><strong>Limit Increases:</strong> Enterprise customers can request custom rate limits via their Technical Account Manager.</li>
        </ul>

        <h3>Blocks</h3>
        <ul>
          <li><strong>Excessive Requests:</strong> Requests exceeding the limit will be blocked and return a `429 Too Many Requests` status code.</li>
          <li><strong>Abusive Patterns:</strong> Sustained traffic at 5x the limit will trigger an automatic temporary IP ban (1 hour).</li>
        </ul>

        <hr className="my-8 border-gray-100 dark:border-gray-800" />

        <h2>3. System & Operational Impact</h2>

        <h3>Operational Impact</h3>
        <ul>
          <li><strong>Affects modules:</strong> API Gateway, Developer Portal, Monitoring.</li>
          <li><strong>Used in:</strong> Infrastructure scaling, customer technical support.</li>
        </ul>

        <h3>Workflow Impact</h3>
        <ul>
          <li><strong>Rate Limit Warning:</strong> Triggers an automated email to the developer when they hit 80% of their limit.</li>
          <li><strong>IP Ban Alert:</strong> Alerts the Security Operations Center (SOC) when an IP is banned for abusive patterns.</li>
        </ul>

        <h3>Approval Impact</h3>
        <ul>
          <li>Custom rate limit requests require <strong>Platform Engineering approval</strong> to ensure infrastructure capacity.</li>
        </ul>

        <h3>Used by AI</h3>
        <p>The AI Copilot uses this article to:</p>
        <ul>
          <li>Diagnose `429` errors reported by customers in support tickets.</li>
          <li>Explain rate limit headers (`X-RateLimit-Remaining`) to developers.</li>
        </ul>
      </>
    ),
    aiCitationPreview: {
      text: '"API rate limits vary by plan: Basic allows 100 RPM, Pro allows 1,000 RPM, and Enterprise allows 10,000 RPM. If you exceed these limits, the API will return a 429 Too Many Requests error. Enterprise customers can request limit increases through their Technical Account Manager."',
      sources: ['Eligibility Window', 'Blocks', 'Allows']
    },
    aiPerformance: [
      { val: '512', label: 'Citations', color: 'indigo' },
      { val: '4.7', label: 'Feedback Quality', color: 'green' },
      { val: '3', label: 'Escalations', color: 'amber' },
      { val: '78%', label: 'Usage Freq.', color: 'indigo' }
    ],
    linkedWorkflows: [
      { title: 'Rate Limit Warning Email', desc: 'Triggers at 80% usage' },
      { title: 'SOC IP Ban Alert', desc: 'Alerts on abusive traffic' }
    ],
    linkedApprovals: [
      { title: 'Custom Limit Increase', desc: 'Requires Platform Eng approval' }
    ],
    linkedModules: ['API Gateway', 'Developer Portal', 'Monitoring'],
    gaps: []
  }
};
