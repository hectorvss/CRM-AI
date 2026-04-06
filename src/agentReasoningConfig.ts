export type CoreReasoningMode = 'Fast' | 'Balanced' | 'Thorough' | 'Critical' | 'Custom';
export type DepthOfAnalysis = 'Minimal scan' | 'Standard review' | 'Deep review' | 'Exhaustive review';
export type SpeedVsPrecision = 'Fast response' | 'Balanced response' | 'Precision-first';
export type VerificationBehavior = 'No formal verification' | 'Light verification' | 'Moderate verification' | 'Strict verification';
export type MultiSourceCrossChecking = 'One trusted source' | 'One source + contextual confirmation' | 'Multiple sources when available' | 'Mandatory multi-source agreement';
export type UncertaintyHandling = 'Proceed with best-effort judgment' | 'Proceed only in low-risk cases' | 'Respond with caveats' | 'Request more context first' | 'Defer decision if confidence is low' | 'Avoid action under ambiguity';
export type DecisionStrictness = 'Conservative' | 'Balanced' | 'Assertive' | 'Strict-compliance-first' | 'Heuristic / flexible';
export type ResponseConstructionLogic = 'Concise outcome only' | 'Outcome + reasoning summary' | 'Outcome + evidence references' | 'Structured decision explanation' | 'Decision + confidence signal' | 'Recommendation + uncertainties';

export type ReasoningTrigger = {
  caseType: string;
  reasoningBehavior: string;
};

export type AgentReasoningConfig = {
  template: string;
  effectiveReasoningSummary: string[];
  coreReasoningMode: CoreReasoningMode;
  depthOfAnalysis: DepthOfAnalysis;
  speedVsPrecision: SpeedVsPrecision;
  contextGathering: string[];
  verificationBehavior: VerificationBehavior;
  multiSourceCrossChecking: MultiSourceCrossChecking;
  uncertaintyHandling: UncertaintyHandling;
  escalationToDeeperThinking: string[];
  decisionStrictness: DecisionStrictness;
  responseConstructionLogic: ResponseConstructionLogic;
  reasoningTriggersByCaseType: ReasoningTrigger[];
};

