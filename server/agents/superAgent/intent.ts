export type NavigationTarget = {
  page: string;
  entityType?: string | null;
  entityId?: string | null;
  section?: string | null;
  sourceContext?: string | null;
  runId?: string | null;
};

export type CommandContext = {
  sessionId?: string | null;
  recentTargets?: NavigationTarget[];
  activeTarget?: NavigationTarget | null;
  lastStructuredIntent?: Record<string, any> | null;
};

export type StructuredCommand = {
  kind:
    | 'approval_queue'
    | 'payment_queue'
    | 'case'
    | 'order'
    | 'payment'
    | 'return'
    | 'customer'
    | 'workflow'
    | 'agents'
    | 'conflicts'
    | 'search';
  intent: 'investigate' | 'open' | 'search' | 'explain_blocker' | 'compare' | 'operate';
  id?: string;
  query?: string;
  targetEntityType?: string | null;
  targetEntityRef?: string | null;
  requestedAction?: string | null;
  filters: string[];
  riskLevel: 'low' | 'medium' | 'high';
  needsConfirmation: boolean;
  navigationTarget?: NavigationTarget | null;
};

export function entityTypeFromPage(page?: string | null) {
  switch (page) {
    case 'inbox':
    case 'case_graph':
      return 'case';
    case 'orders':
      return 'order';
    case 'payments':
      return 'payment';
    case 'returns':
      return 'return';
    case 'approvals':
      return 'approval';
    case 'customers':
      return 'customer';
    case 'workflows':
      return 'workflow';
    case 'knowledge':
      return 'knowledge';
    case 'reports':
      return 'report';
    case 'settings':
      return 'setting';
    default:
      return 'workspace';
  }
}

export function pageFromEntityType(entityType?: string | null) {
  switch (entityType) {
    case 'case':
      return 'case_graph';
    case 'order':
      return 'orders';
    case 'payment':
      return 'payments';
    case 'return':
      return 'returns';
    case 'approval':
      return 'approvals';
    case 'customer':
      return 'customers';
    case 'workflow':
      return 'workflows';
    default:
      return 'super_agent';
  }
}

export function buildNavigationTarget(input: {
  page: string;
  entityType?: string | null;
  entityId?: string | null;
  section?: string | null;
  sourceContext?: string | null;
  runId?: string | null;
}): NavigationTarget {
  return {
    page: input.page,
    entityType: input.entityType ?? entityTypeFromPage(input.page),
    entityId: input.entityId ?? null,
    section: input.section ?? null,
    sourceContext: input.sourceContext ?? null,
    runId: input.runId ?? null,
  };
}

function parseEntityId(input: string, pattern: RegExp) {
  const match = input.match(pattern);
  return match ? match[0] : null;
}

function isWeakEntityQuery(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return !normalized
    || normalized.length < 3
    || [
      'ese',
      'esa',
      'eso',
      'este',
      'esta',
      'estos',
      'estas',
      'el',
      'la',
      'los',
      'las',
      'pedido',
      'order',
      'caso',
      'pago',
      'payment',
      'workflow',
      'flujo',
      'cliente',
      'customer',
      'devolucion',
      'return',
    ].includes(normalized);
}

function resolveEntityReference(primary: string | null, fallback: string | null, input: string) {
  if (primary && !isWeakEntityQuery(primary)) return primary;
  if (fallback) return fallback;
  return primary || input.trim();
}

export function resolveRelativeTarget(text: string, context?: CommandContext | null) {
  if (context?.activeTarget) {
    const activeTarget = context.activeTarget;
    const wantsOrder = /(pedido|order)/.test(text);
    const wantsPayment = /(pago|payment|refund)/.test(text);
    const wantsReturn = /(devolucion|return)/.test(text);
    const wantsApproval = /(aprob|approval)/.test(text);
    const wantsCustomer = /(cliente|customer)/.test(text);
    const wantsWorkflow = /(workflow)/.test(text);
    const wantsCase = /(caso|case|hilo|thread)/.test(text);

    const matchesActive =
      (wantsOrder && activeTarget.entityType === 'order') ||
      (wantsPayment && activeTarget.entityType === 'payment') ||
      (wantsReturn && activeTarget.entityType === 'return') ||
      (wantsApproval && activeTarget.entityType === 'approval') ||
      (wantsCustomer && activeTarget.entityType === 'customer') ||
      (wantsWorkflow && activeTarget.entityType === 'workflow') ||
      (wantsCase && activeTarget.entityType === 'case');

    if (matchesActive) return activeTarget;
  }

  const recentTargets = Array.isArray(context?.recentTargets) ? context!.recentTargets! : [];
  if (!recentTargets.length) return null;

  const wantsOrder = /(pedido|order)/.test(text);
  const wantsPayment = /(pago|payment|refund)/.test(text);
  const wantsReturn = /(devolucion|return)/.test(text);
  const wantsApproval = /(aprob|approval)/.test(text);
  const wantsCustomer = /(cliente|customer)/.test(text);
  const wantsWorkflow = /(workflow)/.test(text);
  const wantsCase = /(caso|case|hilo|thread)/.test(text);

  const desiredType =
    wantsOrder ? 'order'
      : wantsPayment ? 'payment'
        : wantsReturn ? 'return'
          : wantsApproval ? 'approval'
            : wantsCustomer ? 'customer'
              : wantsWorkflow ? 'workflow'
                : wantsCase ? 'case'
                  : null;

  return recentTargets.find((target) => !desiredType || target.entityType === desiredType) || recentTargets[0];
}

