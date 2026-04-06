export type RiskProfile = 'Low-risk autonomous' | 'Medium-risk supervised' | 'High-risk guarded' | 'Critical-path restricted' | 'Custom';
export type AutonomyLevel = 'Observe only' | 'Recommend only' | 'Act only in low-risk cases' | 'Act under thresholds' | 'Act with safeguards' | 'Never act autonomously on sensitive cases';
export type EscalationTarget = 'Escalate to human' | 'Escalate to manager' | 'Send to approval queue' | 'Re-route to specialist agent' | 'Freeze case until reviewed';
export type FallbackBehavior = 'Stop and log' | 'Ask for more information' | 'Reroute to specialist' | 'Create internal note' | 'Send to approval queue' | 'Notify supervisor agent' | 'Notify human operator' | 'Return safe default response' | 'Park the case for later review';
export type SensitiveGuardAction = 'Allow' | 'Require extra checks' | 'Require human review' | 'Block autonomous handling';

export interface AgentSafetyConfig {
  template: string;
  riskProfile: RiskProfile;
  effectiveSafetySummary: string[];
  overviewMetrics: {
    blockRules: number;
    safeToRunChecks: number;
    escalationTriggers: number;
    auditTriggers: number;
  };
  allowedAutonomyLevel: AutonomyLevel;
  autoStopConditions: string[];
  sensitiveCaseGuards: Array<{ caseType: string; action: SensitiveGuardAction }>;
  preExecutionSafetyChecks: string[];
  uncertaintySafetyBehavior: string;
  escalationTriggers: Array<{ trigger: string; action: EscalationTarget }>;
  fallbackBehavior: FallbackBehavior;
  outputAndActionGuardrails: string[];
  conflictResolutionRules: string[];
  auditTriggers: string[];
  
  // Agent specific visibility flags
  showFinancialGuards?: boolean;
  showComplianceGuards?: boolean;
  showInputGuards?: boolean;
  showRoutingGuards?: boolean;
}

export const defaultSafetyConfig: AgentSafetyConfig = {
  template: 'Standard safety template',
  riskProfile: 'Medium-risk supervised',
  effectiveSafetySummary: [
    'Can operate autonomously only in low-risk scenarios',
    'Must stop on policy conflict or missing evidence',
    'Escalates automatically when sensitive customer data is involved'
  ],
  overviewMetrics: {
    blockRules: 3,
    safeToRunChecks: 4,
    escalationTriggers: 2,
    auditTriggers: 5
  },
  allowedAutonomyLevel: 'Act only in low-risk cases',
  autoStopConditions: [
    'Evidence missing',
    'Confidence too low',
    'Policy conflict',
    'Contradictory signals'
  ],
  sensitiveCaseGuards: [
    { caseType: 'VIP / high-value customer cases', action: 'Require human review' },
    { caseType: 'PII-heavy cases', action: 'Require extra checks' }
  ],
  preExecutionSafetyChecks: [
    'Required evidence present',
    'Policy matched successfully',
    'No conflict between sources'
  ],
  uncertaintySafetyBehavior: 'Request more context',
  escalationTriggers: [
    { trigger: 'Contradictory evidence', action: 'Escalate to human' },
    { trigger: 'Repeated failed checks', action: 'Freeze case until reviewed' }
  ],
  fallbackBehavior: 'Stop and log',
  outputAndActionGuardrails: [
    'Do not expose internal reasoning',
    'Do not reveal hidden flags',
    'Do not present uncertain conclusions as facts'
  ],
  conflictResolutionRules: [
    'Hard blocks override everything',
    'Missing evidence blocks sensitive execution'
  ],
  auditTriggers: [
    'Blocked action',
    'Escalation triggered',
    'Low-confidence action halted'
  ]
};

