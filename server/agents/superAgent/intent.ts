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
  return primary || fallback || null;
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
  const safeInput = String(input ?? '');
  const text = safeInput.trim().toLowerCase();
  const caseId = parseEntityId(safeInput, /\bcas(?:[_-][a-z0-9]+|\d+)\b/i);
  const orderId = parseEntityId(safeInput, /\bord(?:[_-][a-z0-9]+|\d+)\b/i);
  const paymentId = parseEntityId(safeInput, /\bpay(?:[_-][a-z0-9]+|\d+)\b/i);
  const returnId = parseEntityId(safeInput, /\bret(?:[_-][a-z0-9]+|\d+)\b/i);
  const workflowId = parseEntityId(safeInput, /\bwf(?:[_-][a-z0-9]+|\d+)\b/i);
  const customerId = parseEntityId(safeInput, /\bcust(?:[_-][a-z0-9]+|\d+)\b/i);
  const recentTarget = resolveRelativeTarget(text, context);
  const orderQuery = safeInput.replace(/pedido|order|abrir|open|revisa|review|investiga|investigate/gi, '').trim();
  const paymentQuery = safeInput.replace(/pago|payment|refund|reembolso|abrir|open|revisa|review|investiga|investigate/gi, '').trim();
  const caseQuery = safeInput.replace(/caso|case|hilo|thread|abrir|open|revisa|review|investiga|investigate/gi, '').trim();
  const returnQuery = safeInput.replace(/devolucion|return|abrir|open|revisa|review|investiga|investigate/gi, '').trim();
  const customerQuery = safeInput.replace(/cliente|customer|abrir|open|revisa|review|investiga|investigate/gi, '').trim();
  const workflowQuery = safeInput.replace(/workflow|flujo|abrir|open|publica|publish|revisa|review|investiga|investigate|dispara|activa|trigger|fire/gi, '').trim();
  const filters = [
    text.includes('pend') ? 'pending' : null,
    text.includes('bloque') ? 'blocked' : null,
    text.includes('alto riesgo') || text.includes('high risk') ? 'high_risk' : null,
    (text.includes('abiert') || (text.includes('open') && !/(abrir|abre|go to|ll[eé]vame|navega)/.test(text))) ? 'open' : null,
  ].filter(Boolean) as string[];
  const intent =
    /(abrir|abre|open|go to|ll[eé]vame|navega)/.test(text) ? 'open'
      : /(por que|por qué|why|bloquead|blocked)/.test(text) ? 'explain_blocker'
        : /(compara|compare)/.test(text) ? 'compare'
          : /(cancel|refund|reembolso|aprueba|approve|rechaza|reject|publica|publish|actualiza|update|cambia|change|cierra|close|asigna|assign|dispara|activa|trigger|fire event|notifica|notify|manda|envía|envia|send)/.test(text) ? 'operate'
            : /(busca|search)/.test(text) ? 'search'
              : 'investigate';
  const requestedAction =
    /(cancel|cancela)/.test(text) ? 'cancel'
      // close_and_notify must be checked before notify
      : /(close.*notif|notif.*close|cierra.*manda|manda.*cierra|cierra.*email|email.*cierra)/.test(text) ? 'close_and_notify'
        : /(notifica|notify|manda\s+(email|mensaje|notif)|envía?\s+(email|mensaje)|send\s+(email|message|notification))/.test(text) ? 'notify'
          : /(refund|reembolso)/.test(text) && !/(notifica|notify)/.test(text) ? 'refund'
            : /(approve|aprueba)/.test(text) ? 'approve'
              : /(reject|rechaza)/.test(text) ? 'reject'
                : /(publish|publica)/.test(text) ? 'publish'
                  : /(asigna|assign)/.test(text) ? 'assign'
                    : /(prioridad|priority)/.test(text) ? 'update_priority'
                      : /(dispara.*evento|fire.*event|evento.*dispara)/.test(text) ? 'fire_event'
                        : /(activa|trigger).*workflow|workflow.*(activa|trigger)/.test(text) ? 'trigger'
                          : /(open|abrir)/.test(text) ? 'open'
                            : /(segmento|segment|riesgo|risk.level|canal|channel|vip|regular|premium)/.test(text) ? 'update'
                              : /(update|actualiza|change|cambia|close|cierra)/.test(text) ? 'update'
                                : null;

  let command: StructuredCommand | null = null;

  // ── Fire-event / workflow-trigger keyword override ───────────────────────
  // Must be tested before orderId/entityId branches because event names like
  // "order.updated" contain the word "order" which would otherwise win.
  const isFireEventIntent = /(dispara.*evento|fire.*event|evento.*dispara)/.test(text);
  const isTriggerWorkflowIntent = /(activa.*workflow|trigger.*workflow|workflow.*activa|workflow.*trigger)/.test(text);

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
  } else if (isFireEventIntent || isTriggerWorkflowIntent) {
    // Explicit "fire event" / "trigger workflow" intent — routes here BEFORE orderId/order matching
    // so event names like "order.updated" don't accidentally route to the order branch.
    const rawResolved = resolveEntityReference(workflowId, recentTarget?.entityType === 'workflow' ? recentTarget?.entityId || null : null, workflowQuery || '');
    const resolved = rawResolved ? rawResolved.trim() || null : null;
    const workflowWriteActions = ['publish', 'trigger', 'fire_event'];
    command = {
      kind: 'workflow',
      intent: 'operate',
      id: resolved || undefined,
      query: workflowQuery || undefined,
      targetEntityType: 'workflow',
      targetEntityRef: resolved,
      requestedAction: isFireEventIntent ? 'fire_event' : 'trigger',
      filters,
      riskLevel: 'medium',
      needsConfirmation: true,
      navigationTarget: buildNavigationTarget({ page: 'workflows', entityType: 'workflow', entityId: resolved }),
    };
  } else if (caseId || ((text.includes('caso') || text.includes('case')) && caseQuery) || recentTarget?.entityType === 'case') {
    const resolved = resolveEntityReference(caseId, recentTarget?.entityType === 'case' ? recentTarget?.entityId || null : null, caseQuery || safeInput.trim());
    const caseWriteActions = new Set(['cancel', 'approve', 'reject', 'update', 'close_and_notify', 'assign', 'update_priority', 'notify']);
    command = {
      kind: 'case',
      intent: intent === 'investigate' && requestedAction && caseWriteActions.has(requestedAction) ? 'operate' : intent,
      id: resolved,
      targetEntityType: 'case',
      targetEntityRef: resolved,
      requestedAction,
      filters,
      riskLevel: filters.includes('high_risk') ? 'high' : 'medium',
      needsConfirmation: requestedAction !== null && requestedAction !== 'open',
      navigationTarget: buildNavigationTarget({ page: 'case_graph', entityType: 'case', entityId: resolved }),
    };
  } else if (orderId || ((text.includes('pedido') || text.includes('order')) && orderQuery) || recentTarget?.entityType === 'order') {
    const resolved = resolveEntityReference(orderId, recentTarget?.entityType === 'order' ? recentTarget?.entityId || null : null, orderQuery || safeInput.trim());
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
    const resolved = resolveEntityReference(paymentId, recentTarget?.entityType === 'payment' ? recentTarget?.entityId || null : null, paymentQuery || safeInput.trim());
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
    const resolved = resolveEntityReference(returnId, recentTarget?.entityType === 'return' ? recentTarget?.entityId || null : null, returnQuery || safeInput.trim());
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
  } else if (text.includes('workflow') || text.includes('flujo') || workflowId || recentTarget?.entityType === 'workflow' || /(dispara.*evento|fire.*event|activa.*workflow)/.test(text)) {
    const resolved = resolveEntityReference(workflowId, recentTarget?.entityType === 'workflow' ? recentTarget?.entityId || null : null, workflowQuery || '').trim() || null;
    const workflowWriteActions = ['publish', 'trigger', 'fire_event'];
    command = {
      kind: 'workflow',
      intent: intent === 'investigate' && requestedAction && workflowWriteActions.includes(requestedAction) ? 'operate' : intent,
      id: resolved || undefined,
      query: workflowQuery || undefined,
      targetEntityType: 'workflow',
      targetEntityRef: resolved,
      requestedAction,
      filters,
      riskLevel: requestedAction === 'publish' ? 'high' : 'medium',
      needsConfirmation: requestedAction !== null && (workflowWriteActions.includes(requestedAction) || requestedAction === 'update'),
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
  } else if (customerId || text.includes('cliente') || text.includes('customer') || recentTarget?.entityType === 'customer') {
    // Prefer extracted cust_xxx ID; fall back to query string or recent target
    const resolvedCustomerId = customerId || (recentTarget?.entityType === 'customer' ? recentTarget.entityId || null : null);
    const resolvedRef = resolvedCustomerId || customerQuery || safeInput.trim();
    command = {
      kind: 'customer',
      intent,
      query: customerQuery || undefined,
      targetEntityType: 'customer',
      targetEntityRef: resolvedRef,
      requestedAction,
      filters,
      riskLevel: filters.includes('high_risk') ? 'high' : 'low',
      needsConfirmation: requestedAction !== null && requestedAction !== 'open',
      navigationTarget: buildNavigationTarget({ page: 'customers', entityType: 'customer', entityId: resolvedCustomerId }),
    };
  }

  if (command) {
    return command;
  }

  return {
    kind: 'search',
    intent,
    query: safeInput.trim(),
    targetEntityType: recentTarget?.entityType || null,
    targetEntityRef: recentTarget?.entityId || null,
    requestedAction,
    filters,
    riskLevel: filters.includes('high_risk') ? 'high' : 'low',
    needsConfirmation: false,
    navigationTarget: recentTarget || context?.activeTarget || buildNavigationTarget({ page: 'super_agent' }),
  };
}
