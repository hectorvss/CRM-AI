/**
 * server/agents/planEngine/tools/messaging.ts
 *
 * ToolSpec for sending outbound messages to customers.
 * Connects the Plan Engine directly to the existing message pipeline
 * (email via Postmark, WhatsApp via Meta Cloud API, SMS via Twilio).
 *
 * If credentials are not configured the message is recorded as 'simulated'
 * so the demo environment works without real API keys.
 */

import { randomUUID } from 'crypto';
import { createCaseRepository, createConversationRepository, createCustomerRepository } from '../../../data/index.js';
import { enqueue } from '../../../queue/client.js';
import { JobType } from '../../../queue/types.js';
import { logger } from '../../../utils/logger.js';
import { sendEmail, sendWhatsApp, sendSms } from '../../../pipeline/channelSenders.js';
import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';

const caseRepo = createCaseRepository();
const conversationRepo = createConversationRepository();
const customerRepo = createCustomerRepository();

const CHANNEL_VALUES = ['email', 'whatsapp', 'sms', 'web_chat'] as const;
type MessageChannel = typeof CHANNEL_VALUES[number];

interface MessageSendArgs {
  customerId: string;
  message: string;
  channel: MessageChannel;
  subject?: string;
  caseId?: string;
}

export const messageSendTool: ToolSpec<MessageSendArgs, unknown> = {
  name: 'message.send_to_customer',
  version: '1.0.0',
  description:
    'Send an outbound message to a customer via email, WhatsApp, or SMS. ' +
    'Provide caseId when the message is related to a support case — the message ' +
    'will be threaded into the case conversation. ' +
    'Supports channels: email, whatsapp, sms, web_chat.',
  category: 'customer',
  sideEffect: 'external',
  risk: 'medium',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    customerId: s.string({ description: 'UUID of the customer to message' }),
    message: s.string({ min: 1, max: 5000, description: 'Message content to send to the customer' }),
    channel: s.enum(CHANNEL_VALUES, { description: 'Delivery channel: email, whatsapp, sms, or web_chat' }),
    subject: s.string({ required: false, max: 200, description: 'Email subject line (only used when channel is email)' }),
    caseId: s.string({ required: false, description: 'Optional UUID of a related support case — threads the message into the case conversation' }),
  }),
  returns: s.any('{ messageId, channel, simulated, caseId? }'),

  async run({ args, context }) {
    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };

    if (context.dryRun) {
      return {
        ok: true,
        value: {
          messageId: `dry_${randomUUID()}`,
          channel: args.channel,
          customerId: args.customerId,
          caseId: args.caseId ?? null,
          dryRun: true,
        },
      };
    }

    // Load customer to get contact details
    const customer = await customerRepo.getState(scope, args.customerId);
    if (!customer) {
      return { ok: false, error: 'Customer not found', errorCode: 'NOT_FOUND' };
    }

    const rawCustomer = (customer as any).customer ?? customer;
    const email   = rawCustomer?.canonical_email ?? rawCustomer?.email ?? null;
    const phone   = rawCustomer?.phone ?? rawCustomer?.canonical_phone ?? null;
    const channel = args.channel;

    if (channel === 'email' && !email) {
      return { ok: false, error: 'Customer has no email address on record', errorCode: 'NO_CONTACT' };
    }
    if ((channel === 'whatsapp' || channel === 'sms') && !phone) {
      return { ok: false, error: `Customer has no phone number on record for ${channel}`, errorCode: 'NO_CONTACT' };
    }

    let messageId: string;
    let simulated = false;
    let conversationId: string | null = null;

    // If a caseId is provided, thread the message through the case conversation
    if (args.caseId) {
      const bundle = await caseRepo.getBundle(scope, args.caseId);
      if (!bundle) {
        return { ok: false, error: 'Case not found', errorCode: 'NOT_FOUND' };
      }

      const conversation = await conversationRepo.ensureForCase(scope, bundle.case);
      conversationId = conversation?.id ?? null;

      if (conversationId) {
        // Create a queued message row for instant inbox feedback
        const queuedMessageId = randomUUID();
        await conversationRepo.appendMessage(scope, {
          conversationId,
          caseId: args.caseId,
          customerId: args.customerId,
          type: 'outbound',
          direction: 'outbound',
          senderId: context.userId ?? 'system',
          senderName: 'Super Agent',
          content: args.message,
          channel,
        });

        // Enqueue the actual channel delivery
        await enqueue(
          JobType.SEND_MESSAGE,
          {
            caseId: args.caseId,
            conversationId,
            channel,
            content: args.message,
            queuedMessageId,
          },
          { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' },
        );

        messageId = queuedMessageId;
        simulated = false;
      } else {
        messageId = randomUUID();
        simulated = true;
        logger.warn('message.send_to_customer: no conversation for case, simulating', { caseId: args.caseId });
      }
    } else {
      // No case context — send directly via channel without threading into a conversation.
      try {
        let result: { messageId: string; simulated: boolean };
        switch (channel) {
          case 'email': {
            if (!email) return { ok: false, error: 'Customer has no email address on record', errorCode: 'NO_CONTACT' };
            result = await sendEmail(email, args.subject || 'Message from support', args.message, 'direct');
            break;
          }
          case 'whatsapp': {
            if (!phone) return { ok: false, error: 'Customer has no phone number on record for whatsapp', errorCode: 'NO_CONTACT' };
            result = await sendWhatsApp(phone, args.message);
            break;
          }
          case 'sms': {
            if (!phone) return { ok: false, error: 'Customer has no phone number on record for sms', errorCode: 'NO_CONTACT' };
            result = await sendSms(phone, args.message);
            break;
          }
          default:
            result = { messageId: `webchat_${randomUUID()}`, simulated: true };
            break;
        }
        messageId = result.messageId;
        simulated = result.simulated;
        logger.info('message.send_to_customer: direct send (no caseId)', {
          customerId: args.customerId,
          channel,
          messageId,
          simulated,
        });
      } catch (sendErr) {
        return {
          ok: false,
          error: `Direct channel send failed: ${sendErr instanceof Error ? sendErr.message : String(sendErr)}`,
          errorCode: 'SEND_FAILED',
        };
      }
    }

    await context.audit({
      action: 'PLAN_ENGINE_MESSAGE_SENT',
      entityType: 'customer',
      entityId: args.customerId,
      newValue: { channel, caseId: args.caseId ?? null, messageId, simulated },
      metadata: { source: 'plan-engine', planId: context.planId },
    });

    return {
      ok: true,
      value: {
        messageId,
        channel,
        customerId: args.customerId,
        caseId: args.caseId ?? null,
        simulated,
      },
    };
  },
};
