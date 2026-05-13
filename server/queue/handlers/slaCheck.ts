/**
 * server/queue/handlers/slaCheck.ts
 *
 * SLA_CHECK job handler — periodically sweep open cases for SLA deadline breaches.
 *
 * Triggered every 5 minutes to identify cases that have breached their SLA deadline.
 * Creates a workspace alert for each breached case so the Super Agent can proactively
 * notify users.
 */

import { createCaseRepository } from '../../data/cases.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import { fireWorkflowEvent } from '../../lib/workflowEventBus.js';
import type { JobHandler, SlaCheckPayload } from '../types.js';
import type { JobType } from '../types.js';
import { randomUUID } from 'node:crypto';

export const slaCheckHandler: JobHandler<'sla.check'> = async (payload: SlaCheckPayload, ctx) => {
  const supabase = getSupabaseAdmin();
  const caseRepo = createCaseRepository();
  const { tenantId, workspaceId } = ctx;

  try {
    // Query open cases with SLA deadlines
    let query = supabase
      .from('cases')
      .select('id, case_number, customer_id, status, sla_resolution_deadline, sla_status, created_at')
      .eq('workspace_id', workspaceId)
      .eq('tenant_id', tenantId)
      .neq('status', 'resolved')
      .neq('status', 'closed')
      .not('sla_resolution_deadline', 'is', null);

    // If a specific case was requested, filter to just that case
    if (payload.caseId) {
      query = query.eq('id', payload.caseId);
    }

    const { data: cases, error } = await query;

    if (error) {
      logger.error('SLA_CHECK query failed', error);
      throw error;
    }

    if (!cases || cases.length === 0) {
      logger.debug('SLA_CHECK: no open cases with SLA deadlines', { tenantId, workspaceId });
      return;
    }

    const now = new Date();
    const breachedCases = [];

    for (const caseRow of cases) {
      const deadline = new Date(caseRow.sla_resolution_deadline);
      const isBreached = caseRow.sla_status !== 'breached' && deadline < now;
      const isNearBreach = caseRow.sla_status !== 'breached' && deadline < new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours

      if (isBreached) {
        breachedCases.push({
          caseId: caseRow.id,
          caseNumber: caseRow.case_number,
          severity: 'breach' as const,
        });

        // Update case SLA status to breached
        const { error: updateError } = await supabase
          .from('cases')
          .update({
            sla_status: 'breached',
            updated_at: now.toISOString(),
          })
          .eq('id', caseRow.id);

        if (updateError) {
          logger.warn('Failed to update case SLA status', { caseId: caseRow.id, error: updateError });
        } else {
          // Fire `sla.breached` so workflows whose start node is `sla.breached`
          // can react to the deadline miss. The event is durably persisted to
          // `workflow_event_log`; if dispatch fails the recovery sweeper retries.
          await fireWorkflowEvent(
            { tenantId, workspaceId },
            'sla.breached',
            {
              caseId:    caseRow.id,
              caseNumber: caseRow.case_number,
              customerId: caseRow.customer_id ?? null,
              deadline:   caseRow.sla_resolution_deadline,
              breachedAt: now.toISOString(),
              severity:   'breach',
            },
          );
        }
      } else if (isNearBreach) {
        breachedCases.push({
          caseId: caseRow.id,
          caseNumber: caseRow.case_number,
          severity: 'warning' as const,
        });
      }
    }

    // Create workspace alerts for breached/near-breach cases
    if (breachedCases.length > 0) {
      const alerts = breachedCases.map((item) => ({
        id: randomUUID(),
        workspace_id: workspaceId,
        tenant_id: tenantId,
        alert_type: item.severity === 'breach' ? 'sla_breach' : 'sla_warning',
        title: item.severity === 'breach'
          ? `SLA breached: Case ${item.caseNumber}`
          : `SLA warning: Case ${item.caseNumber} approaching deadline`,
        description: `Case ${item.caseNumber} has ${item.severity === 'breach' ? 'breached' : 'is approaching'} its SLA deadline.`,
        entity_type: 'case',
        entity_id: item.caseId,
        severity: item.severity === 'breach' ? 'high' : 'medium',
        is_resolved: false,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      }));

      const { error: insertError } = await supabase
        .from('workspace_alerts')
        .insert(alerts);

      if (insertError) {
        logger.warn('Failed to insert workspace alerts', { error: insertError, count: alerts.length });
      } else {
        logger.info('SLA_CHECK: created workspace alerts', {
          tenantId,
          workspaceId,
          breachedCount: breachedCases.filter((c) => c.severity === 'breach').length,
          warningCount: breachedCases.filter((c) => c.severity === 'warning').length,
        });
      }
    }
  } catch (err) {
    logger.error('SLA_CHECK failed', err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
};
