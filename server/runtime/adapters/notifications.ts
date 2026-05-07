/**
 * server/runtime/adapters/notifications.ts
 *
 * Adapter handlers for notification.email / notification.sms /
 * notification.whatsapp. Phase 3e of the workflow extraction
 * (Turno 5b/D2). Byte-for-byte transcription of the inline branches.
 *
 * Bug-3 contract preserved: when caller injects services explicitly without
 * a transport, the node BLOCKS rather than silently simulating. In
 * production (no services), we fall back to the real channel senders.
 */

import type { NodeAdapter } from '../workflowExecutor.js';
import { resolveTemplateValue } from '../nodeHelpers.js';
import { sendEmail, sendSms, sendWhatsApp } from '../../pipeline/channelSenders.js';

const notificationEmail: NodeAdapter = async ({ context, services }, _node, config) => {
  const to = resolveTemplateValue(config.to || config.email || context.customer?.email || context.case?.customer_email || '', context);
  const subject = resolveTemplateValue(config.subject || 'Update from support', context);
  const content = resolveTemplateValue(config.content || config.body || config.message || '', context);
  if (!to) return { status: 'failed', error: 'notification.email: no recipient — set "to" or ensure customer.email is in context' } as any;
  const emailSender = services?.channels?.email ?? (services ? undefined : sendEmail);
  if (!emailSender) {
    return {
      status: 'blocked',
      error: { code: 'TRANSPORT_NOT_CONFIGURED', message: 'Configura el transporte de email en Conectores antes de usar este nodo.' },
    };
  }
  const result = await emailSender(to, subject, content, config.ref || context.case?.id || 'workflow').catch((err: any) => ({ messageId: null, error: String(err?.message ?? err) }));
  if ((result as any).error) return { status: 'failed', error: `Email send failed: ${(result as any).error}` } as any;
  return { status: 'completed', output: { to, subject, messageId: result.messageId } };
};

const notificationWhatsapp: NodeAdapter = async ({ context, services }, _node, config) => {
  const to = resolveTemplateValue(config.to || config.phone || context.customer?.phone || '', context);
  const content = resolveTemplateValue(config.content || config.body || config.message || '', context);
  if (!to) return { status: 'failed', error: 'notification.whatsapp: no recipient — set "to" or ensure customer.phone is in context' } as any;
  const whatsappSender = services?.channels?.whatsapp ?? (services ? undefined : sendWhatsApp);
  if (!whatsappSender) {
    return {
      status: 'blocked',
      error: { code: 'TRANSPORT_NOT_CONFIGURED', message: 'Configura el transporte de WhatsApp en Conectores antes de usar este nodo.' },
    };
  }
  const result = await whatsappSender(to, content).catch((err: any) => ({ messageId: null, error: String(err?.message ?? err) }));
  if ((result as any).error) return { status: 'failed', error: `WhatsApp send failed: ${(result as any).error}` } as any;
  return { status: 'completed', output: { to, messageId: result.messageId } };
};

const notificationSms: NodeAdapter = async ({ context, services }, _node, config) => {
  const to = resolveTemplateValue(config.to || config.phone || context.customer?.phone || '', context);
  const content = resolveTemplateValue(config.content || config.body || config.message || '', context);
  if (!to) return { status: 'failed', error: 'notification.sms: no recipient — set "to" or ensure customer.phone is in context' } as any;
  const smsSender = services?.channels?.sms ?? (services ? undefined : sendSms);
  if (!smsSender) {
    return {
      status: 'blocked',
      error: { code: 'TRANSPORT_NOT_CONFIGURED', message: 'Configura el transporte de SMS en Conectores antes de usar este nodo.' },
    };
  }
  const result = await smsSender(to, content).catch((err: any) => ({ messageId: null, error: String(err?.message ?? err) }));
  if ((result as any).error) return { status: 'failed', error: `SMS send failed: ${(result as any).error}` } as any;
  return { status: 'completed', output: { to, messageId: result.messageId } };
};

export const notificationsAdapters: Record<string, NodeAdapter> = {
  'notification.email': notificationEmail,
  'notification.whatsapp': notificationWhatsapp,
  'notification.sms': notificationSms,
};