export const agentSafetyConfig: Record<string, AgentSafetyConfig> = {
  'Supervisor': {
    template: 'Orchestration safety template',
    riskProfile: 'Critical-path restricted',
    effectiveSafetySummary: [
      'Coordinates agents but has strict limits on direct execution',
      'Stops entire workflow if unsafe patterns are detected',
      'Reroutes safely when agents fail or conflict'
    ],
    overviewMetrics: {
      blockRules: 5,
      safeToRunChecks: 6,
      escalationTriggers: 4,
      auditTriggers: 8
    },
    allowedAutonomyLevel: 'Act with safeguards',
    autoStopConditions: [
      'Contradictory signals from sub-agents',
      'Tool unavailable',
      'Action outside scope',
      'Unsafe workflow detected'
    ],
    sensitiveCaseGuards: [
      { caseType: 'Admin/system cases', action: 'Require human review' },
      { caseType: 'Legal or compliance cases', action: 'Block autonomous handling' }
    ],
    preExecutionSafetyChecks: [
      'No hard block triggered',
      'Case status compatible with action',
      'Permission still valid'
    ],
    uncertaintySafetyBehavior: 'Block action under ambiguity',
    escalationTriggers: [
      { trigger: 'Policy mismatch across agents', action: 'Escalate to manager' },
      { trigger: 'Repeated retries exceeded', action: 'Freeze case until reviewed' }
    ],
    fallbackBehavior: 'Park the case for later review',
    outputAndActionGuardrails: [
      'Do not expose internal reasoning',
      'Do not execute irreversible actions without final check'
    ],
    conflictResolutionRules: [
      'Global safety rules override local settings',
      'Hard blocks override everything'
    ],
    auditTriggers: [
      'Escalation triggered',
      'Approval requested',
      'Fallback activated'
    ],
    showRoutingGuards: true
  },
  'Approval Gatekeeper': {
    template: 'Approval safety template',
    riskProfile: 'High-risk guarded',
    effectiveSafetySummary: [
      'Requires absolute certainty before approving',
      'Blocks immediately on ambiguity or missing evidence',
      'Mandatory pre-execution checks for all approvals'
    ],
    overviewMetrics: {
      blockRules: 8,
      safeToRunChecks: 7,
      escalationTriggers: 3,
      auditTriggers: 6
    },
    allowedAutonomyLevel: 'Never act autonomously on sensitive cases',
    autoStopConditions: [
      'Evidence missing',
      'Confidence too low',
      'Policy conflict',
      'Required field missing'
    ],
    sensitiveCaseGuards: [
      { caseType: 'Payment-related actions', action: 'Require human review' },
      { caseType: 'Account ownership changes', action: 'Block autonomous handling' }
    ],
    preExecutionSafetyChecks: [
      'Required evidence present',
      'Policy matched successfully',
      'Customer/account identity verified',
      'No conflict between sources'
    ],
    uncertaintySafetyBehavior: 'Block action under ambiguity',
    escalationTriggers: [
      { trigger: 'Fraud indicators', action: 'Re-route to specialist agent' },
      { trigger: 'High-value order', action: 'Send to approval queue' }
    ],
    fallbackBehavior: 'Send to approval queue',
    outputAndActionGuardrails: [
      'Do not expose internal reasoning',
      'Do not speculate beyond evidence'
    ],
    conflictResolutionRules: [
      'Missing evidence blocks sensitive execution',
      'Approval requirement overrides autonomy'
    ],
    auditTriggers: [
      'Blocked action',
      'Approval requested',
      'Sensitive data guard activated'
    ],
    showComplianceGuards: true
  },
  'Refunds & Returns': {
    template: 'Commerce operations safety template',
    riskProfile: 'High-risk guarded',
    effectiveSafetySummary: [
      'Requires pre-execution validation before financial actions',
      'Must stop if fraud flag is present or threshold exceeded',
      'Escalates automatically for high-value refunds'
    ],
    overviewMetrics: {
      blockRules: 6,
      safeToRunChecks: 8,
      escalationTriggers: 5,
      auditTriggers: 7
    },
    allowedAutonomyLevel: 'Act under thresholds',
    autoStopConditions: [
      'Threshold exceeded',
      'Fraud flag present',
      'High-value transaction',
      'Evidence missing'
    ],
    sensitiveCaseGuards: [
      { caseType: 'Refunds above threshold', action: 'Require human review' },
      { caseType: 'Fraud-related cases', action: 'Block autonomous handling' }
    ],
    preExecutionSafetyChecks: [
      'Financial context validated',
      'Fraud status checked',
      'Threshold not exceeded',
      'Policy matched successfully'
    ],
    uncertaintySafetyBehavior: 'Suggest but do not execute',
    escalationTriggers: [
      { trigger: 'High refund amount', action: 'Send to approval queue' },
      { trigger: 'Customer dispute', action: 'Escalate to human' }
    ],
    fallbackBehavior: 'Stop and log',
    outputAndActionGuardrails: [
      'Do not execute irreversible actions without final check',
      'Do not reveal hidden flags'
    ],
    conflictResolutionRules: [
      'Hard blocks override everything',
      'Policy conflict triggers stop or escalation'
    ],
    auditTriggers: [
      'Threshold exceeded',
      'Blocked action',
      'Escalation triggered'
    ],
    showFinancialGuards: true
  },
  'Channel Ingest': {
    template: 'Intake safety template',
    riskProfile: 'Low-risk autonomous',
    effectiveSafetySummary: [
      'Can operate autonomously to parse and route input',
      'Stops and flags malformed or unsupported input',
      'Does not execute business actions, only prepares data'
    ],
    overviewMetrics: {
      blockRules: 2,
      safeToRunChecks: 3,
      escalationTriggers: 2,
      auditTriggers: 4
    },
    allowedAutonomyLevel: 'Observe only',
    autoStopConditions: [
      'Unsupported case type',
      'Malformed input',
      'Source validation failed'
    ],
    sensitiveCaseGuards: [
      { caseType: 'PII-heavy cases', action: 'Require extra checks' }
    ],
    preExecutionSafetyChecks: [
      'Input format valid',
      'Source authenticated'
    ],
    uncertaintySafetyBehavior: 'Proceed with best-effort only in low-risk cases',
    escalationTriggers: [
      { trigger: 'Unrecognized format', action: 'Re-route to specialist agent' }
    ],
    fallbackBehavior: 'Return safe default response',
    outputAndActionGuardrails: [
      'Do not surface internal notes externally',
      'Do not override masked sensitive data rules'
    ],
    conflictResolutionRules: [
      'Hard blocks override everything'
    ],
    auditTriggers: [
      'Unsupported case blocked',
      'Parsing failure'
    ],
    showInputGuards: true
  }
};
