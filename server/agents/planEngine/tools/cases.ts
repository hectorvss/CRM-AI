/**
 * server/agents/planEngine/tools/cases.ts
 *
 * ToolSpecs for case operations.
 */

import {
  createCaseRepository,
  createConversationRepository,
} from '../../../data/index.js';
import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';

const caseRepo = createCaseRepository();
const conversationRepo = createConversationRepository();

// ── case.get ─────────────────────────────────────────────────────────────────

interface CaseGetArgs {
  caseId: string;
}

export const caseGetTool: ToolSpec<CaseGetArgs, unknown> = {
  name: 'case.get',
  version: '1.0.0',
  description: 'Retrieve a support case by ID including status, customer, linked orders, and conversation summary.',
  category: 'case',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    caseId: s.string({ description: 'UUID of the case to fetch' }),
  }),
  returns: s.any('Case bundle (case + customer + linked entities)'),
  async run({ args, context }) {
    const bundle = await caseRepo.getBundle(
      { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' },
      args.caseId,
    );
    if (!bundle) return { ok: false, error: 'Case not found', errorCode: 'NOT_FOUND' };
    return { ok: true, value: bundle };
  },
};

// ── case.update_status ───────────────────────────────────────────────────────

const CASE_STATUS_VALUES = ['open', 'pending', 'resolved', 'closed', 'escalated'] as const;
type CaseStatus = typeof CASE_STATUS_VALUES[number];

interface CaseUpdateStatusArgs {
  caseId: string;
  status: CaseStatus;
  reason?: string;
}

export const caseUpdateStatusTool: ToolSpec<CaseUpdateStatusArgs, unknown> = {
  name: 'case.update_status',
  version: '1.0.0',
  description: 'Update the status of a support case (open → pending → resolved → closed, or escalated).',
  category: 'case',
  sideEffect: 'write',
  risk: 'low',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    caseId: s.string({ description: 'UUID of the case to update' }),
    status: s.enum(CASE_STATUS_VALUES, { description: 'New status' }),
    reason: s.string({ required: false, max: 500, description: 'Optional reason / note for the status change' }),
  }),
  returns: s.any('{ caseId, status }'),
  async run({ args, context }) {
    if (context.dryRun) {
      return { ok: true, value: { caseId: args.caseId, status: args.status, dryRun: true } };
    }

    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const bundle = await caseRepo.getBundle(scope, args.caseId);
    if (!bundle) return { ok: false, error: 'Case not found', errorCode: 'NOT_FOUND' };

    await caseRepo.update(scope, args.caseId, {
      status: args.status,
      last_activity_at: new Date().toISOString(),
    });

    await caseRepo.addStatusHistory(scope, {
      caseId: args.caseId,
      fromStatus: bundle.case.status,
      toStatus: args.status,
      changedBy: context.userId ?? 'system',
      reason: args.reason ?? null,
    });

    await context.audit({
      action: 'PLAN_ENGINE_CASE_STATUS_UPDATE',
      entityType: 'case',
      entityId: args.caseId,
      oldValue: { status: bundle.case.status },
      newValue: { status: args.status, reason: args.reason ?? null },
      metadata: { source: 'plan-engine', planId: context.planId },
    });

    return { ok: true, value: { caseId: args.caseId, status: args.status } };
  },
};

// ── case.add_note ─────────────────────────────────────────────────────────────

interface CaseAddNoteArgs {
  caseId: string;
  content: string;
}

export const caseAddNoteTool: ToolSpec<CaseAddNoteArgs, unknown> = {
  name: 'case.add_note',
  version: '1.0.0',
  description: 'Add an internal note to a case. Visible to agents only, not to the customer.',
  category: 'case',
  sideEffect: 'write',
  risk: 'low',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    caseId: s.string({ description: 'UUID of the case' }),
    content: s.string({ min: 1, max: 5000, description: 'Internal note text' }),
  }),
  returns: s.any('{ caseId, noteCreated: true }'),
  async run({ args, context }) {
    if (context.dryRun) {
      return { ok: true, value: { caseId: args.caseId, noteCreated: true, dryRun: true } };
    }

    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const bundle = await caseRepo.getBundle(scope, args.caseId);
    if (!bundle) return { ok: false, error: 'Case not found', errorCode: 'NOT_FOUND' };

    await conversationRepo.createInternalNote(scope, {
      caseId: args.caseId,
      content: args.content,
      createdBy: context.userId ?? 'system',
    });

    // Also append to conversation thread if one exists
    const conversation = await conversationRepo.ensureForCase(scope, bundle.case);
    if (conversation) {
      await conversationRepo.appendMessage(scope, {
        conversationId: conversation.id,
        caseId: args.caseId,
        customerId: bundle.case.customer_id ?? null,
        type: 'internal',
        direction: 'outbound',
        senderId: context.userId ?? 'system',
        senderName: 'Super Agent',
        content: args.content,
        channel: 'internal',
      });
    }

    await context.audit({
      action: 'PLAN_ENGINE_CASE_NOTE_ADDED',
      entityType: 'case',
      entityId: args.caseId,
      metadata: { source: 'plan-engine', planId: context.planId, contentLength: args.content.length },
    });

    return { ok: true, value: { caseId: args.caseId, noteCreated: true } };
  },
};
