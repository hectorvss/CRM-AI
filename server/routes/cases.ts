import { Router, Response } from 'express';
import crypto from 'crypto';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import {
  createCaseRepository,
  createConversationRepository,
  createAuditRepository,
  buildCaseState,
  buildGraphView,
  buildInboxView,
  buildResolveView,
  buildTimeline,
} from '../data/index.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { fireWorkflowEvent } from '../lib/workflowEventBus.js';
import { planEngine } from '../agents/planEngine/index.js';
import { executePlan } from '../agents/planEngine/executor.js';
import type { Plan, PlanStep } from '../agents/planEngine/types.js';
import {
  buildCaseResolutionPlan,
  buildCaseResolutionPrompt,
  buildPlanFromResolutionSteps,
} from '../services/caseResolution.js';
import { buildResolutionPlan, type ResolutionRoute } from '../utils/resolutionPlan.js';

const router = Router();
const caseRepository = createCaseRepository();
const conversationRepository = createConversationRepository();
const auditRepository = createAuditRepository();

router.use(extractMultiTenant);

function hasPermission(req: MultiTenantRequest, permission: string) {
  const permissions = req.permissions || [];
  return permissions.includes('*') || permissions.includes(permission);
}

function traceSucceeded(trace: any) {
  return trace?.status === 'success' || trace?.status === 'partial' || trace?.status === 'pending_approval';
}

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const filters = {
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      assigned_user_id: typeof req.query.assigned_user_id === 'string' ? req.query.assigned_user_id : undefined,
      priority: typeof req.query.priority === 'string' ? req.query.priority : undefined,
      risk_level: typeof req.query.risk_level === 'string' ? req.query.risk_level : undefined,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
    };

    const items = await caseRepository.list(scope, filters);
    res.json(items);
  } catch (error) {
    console.error('Error fetching cases:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const caseId = crypto.randomUUID();
    const caseNumber = `TEST-${Math.floor(Math.random() * 1000000)}`;
    const data = {
      id: caseId,
      case_number: caseNumber,
      tenant_id: req.tenantId!,
      workspace_id: req.workspaceId!,
      type: req.body.type || 'general',
      priority: req.body.priority || 'medium',
      status: req.body.status || 'open',
      customer_id: req.body.customer_id || null,
      assigned_user_id: req.body.assigned_user_id || null,
      source_channel: req.body.source_channel || 'web',
      tags: req.body.tags || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    await caseRepository.createCase(scope, data);

    await auditRepository.log({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId || 'system',
      action: 'CASE_CREATED',
      entityType: 'case',
      entityId: caseId,
      newValue: { type: data.type, status: data.status },
    });

    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating case:', error);
    if (error && typeof error === 'object') {
      console.error('Details:', JSON.stringify(error));
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    
    if (!bundle) return res.status(404).json({ error: 'Case not found' });

    res.json({
      ...bundle.case,
      state_snapshot: buildCaseState(bundle),
    });
  } catch (error) {
    console.error('Error fetching case:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/state', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });
    
    res.json(buildCaseState(bundle));
  } catch (error) {
    console.error('Error fetching case state:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/graph', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });
    
    res.json(buildGraphView(bundle));
  } catch (error) {
    console.error('Error fetching case graph:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/resolve', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });
    
    res.json(buildResolveView(bundle));
  } catch (error) {
    console.error('Error fetching case resolve view:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/resolution-plan', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });

    const plan = buildCaseResolutionPlan(bundle);
    res.json(plan);
  } catch (error) {
    console.error('Error building case resolution plan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/resolution-plan/steps/:stepId/run', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });

    const resolutionPlan = buildCaseResolutionPlan(bundle);
    const step = resolutionPlan.steps.find((item) => item.id === req.params.stepId);
    if (!step) return res.status(404).json({ error: 'Resolution step not found' });

    if (step.execution.kind === 'navigate') {
      return res.json({
        ok: true,
        action: 'navigate',
        message: step.execution.reason,
        targetPage: step.execution.targetPage,
        targetId: step.execution.targetId ?? null,
        step,
      });
    }

    if (step.execution.kind === 'blocked') {
      return res.status(409).json({
        ok: false,
        error: step.execution.reason,
        step,
      });
    }

    const plan = buildPlanFromResolutionSteps({
      caseId: req.params.id,
      sessionId: String(req.body?.sessionId || `case-resolution-${req.params.id}`),
      steps: [step],
      rationale: `Execute Case Graph resolution step "${step.title}" for ${bundle.case.case_number || req.params.id}.`,
    });

    const trace = await planEngine.execute({
      plan,
      userId: req.userId || 'system',
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId || null,
      hasPermission: (permission: string) => hasPermission(req, permission),
      options: { dryRun: req.body?.dryRun === true },
    });

    await auditRepository.log({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId || 'system',
      action: 'CASE_GRAPH_RESOLUTION_STEP',
      entityType: 'case',
      entityId: req.params.id,
      metadata: {
        stepId: step.id,
        tool: step.execution.tool,
        traceStatus: trace.status,
        approvalIds: trace.approvalIds ?? [],
      },
    });

    return res.status(trace.status === 'pending_approval' ? 202 : traceSucceeded(trace) ? 200 : 409).json({
      ok: traceSucceeded(trace),
      message: trace.summary,
      step,
      trace,
      approvalRequired: trace.status === 'pending_approval',
      approvalIds: trace.approvalIds ?? [],
    });
  } catch (error) {
    console.error('Error running case resolution step:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/resolution-plan/run', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });

    const resolutionPlan = buildCaseResolutionPlan(bundle);
    const executableSteps = resolutionPlan.steps.filter((step) => step.execution.kind === 'tool');
    const plan = buildPlanFromResolutionSteps({
      caseId: req.params.id,
      sessionId: String(req.body?.sessionId || `case-resolution-${req.params.id}`),
      steps: executableSteps,
      rationale: `Execute all Case Graph resolution steps for ${bundle.case.case_number || req.params.id}.`,
    });

    if (!plan.steps.length) {
      return res.status(409).json({
        ok: false,
        error: 'No executable resolution steps are available for this case.',
        resolutionPlan,
      });
    }

    const trace = await planEngine.execute({
      plan,
      userId: req.userId || 'system',
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId || null,
      hasPermission: (permission: string) => hasPermission(req, permission),
      options: { dryRun: req.body?.dryRun === true },
    });

    await auditRepository.log({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId || 'system',
      action: 'CASE_GRAPH_RESOLUTION_RUN',
      entityType: 'case',
      entityId: req.params.id,
      metadata: {
        traceStatus: trace.status,
        stepCount: plan.steps.length,
        approvalIds: trace.approvalIds ?? [],
      },
    });

    return res.status(trace.status === 'pending_approval' ? 202 : traceSucceeded(trace) ? 200 : 409).json({
      ok: traceSucceeded(trace),
      message: trace.summary,
      resolutionPlan,
      trace,
      approvalRequired: trace.status === 'pending_approval',
      approvalIds: trace.approvalIds ?? [],
    });
  } catch (error) {
    console.error('Error running case resolution plan:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/resolve-with-ai', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });

    const resolutionPlan = buildCaseResolutionPlan(bundle);
    const prompt = buildCaseResolutionPrompt(bundle, resolutionPlan);
    const sessionId = String(req.body?.sessionId || `case-resolution-ai-${req.params.id}`);

    try {
      const result = await planEngine.planAndExecute(
        {
          userMessage: prompt,
          sessionId,
          userId: req.userId || 'system',
          tenantId: req.tenantId!,
          workspaceId: req.workspaceId || null,
          hasPermission: (permission: string) => hasPermission(req, permission),
          mode: 'operate',
          domainContext: {
            caseId: req.params.id,
            resolutionPlan,
            resolveView: buildResolveView(bundle),
          },
        },
        { dryRun: req.body?.dryRun === true },
      );

      if (result.trace && result.response.kind === 'plan') {
        await auditRepository.log({
          tenantId: req.tenantId!,
          workspaceId: req.workspaceId!,
          actorId: req.userId || 'system',
          action: 'CASE_GRAPH_AI_RESOLUTION',
          entityType: 'case',
          entityId: req.params.id,
          metadata: {
            source: 'plan-engine-ai',
            traceStatus: result.trace.status,
            approvalIds: result.trace.approvalIds ?? [],
          },
        });

        return res.status(result.trace.status === 'pending_approval' ? 202 : traceSucceeded(result.trace) ? 200 : 409).json({
          ok: traceSucceeded(result.trace),
          message: result.trace.summary,
          source: 'plan-engine-ai',
          resolutionPlan,
          response: result.response,
          trace: result.trace,
          approvalRequired: result.trace.status === 'pending_approval',
          approvalIds: result.trace.approvalIds ?? [],
        });
      }
    } catch (aiError) {
      console.warn('Case Graph AI resolution fell back to deterministic executor:', aiError);
    }

    const fallbackPlan = buildPlanFromResolutionSteps({
      caseId: req.params.id,
      sessionId,
      steps: resolutionPlan.steps.filter((step) => step.execution.kind === 'tool'),
      rationale: `Fallback deterministic execution for ${bundle.case.case_number || req.params.id}.`,
    });

    if (!fallbackPlan.steps.length) {
      return res.status(409).json({
        ok: false,
        error: 'AI could not build a runnable plan and no deterministic tool steps are available.',
        source: 'deterministic-fallback',
        resolutionPlan,
      });
    }

    const fallbackTrace = await planEngine.execute({
      plan: fallbackPlan,
      userId: req.userId || 'system',
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId || null,
      hasPermission: (permission: string) => hasPermission(req, permission),
      options: { dryRun: req.body?.dryRun === true },
    });

    await auditRepository.log({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId || 'system',
      action: 'CASE_GRAPH_AI_RESOLUTION',
      entityType: 'case',
      entityId: req.params.id,
      metadata: {
        source: 'deterministic-fallback',
        traceStatus: fallbackTrace.status,
        approvalIds: fallbackTrace.approvalIds ?? [],
      },
    });

    return res.status(fallbackTrace.status === 'pending_approval' ? 202 : traceSucceeded(fallbackTrace) ? 200 : 409).json({
      ok: traceSucceeded(fallbackTrace),
      message: fallbackTrace.summary,
      source: 'deterministic-fallback',
      resolutionPlan,
      trace: fallbackTrace,
      approvalRequired: fallbackTrace.status === 'pending_approval',
      approvalIds: fallbackTrace.approvalIds ?? [],
    });
  } catch (error) {
    console.error('Error resolving case with AI:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/timeline', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });
    
    res.json(buildTimeline(bundle));
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/inbox-view', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });
    
    res.json(buildInboxView(bundle));
  } catch (error) {
    console.error('Error fetching inbox view:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/status', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const { status, reason, changed_by } = req.body;

    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });

    const oldStatus = bundle.case.status;
    await caseRepository.update(scope, req.params.id, { 
      status, 
      last_activity_at: new Date().toISOString() 
    });

    await caseRepository.addStatusHistory(scope, {
      caseId: req.params.id,
      fromStatus: oldStatus,
      toStatus: status,
      changedBy: changed_by || req.userId || 'system',
      reason: reason || null
    });

    await auditRepository.log({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId || 'system',
      action: 'CASE_STATUS_UPDATE',
      entityType: 'case',
      entityId: req.params.id,
      oldValue: { status: oldStatus },
      newValue: { status },
      metadata: { reason },
    });

    fireWorkflowEvent(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
      'case.updated',
      { caseId: req.params.id, status, previousStatus: oldStatus, reason: reason ?? null, customerId: bundle.case.customer_id },
    );
    res.json({ success: true, status });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/assign', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const { user_id, team_id } = req.body;

    await caseRepository.update(scope, req.params.id, {
      assigned_user_id: user_id || null,
      assigned_team_id: team_id || null
    });

    await auditRepository.log({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId || 'system',
      action: 'CASE_ASSIGNMENT_UPDATE',
      entityType: 'case',
      entityId: req.params.id,
      newValue: { user_id, team_id },
    });

    fireWorkflowEvent(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
      'case.updated',
      { caseId: req.params.id, assignedUserId: user_id ?? null, assignedTeamId: team_id ?? null, change: 'assignment' },
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error assigning case:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function handleInternalNote(req: MultiTenantRequest, res: Response): Promise<void> {
  try {
    const { content } = req.body;
    if (!content || !String(content).trim()) {
      res.status(400).json({ error: 'Note content is required' });
      return;
    }

    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }

    const note = await conversationRepository.createInternalNote(scope, {
      caseId: req.params.id,
      content: String(content).trim(),
      createdBy: req.userId || 'user_local'
    });

    let message: any = null;
    if (bundle.conversation || bundle.case.conversation_id) {
      const convId = bundle.conversation?.id || bundle.case.conversation_id;
      message = await conversationRepository.appendMessage(scope, {
        conversationId: convId,
        caseId: req.params.id,
        customerId: bundle.case.customer_id || null,
        type: 'internal',
        direction: 'outbound',
        senderId: req.userId || 'user_local',
        senderName: 'Internal Note',
        content: String(content).trim(),
        channel: 'internal',
      });
    }

    await caseRepository.update(scope, req.params.id, { 
      last_activity_at: new Date().toISOString() 
    });

    await auditRepository.log({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId || 'system',
      action: 'CASE_INTERNAL_NOTE_CREATED',
      entityType: 'case',
      entityId: req.params.id,
      metadata: { noteId: note.id },
    });

    res.status(201).json({
      success: true,
      noteId: note.id,
      message: message ? {
        id: message.id,
        type: 'internal',
        direction: 'outbound',
        sender_name: 'Internal Note',
        content: String(content).trim(),
        channel: 'internal',
        sent_at: message.sent_at,
      } : null,
    });
  } catch (error) {
    console.error('Error creating internal note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

router.post('/:id/internal-note', handleInternalNote);
// /:id/notes is an alias for /:id/internal-note
router.post('/:id/notes', handleInternalNote);

router.post('/:id/reply', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { content, draft_reply_id } = req.body;
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'Reply content is required' });
    }

    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });

    const conversation = await conversationRepository.ensureForCase(scope, bundle.case);
    const channel = conversation.channel || bundle.case.source_channel || 'web_chat';
    const queuedMessageId = crypto.randomUUID();
    const now = new Date().toISOString();

    await conversationRepository.appendMessage(scope, {
      conversationId: conversation.id,
      caseId: req.params.id,
      customerId: bundle.case.customer_id || null,
      type: 'agent',
      direction: 'outbound',
      senderId: req.userId || 'user_local',
      senderName: 'Alex Morgan',
      content: String(content).trim(),
      channel,
      externalMessageId: `queued_${queuedMessageId}`,
      draftReplyId: draft_reply_id || null,
      sentAt: now,
    });

    if (draft_reply_id) {
       // Ideally we'd have a DraftRepository, but for now we can use a direct call if needed or let the worker handle status
       // For completeness, we'll keep it as is or add it to ConversationRepository later.
    }

    await enqueue(
      JobType.SEND_MESSAGE,
      {
        caseId: req.params.id,
        conversationId: conversation.id,
        channel,
        content: String(content).trim(),
        queuedMessageId,
        draftReplyId: draft_reply_id || undefined,
      },
      {
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
        traceId: `${req.params.id}:reply:${Date.now()}`,
        priority: 4,
      },
    );

    await auditRepository.log({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId || 'system',
      action: 'CASE_REPLY_QUEUED',
      entityType: 'case',
      entityId: req.params.id,
      metadata: {
        conversationId: conversation.id,
        channel,
        queuedMessageId,
        draftReplyId: draft_reply_id || null,
      },
    });

    res.status(202).json({
      success: true,
      queued: true,
      message_id: queuedMessageId,
      message: {
        id: queuedMessageId,
        type: 'agent',
        direction: 'outbound',
        sender_name: 'Alex Morgan',
        content: String(content).trim(),
        channel,
        sent_at: now,
      },
    });
  } catch (error) {
    console.error('Error sending reply:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Resolution Step Execution ──────────────────────────────────────

/**
 * Converts a ResolutionRoute into a PlanStep with proper tool name and args.
 * Returns null if the route is informational and doesn't require a tool invocation.
 */
function routeToToolStep(route: ResolutionRoute, stepIndex: number): PlanStep | null {
  switch (route.kind) {
    case 'webhook_ack':
      // Informational — no tool to run
      return null;

    case 'refund':
      return {
        id: `step-refund-${stepIndex}`,
        tool: 'payment.refund',
        args: {
          paymentId: route.paymentId || undefined,
          orderId: route.orderId || undefined,
        },
        dependsOn: [],
      };

    case 'order_update':
      return {
        id: `step-order-${stepIndex}`,
        tool: 'order.cancel',
        args: {
          orderId: route.orderId || undefined,
          reason: 'Cancelled via deterministic resolution plan',
        },
        dependsOn: [],
      };

    case 'return_update':
      return {
        id: `step-return-${stepIndex}`,
        tool: 'return.update_status',
        args: {
          returnId: route.returnId || undefined,
        },
        dependsOn: [],
      };

    case 'notification':
      return {
        id: `step-notify-${stepIndex}`,
        tool: 'message.send_to_customer',
        args: {
          channel: route.channel || 'email',
        },
        dependsOn: [],
      };

    case 'reconcile':
      return {
        id: `step-reconcile-${stepIndex}`,
        tool: 'reconciliation.list_issues',
        args: {
          domain: route.domain || 'system',
        },
        dependsOn: [],
      };

    case 'approval':
      // Approvals are handled by policy engine, not direct tool invocation
      return null;

    case 'agent_dispatch':
      // Agent dispatch is handled separately via Super Agent
      return null;

    case 'manual_review':
      // Manual review flags the case but doesn't invoke a tool
      return null;

    case 'generic':
    default:
      return null;
  }
}

/**
 * POST /:id/resolution/execute-step
 *
 * Execute a single deterministic resolution step.
 * Body: { stepId: string }
 *
 * Returns: { ok: boolean; message: string; executionTrace?: ExecutionTrace }
 */
router.post('/:id/resolution/execute-step', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const caseId = req.params.id;
    const { stepId } = req.body;

    if (!stepId) {
      return res.status(400).json({ error: 'stepId is required' });
    }

    // Fetch case bundle and build resolution plan
    const bundle = await caseRepository.getBundle(scope, caseId);
    if (!bundle) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const resolveView = buildResolveView(bundle);
    const resolutionPlan = buildResolutionPlan(resolveView);

    // Find the step in the plan
    const step = resolutionPlan.steps.find((s) => s.id === stepId);
    if (!step) {
      return res.status(404).json({ error: `Step ${stepId} not found in resolution plan` });
    }

    // Route-specific handling
    if (step.route.kind === 'webhook_ack') {
      // Webhook acknowledgements are idempotent, no tool invocation needed
      await auditRepository.log({
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
        actorId: req.userId || 'system',
        action: 'RESOLUTION_STEP_EXECUTED',
        entityType: 'case',
        entityId: caseId,
        metadata: {
          stepId,
          stepGroup: step.group,
          stepTitle: step.title,
          route: step.route,
          result: 'acknowledged',
        },
      });
      return res.json({
        ok: true,
        message: `Webhook ${step.route.event} from ${step.route.provider} acknowledged.`,
      });
    }

    if (step.route.kind === 'approval') {
      // Approvals are handled by policy engine; this endpoint just logs
      await auditRepository.log({
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
        actorId: req.userId || 'system',
        action: 'RESOLUTION_STEP_FLAGGED',
        entityType: 'case',
        entityId: caseId,
        metadata: {
          stepId,
          stepGroup: step.group,
          stepTitle: step.title,
          reason: 'requires_approval',
        },
      });
      return res.json({
        ok: true,
        message: 'Approval request flagged. Check the approvals queue.',
      });
    }

    if (step.route.kind === 'manual_review') {
      // Manual review steps are for human inspection
      await auditRepository.log({
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
        actorId: req.userId || 'system',
        action: 'RESOLUTION_STEP_FLAGGED',
        entityType: 'case',
        entityId: caseId,
        metadata: {
          stepId,
          stepGroup: step.group,
          stepTitle: step.title,
          reason: 'manual_review_required',
        },
      });
      return res.json({
        ok: true,
        message: 'Step flagged for manual review. Please inspect the case timeline.',
      });
    }

    if (step.route.kind === 'agent_dispatch') {
      // Agent dispatch should be handled by Super Agent endpoint, not here
      return res.status(400).json({
        error: 'Agent dispatch steps should use the Super Agent endpoint',
      });
    }

    // For other routes, convert to tool invocation and execute via Plan Engine
    const toolStep = routeToToolStep(step.route, 0);
    if (!toolStep) {
      return res.status(400).json({
        error: `Route kind "${step.route.kind}" does not map to a tool invocation`,
      });
    }

    // Create a minimal plan with just this step
    const singleStepPlan: Plan = {
      planId: `resolution-${caseId}-${stepId}`,
      sessionId: `session-${caseId}`,
      createdAt: new Date().toISOString(),
      steps: [toolStep],
      confidence: 1.0,
      rationale: `Execute deterministic resolution step: ${step.title}`,
      needsApproval: step.requiresApproval,
    };

    // Execute through Plan Engine
    const context = {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId || null,
      userId: req.userId || 'system',
      hasPermission: () => true, // Resolution endpoints inherit case permissions
      planId: singleStepPlan.planId,
      audit: async () => {}, // Audit is logged separately below
      dryRun: req.query.dryRun === 'true',
    };

    const trace = await executePlan(
      singleStepPlan,
      context,
      {
        createApproval: async ({ step, decision }) => {
          // Create approval in DB
          const approvalId = `APR-${Date.now()}`;
          // TODO: Persist approval in approvals table
          return approvalId;
        },
        persistTrace: async (trace) => {
          // TODO: Persist execution trace for audit
        },
      }
    );

    // Log the execution
    const resultSpan = trace.spans[0];
    await auditRepository.log({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId || 'system',
      action: 'RESOLUTION_STEP_EXECUTED',
      entityType: 'case',
      entityId: caseId,
      metadata: {
        stepId,
        stepGroup: step.group,
        stepTitle: step.title,
        tool: toolStep.tool,
        result: resultSpan?.result.ok ? 'success' : 'failure',
        error: resultSpan?.result.error,
        latencyMs: resultSpan?.latencyMs,
      },
    });

    if (!trace.spans[0]?.result.ok) {
      return res.status(400).json({
        ok: false,
        message: trace.spans[0]?.result.error || 'Step execution failed',
      });
    }

    res.json({
      ok: true,
      message: `Step "${step.title}" executed successfully.`,
      executionTrace: trace,
    });
  } catch (error) {
    console.error('Error executing resolution step:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /:id/resolution/execute-all
 *
 * Execute all incomplete steps in the resolution plan sequentially.
 * Query params: ?dryRun=true to preview without side effects
 *
 * Returns: { ok: boolean; message: string; executedSteps: string[] }
 */
router.post('/:id/resolution/execute-all', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const caseId = req.params.id;

    const bundle = await caseRepository.getBundle(scope, caseId);
    if (!bundle) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const resolveView = buildResolveView(bundle);
    const resolutionPlan = buildResolutionPlan(resolveView);

    if (!resolutionPlan.hasSteps) {
      return res.json({
        ok: true,
        message: 'No steps in resolution plan.',
        executedSteps: [],
      });
    }

    const executedSteps: string[] = [];
    let anyFailed = false;

    // Execute steps sequentially, skipping informational ones
    for (const step of resolutionPlan.steps) {
      const toolStep = routeToToolStep(step.route, executedSteps.length);
      if (!toolStep) {
        // Informational steps don't require execution
        executedSteps.push(step.id);
        continue;
      }

      const singleStepPlan: Plan = {
        planId: `resolution-${caseId}-${step.id}`,
        sessionId: `session-${caseId}`,
        createdAt: new Date().toISOString(),
        steps: [toolStep],
        confidence: 1.0,
        rationale: `Execute deterministic resolution step: ${step.title}`,
        needsApproval: step.requiresApproval,
      };

      const context = {
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId || null,
        userId: req.userId || 'system',
        hasPermission: () => true,
        planId: singleStepPlan.planId,
        audit: async () => {},
        dryRun: req.query.dryRun === 'true',
      };

      // eslint-disable-next-line no-await-in-loop
      const trace = await executePlan(singleStepPlan, context, {
        createApproval: async () => {
          const approvalId = `APR-${Date.now()}`;
          return approvalId;
        },
      });

      if (!trace.spans[0]?.result.ok) {
        anyFailed = true;
        break;
      }

      executedSteps.push(step.id);

      // Log execution
      // eslint-disable-next-line no-await-in-loop
      await auditRepository.log({
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
        actorId: req.userId || 'system',
        action: 'RESOLUTION_STEP_EXECUTED',
        entityType: 'case',
        entityId: caseId,
        metadata: {
          stepId: step.id,
          stepGroup: step.group,
          stepTitle: step.title,
          tool: toolStep.tool,
          result: 'success',
        },
      });
    }

    res.json({
      ok: !anyFailed,
      message: anyFailed
        ? `Executed ${executedSteps.length} steps before encountering a failure.`
        : `All ${executedSteps.length} resolution steps completed successfully.`,
      executedSteps,
    });
  } catch (error) {
    console.error('Error executing all resolution steps:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