export const agentReasoningConfig: Record<string, AgentReasoningConfig> = {
  'Supervisor': {
    template: 'Orchestration reasoning template',
    effectiveReasoningSummary: [
      'Prioritizes fast routing with minimal analysis',
      'Uses shallow intake analysis, then hands off to downstream agents',
      'Defers decision if confidence is low'
    ],
    coreReasoningMode: 'Fast',
    depthOfAnalysis: 'Minimal scan',
    speedVsPrecision: 'Fast response',
    contextGathering: ['Current message only', 'Case context'],
    verificationBehavior: 'Light verification',
    multiSourceCrossChecking: 'One trusted source',
    uncertaintyHandling: 'Defer decision if confidence is low',
    escalationToDeeperThinking: ['Low confidence', 'Contradictory signals'],
    decisionStrictness: 'Balanced',
    responseConstructionLogic: 'Concise outcome only',
    reasoningTriggersByCaseType: [
      { caseType: 'Routine cases', reasoningBehavior: 'Shallow reasoning' },
      { caseType: 'Ambiguous cases', reasoningBehavior: 'Deeper reasoning' }
    ]
  },
  'Approval Gatekeeper': {
    template: 'Approval reasoning template',
    effectiveReasoningSummary: [
      'Requires strong evidence before approving sensitive decisions',
      'Prefers precision over speed on ambiguous cases',
      'Performs strict verification but only within current-case context'
    ],
    coreReasoningMode: 'Critical',
    depthOfAnalysis: 'Exhaustive review',
    speedVsPrecision: 'Precision-first',
    contextGathering: ['Case context', 'Related records', 'Customer history'],
    verificationBehavior: 'Strict verification',
    multiSourceCrossChecking: 'Mandatory multi-source agreement',
    uncertaintyHandling: 'Avoid action under ambiguity',
    escalationToDeeperThinking: ['Policy conflict detected', 'High-value case', 'Sensitive customer data involved'],
    decisionStrictness: 'Strict-compliance-first',
    responseConstructionLogic: 'Structured decision explanation',
    reasoningTriggersByCaseType: [
      { caseType: 'Financial-impact cases', reasoningBehavior: 'Precision-first' },
      { caseType: 'Policy-sensitive cases', reasoningBehavior: 'Strict verification' }
    ]
  },
  'QA / Policy Check': {
    template: 'Validation reasoning template',
    effectiveReasoningSummary: [
      'Performs moderate verification before acting',
      'Requires strong evidence before validating risky actions',
      'Uses moderate reasoning with escalation to deep review on complex cases'
    ],
    coreReasoningMode: 'Thorough',
    depthOfAnalysis: 'Deep review',
    speedVsPrecision: 'Precision-first',
    contextGathering: ['Case context', 'Cross-system context if available'],
    verificationBehavior: 'Strict verification',
    multiSourceCrossChecking: 'Multiple sources when available',
    uncertaintyHandling: 'Request more context first',
    escalationToDeeperThinking: ['Policy conflict detected', 'Missing evidence', 'Unusual or rare pattern detected'],
    decisionStrictness: 'Strict-compliance-first',
    responseConstructionLogic: 'Outcome + evidence references',
    reasoningTriggersByCaseType: [
      { caseType: 'Account-risk cases', reasoningBehavior: 'Multi-source verification' },
      { caseType: 'Ambiguous cases', reasoningBehavior: 'Deeper reasoning' }
    ]
  },
  'Channel Ingest': {
    template: 'Intake reasoning template',
    effectiveReasoningSummary: [
      'Prioritizes fast routing with minimal analysis',
      'Uses shallow intake analysis, then hands off to downstream agents',
      'Proceeds with best-effort judgment on partial data'
    ],
    coreReasoningMode: 'Fast',
    depthOfAnalysis: 'Minimal scan',
    speedVsPrecision: 'Fast response',
    contextGathering: ['Current message only'],
    verificationBehavior: 'No formal verification',
    multiSourceCrossChecking: 'One trusted source',
    uncertaintyHandling: 'Proceed with best-effort judgment',
    escalationToDeeperThinking: ['Missing evidence'],
    decisionStrictness: 'Heuristic / flexible',
    responseConstructionLogic: 'Concise outcome only',
    reasoningTriggersByCaseType: [
      { caseType: 'Low-risk cases', reasoningBehavior: 'Shallow reasoning' }
    ]
  },
  'Customer Communication Agent': {
    template: 'Operational reasoning template',
    effectiveReasoningSummary: [
      'Performs moderate verification before acting',
      'Prefers precision over speed on ambiguous cases',
      'Responds with caveats when uncertain'
    ],
    coreReasoningMode: 'Balanced',
    depthOfAnalysis: 'Standard review',
    speedVsPrecision: 'Balanced response',
    contextGathering: ['Case context', 'Customer history'],
    verificationBehavior: 'Moderate verification',
    multiSourceCrossChecking: 'One source + contextual confirmation',
    uncertaintyHandling: 'Respond with caveats',
    escalationToDeeperThinking: ['Sensitive customer data involved', 'Contradictory signals'],
    decisionStrictness: 'Balanced',
    responseConstructionLogic: 'Outcome + reasoning summary',
    reasoningTriggersByCaseType: [
      { caseType: 'Routine cases', reasoningBehavior: 'Balanced reasoning' },
      { caseType: 'Ambiguous cases', reasoningBehavior: 'Deeper reasoning' }
    ]
  }
};

export const defaultReasoningConfig: AgentReasoningConfig = {
  template: 'Standard reasoning template',
  effectiveReasoningSummary: [
    'Performs moderate verification before acting',
    'Uses balanced reasoning for standard cases'
  ],
  coreReasoningMode: 'Balanced',
  depthOfAnalysis: 'Standard review',
  speedVsPrecision: 'Balanced response',
  contextGathering: ['Case context'],
  verificationBehavior: 'Moderate verification',
  multiSourceCrossChecking: 'One trusted source',
  uncertaintyHandling: 'Request more context first',
  escalationToDeeperThinking: ['Low confidence'],
  decisionStrictness: 'Balanced',
  responseConstructionLogic: 'Outcome + reasoning summary',
  reasoningTriggersByCaseType: [
    { caseType: 'Routine cases', reasoningBehavior: 'Balanced reasoning' }
  ]
};