export function parseCommandIntent(input: string, context?: CommandContext | null): StructuredCommand {
  const text = input.trim().toLowerCase();
  const caseId = parseEntityId(input, /\bcas(?:[_-][a-z0-9]+|\d+)\b/i);
  const orderId = parseEntityId(input, /\bord(?:[_-][a-z0-9]+|\d+)\b/i);
  const paymentId = parseEntityId(input, /\bpay(?:[_-][a-z0-9]+|\d+)\b/i);
  const returnId = parseEntityId(input, /\bret(?:[_-][a-z0-9]+|\d+)\b/i);
  const workflowId = parseEntityId(input, /\bwf(?:[_-][a-z0-9]+|\d+)\b/i);
  const recentTarget = resolveRelativeTarget(text, context);
  const orderQuery = input.replace(/pedido|order|abrir|open|revisa|review|investiga|investigate/gi, '').trim();
  const paymentQuery = input.replace(/pago|payment|refund|reembolso|abrir|open|revisa|review|investiga|investigate/gi, '').trim();
  const caseQuery = input.replace(/caso|case|hilo|thread|abrir|open|revisa|review|investiga|investigate/gi, '').trim();
  const returnQuery = input.replace(/devolucion|return|abrir|open|revisa|review|investiga|investigate/gi, '').trim();
  const customerQuery = input.replace(/cliente|customer|abrir|open|revisa|review|investiga|investigate/gi, '').trim();
  const workflowQuery = input.replace(/workflow|flujo|abrir|open|publica|publish|revisa|review|investiga|investigate/gi, '').trim();
  const filters = [
    text.includes('pend') ? 'pending' : null,
    text.includes('bloque') ? 'blocked' : null,
    text.includes('alto riesgo') || text.includes('high risk') ? 'high_risk' : null,
  ].filter(Boolean) as string[];
  const intent =
    /(abrir|abre|open|go to|ll[eé]vame|navega)/.test(text) ? 'open'
      : /(por que|por qué|why|bloquead|blocked)/.test(text) ? 'explain_blocker'
        : /(compara|compare)/.test(text) ? 'compare'
          : /(cancel|refund|reembolso|aprueba|approve|rechaza|reject|publica|publish|actualiza|update|cambia|change|cierra|close)/.test(text) ? 'operate'
            : /(busca|search)/.test(text) ? 'search'
              : 'investigate';
  const requestedAction =
    /(cancel|cancela)/.test(text) ? 'cancel'
      : /(refund|reembolso)/.test(text) ? 'refund'
        : /(approve|aprueba)/.test(text) ? 'approve'
          : /(reject|rechaza)/.test(text) ? 'reject'
            : /(publish|publica)/.test(text) ? 'publish'
              : /(open|abrir)/.test(text) ? 'open'
                : /(update|actualiza|change|cambia|close|cierra)/.test(text) ? 'update'
                  : null;

  let command: StructuredCommand | null = null;

  if (text.includes('inconsist') || text.includes('conflict')) {
    command = {
      kind: 'conflicts',
      intent: intent === 'search' ? 'explain_blocker' : intent,
      targetEntityType: recentTarget?.entityType || null,
      targetEntityRef: recentTarget?.entityId || null,
      requestedAction,
      filters,
      riskLevel: 'high',
      needsConfirmation: false,
      navigationTarget: recentTarget || buildNavigationTarget({ page: 'super_agent' }),
    };
  } else if ((text.includes('aprob') || text.includes('approval')) && text.includes('pend')) {
    command = {
      kind: 'approval_queue',
      intent,
      targetEntityType: 'approval',
      targetEntityRef: null,
      requestedAction,
      filters: filters.length ? filters : ['pending'],
      riskLevel: 'medium',
      needsConfirmation: false,
      navigationTarget: buildNavigationTarget({ page: 'approvals', entityType: 'approval' }),
    };
  } else if ((text.includes('pago') || text.includes('payment')) && (text.includes('pend') || text.includes('bloque') || text.includes('refund'))) {
    command = {
      kind: 'payment_queue',
      intent,
      targetEntityType: 'payment',
      targetEntityRef: null,
      requestedAction,
      filters,
      riskLevel: filters.includes('high_risk') ? 'high' : 'medium',
      needsConfirmation: false,
      navigationTarget: buildNavigationTarget({ page: 'payments', entityType: 'payment' }),
    };
  } else if (caseId || ((text.includes('caso') || text.includes('case')) && caseQuery) || recentTarget?.entityType === 'case') {
    const resolved = resolveEntityReference(caseId, recentTarget?.entityType === 'case' ? recentTarget?.entityId || null : null, caseQuery || input.trim());
    command = {
      kind: 'case',
      intent,
      id: resolved,
      targetEntityType: 'case',
      targetEntityRef: resolved,
      requestedAction,
      filters,
      riskLevel: filters.includes('high_risk') ? 'high' : 'medium',
      needsConfirmation: requestedAction !== null,
      navigationTarget: buildNavigationTarget({ page: 'case_graph', entityType: 'case', entityId: resolved }),
    };
  } else if (orderId || ((text.includes('pedido') || text.includes('order')) && orderQuery) || recentTarget?.entityType === 'order') {
    const resolved = resolveEntityReference(orderId, recentTarget?.entityType === 'order' ? recentTarget?.entityId || null : null, orderQuery || input.trim());
    command = {
      kind: 'order',
      intent,
      id: resolved,
      targetEntityType: 'order',
      targetEntityRef: resolved,
      requestedAction,
      filters,
      riskLevel: requestedAction === 'cancel' ? 'high' : 'medium',
      needsConfirmation: requestedAction === 'cancel',
      navigationTarget: buildNavigationTarget({ page: 'orders', entityType: 'order', entityId: resolved }),
    };
  } else if (paymentId || ((text.includes('pago') || text.includes('payment')) && paymentQuery) || recentTarget?.entityType === 'payment') {
    const resolved = resolveEntityReference(paymentId, recentTarget?.entityType === 'payment' ? recentTarget?.entityId || null : null, paymentQuery || input.trim());
    command = {
      kind: 'payment',
      intent,
      id: resolved,
      targetEntityType: 'payment',
      targetEntityRef: resolved,
      requestedAction,
      filters,
      riskLevel: requestedAction === 'refund' ? 'high' : 'medium',
      needsConfirmation: requestedAction === 'refund',
      navigationTarget: buildNavigationTarget({ page: 'payments', entityType: 'payment', entityId: resolved }),
    };
  } else if (returnId || ((text.includes('devolucion') || text.includes('return')) && returnQuery) || recentTarget?.entityType === 'return') {
    const resolved = resolveEntityReference(returnId, recentTarget?.entityType === 'return' ? recentTarget?.entityId || null : null, returnQuery || input.trim());
    command = {
      kind: 'return',
      intent,
      id: resolved,
      targetEntityType: 'return',
      targetEntityRef: resolved,
      requestedAction,
      filters,
      riskLevel: filters.includes('high_risk') ? 'high' : 'medium',
      needsConfirmation: false,
      navigationTarget: buildNavigationTarget({ page: 'returns', entityType: 'return', entityId: resolved }),
    };
  } else if (text.includes('workflow') || text.includes('flujo') || workflowId || recentTarget?.entityType === 'workflow') {
    const resolved = resolveEntityReference(workflowId, recentTarget?.entityType === 'workflow' ? recentTarget?.entityId || null : null, workflowQuery || '').trim() || null;
    command = {
      kind: 'workflow',
      intent,
      id: resolved || undefined,
      query: workflowQuery || undefined,
      targetEntityType: 'workflow',
      targetEntityRef: resolved,
      requestedAction,
      filters,
      riskLevel: requestedAction === 'publish' ? 'high' : 'medium',
      needsConfirmation: requestedAction === 'publish',
      navigationTarget: buildNavigationTarget({ page: 'workflows', entityType: 'workflow', entityId: resolved }),
    };
  } else if (text.includes('agente') || text.includes('agent')) {
    command = {
      kind: 'agents',
      intent,
      targetEntityType: 'agent',
      targetEntityRef: null,
      requestedAction,
      filters,
      riskLevel: 'low',
      needsConfirmation: false,
      navigationTarget: buildNavigationTarget({ page: 'super_agent', entityType: 'agent' }),
    };
  } else if (text.includes('cliente') || text.includes('customer') || recentTarget?.entityType === 'customer') {
    const resolved = customerQuery || recentTarget?.entityId || input.trim();
    command = {
      kind: 'customer',
      intent,
      query: resolved,
      targetEntityType: 'customer',
      targetEntityRef: resolved,
      requestedAction,
      filters,
      riskLevel: filters.includes('high_risk') ? 'high' : 'low',
      needsConfirmation: false,
      navigationTarget: buildNavigationTarget({ page: 'customers', entityType: 'customer', entityId: recentTarget?.entityType === 'customer' ? recentTarget.entityId : null }),
    };
  }

  if (command) {
    return command;
  }

  return {
    kind: 'search',
    intent,
    query: input.trim(),
    targetEntityType: recentTarget?.entityType || null,
    targetEntityRef: recentTarget?.entityId || null,
    requestedAction,
    filters,
    riskLevel: filters.includes('high_risk') ? 'high' : 'low',
    needsConfirmation: false,
    navigationTarget: recentTarget || context?.activeTarget || buildNavigationTarget({ page: 'super_agent' }),
  };
}
