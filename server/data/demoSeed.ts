/**
 * server/data/demoSeed.ts
 *
 * Plants a fully-formed customer case in a freshly-created workspace so
 * the new owner has something realistic to poke at — agent runs, refund
 * approvals, integrations panes, knowledge, audit log, the whole loop.
 *
 * Design choices:
 *  - Every row carries a `metadata.demo_seed = true` (or equivalent tag)
 *    so the user can later batch-delete just the demo data.
 *  - String IDs use `demo-<entity>-<workspaceId-prefix>` so they're unique
 *    per workspace (no collisions if the seeder runs again on retry) and
 *    easy to spot/clean.
 *  - All `source_system` / `psp` / `channel` values match the real
 *    integration identifiers (shopify, stripe, email, whatsapp) so the
 *    Integrations and Reports views show data the way they would after
 *    a connector finishes its first sync.
 *  - Failures are logged but never thrown — onboarding must succeed even
 *    if the seeder hits a transient DB issue.
 */

import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';

interface SeedInput {
  tenantId: string;
  workspaceId: string;
  ownerUserId: string;
}

const DEMO_TAG = 'demo_seed';

function isoMinutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

function isoHoursAgo(h: number): string {
  return isoMinutesAgo(h * 60);
}

function isoDaysAgo(d: number): string {
  return isoHoursAgo(d * 24);
}

/**
 * Seed a comprehensive demo case. Returns true if the seed succeeded fully,
 * false if any step warned (caller may retry or just continue — onboarding
 * does not depend on the result).
 */
export async function seedDemoCase(input: SeedInput): Promise<boolean> {
  const { tenantId, workspaceId, ownerUserId } = input;
  const supabase = getSupabaseAdmin();
  const idStub = workspaceId.slice(0, 8);

  // ── Identifiers (deterministic per workspace) ──────────────────────────────
  const customerId       = `demo-cust-${idStub}`;
  const order1Id         = `demo-order-1-${idStub}`;
  const order2Id         = `demo-order-2-${idStub}`;
  const payment1Id       = `demo-pay-1-${idStub}`;
  const payment2Id       = `demo-pay-2-${idStub}`;
  const return1Id        = `demo-ret-1-${idStub}`;
  const conversationId   = `demo-conv-${idStub}`;
  const caseId           = `demo-case-${idStub}`;
  const caseNumber       = `DEMO-${idStub.toUpperCase()}`;
  const approvalId       = `demo-appr-${idStub}`;
  const articleId        = `demo-kb-${idStub}`;
  const domainId         = `demo-kb-dom-${idStub}`;

  const now = new Date().toISOString();
  const today1pm = isoHoursAgo(2);
  const yesterday3pm = isoDaysAgo(1);
  const twoDaysAgo10am = isoDaysAgo(2);

  try {
    // ── 1. Customer (as if synced from Shopify) ───────────────────────────────
    {
      const { error } = await supabase.from('customers').insert({
        id: customerId,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        canonical_email: 'lucia.hernandez@example.com',
        email: 'lucia.hernandez@example.com',
        phone: '+34 612 345 678',
        canonical_name: 'Lucía Hernández',
        segment: 'vip',
        risk_level: 'medium',
        lifetime_value: 8540,
        currency: 'EUR',
        preferred_channel: 'email',
        dispute_rate: 0.05,
        refund_rate: 0.08,
        chargeback_count: 1,
        total_orders: 7,
        total_spent: 8540,
        created_at: isoDaysAgo(420),
        updated_at: now,
      });
      if (error) throw error;
    }

    // ── 2. Orders (Shopify) ───────────────────────────────────────────────────
    {
      const { error } = await supabase.from('orders').insert([
        {
          id: order1Id,
          external_order_id: 'SHOP-#10428',
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          status: 'delivered',
          fulfillment_status: 'delivered',
          tracking_number: 'GLS-7841239',
          tracking_url: 'https://gls-spain.es/track/7841239',
          shipping_address: 'Calle Velázquez 47, 28001 Madrid, ES',
          system_states: JSON.stringify({ shopify: 'fulfilled', easypost: 'delivered' }),
          total_amount: 1250.00,
          currency: 'EUR',
          country: 'ES',
          brand: 'Bottega Veneta',
          channel: 'shopify',
          order_date: isoDaysAgo(11),
          has_conflict: true,
          conflict_domain: 'fulfillment_quality',
          conflict_detected: yesterday3pm,
          recommended_action: 'review_return_with_refund',
          risk_level: 'high',
          order_type: 'fashion_luxury',
          approval_status: 'pending',
          summary: 'Cassette Bag — luxury handbag, delivered with reported damage to leather edge.',
          last_sync_at: now,
          last_update: now,
          badges: JSON.stringify(['vip', 'damage_reported', 'chargeback_risk']),
          tab: 'attention',
          created_at: isoDaysAgo(11),
          updated_at: now,
        },
        {
          id: order2Id,
          external_order_id: 'SHOP-#10588',
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          status: 'in_transit',
          fulfillment_status: 'shipped',
          tracking_number: 'GLS-9051772',
          tracking_url: 'https://gls-spain.es/track/9051772',
          shipping_address: 'Calle Velázquez 47, 28001 Madrid, ES',
          system_states: JSON.stringify({ shopify: 'shipped', easypost: 'in_transit' }),
          total_amount: 890.00,
          currency: 'EUR',
          country: 'ES',
          brand: 'Saint Laurent',
          channel: 'shopify',
          order_date: isoDaysAgo(3),
          has_conflict: false,
          risk_level: 'low',
          order_type: 'fashion_luxury',
          approval_status: 'auto_approved',
          summary: 'Le Loafer Penny — leather loafers, in transit to customer.',
          last_sync_at: now,
          last_update: now,
          badges: JSON.stringify(['vip']),
          tab: 'in_transit',
          created_at: isoDaysAgo(3),
          updated_at: now,
        },
      ]);
      if (error) throw error;
    }

    // ── 2b. Order line items (so the order detail shows products) ─────────────
    {
      const { error } = await supabase.from('order_line_items').insert([
        {
          id: `demo-li-1a-${idStub}`,
          order_id: order1Id,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          external_item_id: 'BV-CASS-MED-NOIR',
          sku: 'BV-CASS-NOIR-M',
          name: 'Cassette Bag — Medium, Black Intrecciato',
          price: 1250.00,
          quantity: 1,
          currency: 'EUR',
          image_url: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400',
          created_at: isoDaysAgo(11),
        },
        {
          id: `demo-li-2a-${idStub}`,
          order_id: order2Id,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          external_item_id: 'SL-LOAFER-PENNY-39',
          sku: 'SL-PENNY-39',
          name: 'Le Loafer Penny — Calf Leather, Size 39',
          price: 790.00,
          quantity: 1,
          currency: 'EUR',
          image_url: 'https://images.unsplash.com/photo-1614252369475-531eba835eb1?w=400',
          created_at: isoDaysAgo(3),
        },
        {
          id: `demo-li-2b-${idStub}`,
          order_id: order2Id,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          external_item_id: 'SL-CARE-KIT',
          sku: 'SL-KIT-001',
          name: 'Saint Laurent Care Kit',
          price: 100.00,
          quantity: 1,
          currency: 'EUR',
          image_url: null,
          created_at: isoDaysAgo(3),
        },
      ]);
      if (error) throw error;
    }

    // ── 2c. Linked identities (cross-channel ID resolution) ───────────────────
    {
      const { error } = await supabase.from('linked_identities').insert([
        {
          id: `demo-li-shop-${idStub}`,
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          system: 'shopify',
          external_id: 'shopify_cust_4592017',
          confidence: 1.00,
          verified: true,
          verified_at: isoDaysAgo(420),
          created_at: isoDaysAgo(420),
        },
        {
          id: `demo-li-stripe-${idStub}`,
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          system: 'stripe',
          external_id: 'cus_PqXLuciaH92Az',
          confidence: 1.00,
          verified: true,
          verified_at: isoDaysAgo(420),
          created_at: isoDaysAgo(420),
        },
        {
          id: `demo-li-gmail-${idStub}`,
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          system: 'gmail',
          external_id: 'lucia.hernandez@example.com',
          confidence: 0.98,
          verified: true,
          verified_at: isoDaysAgo(380),
          created_at: isoDaysAgo(380),
        },
        {
          id: `demo-li-wa-${idStub}`,
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          system: 'whatsapp',
          external_id: '+34612345678',
          confidence: 0.92,
          verified: true,
          verified_at: isoDaysAgo(210),
          created_at: isoDaysAgo(210),
        },
      ]);
      if (error) throw error;
    }

    // ── 3. Payments (Stripe) — first one has an open chargeback ───────────────
    {
      const { error } = await supabase.from('payments').insert([
        {
          id: payment1Id,
          external_payment_id: 'pi_3PqXyZ2eZvKYlo2C0aBcDeFg',
          order_id: order1Id,
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          amount: 1250.00,
          currency: 'EUR',
          payment_method: 'card',
          psp: 'stripe',
          status: 'captured',
          system_states: JSON.stringify({ stripe: 'succeeded', dispute_open: true }),
          dispute_id: 'dp_1PqXyZ2eZvKYlo2C0aBcDeFg',
          dispute_reference: 'CB-20241102-0731',
          chargeback_amount: 1250.00,
          refund_ids: JSON.stringify([]),
          risk_level: 'high',
          payment_type: 'card_purchase',
          approval_status: 'pending_review',
          summary: 'Card payment captured for order SHOP-#10428. Customer initiated chargeback with issuing bank ("merchandise not as described").',
          has_conflict: true,
          conflict_detected: yesterday3pm,
          recommended_action: 'respond_chargeback_or_refund',
          badges: JSON.stringify(['chargeback_initiated', 'vip']),
          tab: 'disputes',
          authorized_at: isoDaysAgo(11),
          captured_at: isoDaysAgo(11),
          refund_status: 'none',
          created_at: isoDaysAgo(11),
          updated_at: now,
          last_update: now,
        },
        {
          id: payment2Id,
          external_payment_id: 'pi_3PqYab2eZvKYlo2C0hIjKlMn',
          order_id: order2Id,
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          amount: 890.00,
          currency: 'EUR',
          payment_method: 'card',
          psp: 'stripe',
          status: 'captured',
          system_states: JSON.stringify({ stripe: 'succeeded' }),
          refund_ids: JSON.stringify([]),
          risk_level: 'low',
          payment_type: 'card_purchase',
          approval_status: 'auto_approved',
          summary: 'Card payment captured for order SHOP-#10588.',
          has_conflict: false,
          authorized_at: isoDaysAgo(3),
          captured_at: isoDaysAgo(3),
          refund_status: 'none',
          created_at: isoDaysAgo(3),
          updated_at: now,
          last_update: now,
        },
      ]);
      if (error) throw error;
    }

    // ── 4. Return (RMA in progress) ───────────────────────────────────────────
    {
      const { error } = await supabase.from('returns').insert({
        id: return1Id,
        external_return_id: 'RMA-1142',
        order_id: order1Id,
        customer_id: customerId,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        type: 'refund_or_replacement',
        return_reason: 'damaged_on_arrival',
        return_value: 1250.00,
        status: 'inspection_pending',
        inspection_status: 'awaiting_warehouse',
        refund_status: 'pending_approval',
        carrier_status: 'label_issued',
        has_conflict: true,
        approval_status: 'pending',
        risk_level: 'high',
        linked_refund_id: null,
        linked_shipment_id: 'GLS-RMA-7841239',
        system_states: JSON.stringify({ warehouse: 'awaiting_inbound', carrier: 'label_issued' }),
        conflict_detected: yesterday3pm,
        recommended_action: 'authorise_refund_pending_inspection',
        summary: 'Customer reports leather edge damage on Bottega Veneta cassette bag. Return label issued; awaiting warehouse inspection.',
        badges: JSON.stringify(['damaged', 'vip', 'high_value']),
        tab: 'inspection_pending',
        method: 'carrier_pickup',
        brand: 'Bottega Veneta',
        country: 'ES',
        currency: 'EUR',
        last_update: now,
        created_at: yesterday3pm,
        updated_at: now,
      });
      if (error) throw error;
    }

    // ── 5. Knowledge domain + article ─────────────────────────────────────────
    {
      const { error: domErr } = await supabase.from('knowledge_domains').insert({
        id: domainId,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        name: 'Returns & Refunds',
        description: 'Policies covering returns, refunds and chargebacks.',
        created_at: now,
      });
      if (domErr && domErr.code !== '23505') throw domErr;

      const articleContent = [
        '# Política de reembolsos para artículos de lujo (>€1000)',
        '',
        'Esta política rige los reembolsos para artículos de moda de lujo.',
        '',
        '## Resumen',
        '- Devoluciones aceptadas dentro de 14 días naturales desde la entrega.',
        '- El artículo debe llegar al almacén en condiciones evaluables (no mojado, embalaje original cuando sea posible).',
        '- Reembolsos > €1000 requieren aprobación manual del manager de operaciones.',
        '- En caso de chargeback abierto, NO procesar reembolso voluntario hasta cerrar la disputa con el banco — duplicaría el reembolso.',
        '',
        '## Pasos',
        '1. Generar etiqueta de devolución (GLS / SEUR según país).',
        '2. Marcar la devolución como `inspection_pending`.',
        '3. Esperar al informe del almacén (24-48h).',
        '4. Si el daño se confirma, aprobar reembolso completo + 10% goodwill credit en próxima compra.',
        '5. Cerrar el caso registrando la causa raíz y el coste imputado al carrier (si procede).',
      ].join('\n');

      const { error: artErr } = await supabase.from('knowledge_articles').insert({
        id: articleId,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        domain_id: domainId,
        title: 'Política de reembolsos — artículos de lujo (>€1000)',
        content: articleContent,
        type: 'policy',
        status: 'published',
        owner_user_id: ownerUserId,
        review_cycle_days: 180,
        last_reviewed_at: now,
        next_review_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        version: 1,
        citation_count: 1,
        last_cited_at: now,
        outdated_flag: false,
        linked_workflow_ids: JSON.stringify([]),
        linked_approval_policy_ids: JSON.stringify([]),
        created_at: isoDaysAgo(60),
        updated_at: now,
      });
      if (artErr) throw artErr;
    }

    // ── 6. Case (insert FIRST, with conversation_id=null, because
    //         conversations.case_id has an FK back to cases.id) ───────────────
    {
      const { error } = await supabase.from('cases').insert({
        id: caseId,
        case_number: caseNumber,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        source_system: 'gmail',
        source_channel: 'email',
        source_entity_id: 'gmail-thread-179a82b3c4d5e6f7',
        type: 'refund_dispute',
        sub_type: 'damaged_on_arrival',
        intent: 'process_refund_with_chargeback_risk',
        status: 'open',
        priority: 'high',
        severity: 'critical',
        risk_level: 'high',
        fraud_flag: false,
        assigned_user_id: ownerUserId,
        // FK: cases.created_by_user_id → users(id). Use the workspace owner
        // (which onboarding has just upserted) — 'system' would fail the FK.
        created_by_user_id: ownerUserId,
        sla_first_response_deadline: isoHoursAgo(-1) /* breached 1h ago */,
        sla_resolution_deadline: new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString(),
        sla_status: 'at_risk',
        customer_id: customerId,
        order_ids: JSON.stringify([order1Id]),
        payment_ids: JSON.stringify([payment1Id]),
        return_ids: JSON.stringify([return1Id]),
        conversation_id: null,
        ai_diagnosis:
          'VIP customer (LTV €8.5k, 7 prior orders) reports physical damage on luxury handbag. Chargeback opened by issuing bank in parallel — issuing voluntary refund now would create double-credit risk. Recommend: hold refund pending chargeback freeze, communicate ETA, escalate to manager for >€1000 approval.',
        ai_root_cause: 'Carrier handling damage during last-mile delivery (GLS Spain).',
        ai_confidence: 0.86,
        ai_recommended_action: 'request_chargeback_freeze_then_refund',
        ai_evidence_refs: JSON.stringify([
          { type: 'photo', count: 2, ref: 'gmail-msg-001' },
          { type: 'rma', id: return1Id },
          { type: 'kb_article', id: articleId },
        ]),
        approval_state: 'pending_approval',
        active_approval_request_id: null,
        execution_state: 'awaiting_decision',
        active_execution_plan_id: null,
        resolution_state: 'in_progress',
        has_reconciliation_conflicts: true,
        conflict_severity: 'high',
        tags: JSON.stringify(['vip', 'damaged_item', 'chargeback_risk', DEMO_TAG]),
        created_at: twoDaysAgo10am,
        updated_at: now,
        first_response_at: isoDaysAgo(2),
        last_activity_at: today1pm,
      });
      if (error) throw error;
    }

    // ── 7. Conversation thread (email + whatsapp) ────────────────────────────
    {
      const { error: convErr } = await supabase.from('conversations').insert({
        id: conversationId,
        case_id: caseId,
        customer_id: customerId,
        channel: 'email',
        status: 'open',
        subject: 'Bolso Bottega Veneta llegó dañado — solicito reembolso',
        external_thread_id: 'gmail-thread-179a82b3c4d5e6f7',
        first_message_at: twoDaysAgo10am,
        last_message_at: today1pm,
        created_at: twoDaysAgo10am,
        updated_at: now,
        tenant_id: tenantId,
        workspace_id: workspaceId,
      });
      if (convErr) throw convErr;

      const messages = [
        {
          id: `demo-msg-1-${idStub}`,
          conversation_id: conversationId,
          case_id: caseId,
          customer_id: customerId,
          type: 'inbound',
          direction: 'inbound',
          sender_id: customerId,
          sender_name: 'Lucía Hernández',
          content:
            'Hola,\n\nHe recibido el bolso esta mañana y para mi sorpresa el borde de cuero viene rajado. Es la tercera compra de lujo que hago con vosotros y nunca había tenido un problema así. Adjunto fotos. Quiero un reembolso completo. Si no lo procesáis hoy, voy a contactar con mi banco.\n\nLucía.',
          content_type: 'text',
          channel: 'email',
          external_message_id: 'gmail-msg-001',
          sentiment: 'negative',
          sentiment_score: -0.72,
          attachments: JSON.stringify([
            { type: 'image', name: 'damage_1.jpg', size: 248_000 },
            { type: 'image', name: 'damage_2.jpg', size: 312_400 },
          ]),
          sent_at: twoDaysAgo10am,
          created_at: twoDaysAgo10am,
          delivered_at: twoDaysAgo10am,
          tenant_id: tenantId,
        },
        {
          id: `demo-msg-2-${idStub}`,
          conversation_id: conversationId,
          case_id: caseId,
          customer_id: customerId,
          type: 'outbound',
          direction: 'outbound',
          sender_id: ownerUserId,
          sender_name: 'Customer Care',
          content:
            'Hola Lucía,\n\nLamentamos muchísimo lo ocurrido. Hemos generado la etiqueta de devolución (GLS-RMA-7841239) que llegará a tu correo en los próximos minutos. En cuanto el almacén reciba el bolso (24–48h) procesaremos el reembolso completo de €1.250 más un 10% de credito de cortesía para tu próxima compra.\n\nUn saludo,\nEl equipo.',
          content_type: 'text',
          channel: 'email',
          external_message_id: 'gmail-msg-002',
          sentiment: 'neutral',
          sentiment_score: 0.05,
          attachments: JSON.stringify([]),
          sent_at: isoDaysAgo(2) /* same day, slightly later */,
          created_at: isoDaysAgo(2),
          tenant_id: tenantId,
        },
        {
          id: `demo-msg-3-${idStub}`,
          conversation_id: conversationId,
          case_id: caseId,
          customer_id: customerId,
          type: 'inbound',
          direction: 'inbound',
          sender_id: customerId,
          sender_name: 'Lucía Hernández',
          content:
            'No pienso esperar 48h. He hablado con mi banco y han abierto un chargeback. Tenéis hasta mañana o lo elevo a redes sociales.',
          content_type: 'text',
          channel: 'whatsapp',
          external_message_id: 'wa-msg-003',
          sentiment: 'very_negative',
          sentiment_score: -0.91,
          attachments: JSON.stringify([]),
          sent_at: yesterday3pm,
          created_at: yesterday3pm,
          tenant_id: tenantId,
        },
        {
          id: `demo-msg-4-${idStub}`,
          conversation_id: conversationId,
          case_id: caseId,
          customer_id: customerId,
          type: 'outbound',
          direction: 'outbound',
          sender_id: ownerUserId,
          sender_name: 'Customer Care',
          content:
            'Lucía, entendemos la urgencia. Por favor, ten en cuenta que si el chargeback queda abierto a la vez que procesamos el reembolso voluntario, recibirías el dinero dos veces y el banco lo revertiría con comisión. ¿Puedes pedir a tu banco que pause la disputa? En cuanto confirmemos, mañana mismo emitimos el reembolso.',
          content_type: 'text',
          channel: 'whatsapp',
          external_message_id: 'wa-msg-004',
          sentiment: 'neutral',
          sentiment_score: 0.10,
          attachments: JSON.stringify([]),
          sent_at: isoDaysAgo(1),
          created_at: isoDaysAgo(1),
          tenant_id: tenantId,
        },
        {
          id: `demo-msg-5-${idStub}`,
          conversation_id: conversationId,
          case_id: caseId,
          customer_id: customerId,
          type: 'inbound',
          direction: 'inbound',
          sender_id: customerId,
          sender_name: 'Lucía Hernández',
          content:
            'OK, llamo al banco. Pero quiero garantía por escrito de que el reembolso se hará mañana antes de las 18:00. Si no, no paro la disputa.',
          content_type: 'text',
          channel: 'email',
          external_message_id: 'gmail-msg-005',
          sentiment: 'negative',
          sentiment_score: -0.40,
          attachments: JSON.stringify([]),
          sent_at: today1pm,
          created_at: today1pm,
          tenant_id: tenantId,
        },
      ];
      const { error: msgErr } = await supabase.from('messages').insert(messages);
      if (msgErr) throw msgErr;
    }

    // ── 8. Patch case with conversation + approval back-references ───────────
    {
      const { error } = await supabase
        .from('cases')
        .update({
          conversation_id: conversationId,
          active_approval_request_id: approvalId,
        })
        .eq('id', caseId)
        .eq('tenant_id', tenantId);
      if (error) throw error;
    }

    // ── 9. Approval request (refund > €1000 — needs manager) ──────────────────
    {
      const { error } = await supabase.from('approval_requests').insert({
        id: approvalId,
        case_id: caseId,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        requested_by: 'system',
        requested_by_type: 'agent',
        action_type: 'refund_payment',
        action_payload: JSON.stringify({
          payment_id: payment1Id,
          amount: 1250.00,
          currency: 'EUR',
          reason: 'damaged_on_arrival',
          goodwill_credit_amount: 125,
          customer_id: customerId,
          order_id: order1Id,
          chargeback_pending: true,
        }),
        risk_level: 'high',
        evidence_package: JSON.stringify({
          summary:
            'Damaged luxury item, VIP customer, chargeback already opened. AI recommends pausing chargeback before refunding.',
          photos: 2,
          customer_history: { total_orders: 7, ltv_eur: 8540, prior_chargebacks: 1 },
          policy_refs: [articleId],
        }),
        status: 'pending',
        assigned_to: ownerUserId,
        decision_at: null,
        decision_note: null,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        created_at: yesterday3pm,
        updated_at: now,
      });
      if (error) throw error;
    }

    // ── 9b. Customer activity timeline ────────────────────────────────────────
    // Powers the "Activity" tab on the customer profile. Each row is what
    // a real integration webhook would push when something happens.
    {
      const activityRows = [
        {
          id: randomUUID(),
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          type: 'order',
          system: 'shopify',
          level: 'info',
          title: 'Pedido SHOP-#10588 creado',
          content: 'Saint Laurent Le Loafer Penny — €890',
          metadata: { order_id: order2Id, amount: 890, currency: 'EUR', demo_seed: true },
          source: 'shopify_webhook',
          occurred_at: isoDaysAgo(3),
          created_at: now,
        },
        {
          id: randomUUID(),
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          type: 'payment',
          system: 'stripe',
          level: 'info',
          title: 'Pago capturado €890',
          content: 'Pago con tarjeta •••• 4242',
          metadata: { payment_id: payment2Id, amount: 890, demo_seed: true },
          source: 'stripe_webhook',
          occurred_at: isoDaysAgo(3),
          created_at: now,
        },
        {
          id: randomUUID(),
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          type: 'message',
          system: 'gmail',
          level: 'info',
          title: 'Email entrante: bolso dañado',
          content: 'La cliente reporta daño en el borde de cuero del Cassette Bag con fotos adjuntas.',
          metadata: { channel: 'email', sentiment: -0.72, demo_seed: true },
          source: 'gmail_webhook',
          occurred_at: twoDaysAgo10am,
          created_at: now,
        },
        {
          id: randomUUID(),
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          type: 'case',
          system: 'system',
          level: 'warning',
          title: `Caso ${caseNumber} abierto`,
          content: 'Refund dispute con riesgo de chargeback',
          metadata: { case_id: caseId, priority: 'high', demo_seed: true },
          source: 'helpdesk',
          occurred_at: twoDaysAgo10am,
          created_at: now,
        },
        {
          id: randomUUID(),
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          type: 'return',
          system: 'warehouse',
          level: 'info',
          title: 'RMA-1142 generada',
          content: 'Etiqueta GLS-RMA-7841239 emitida; esperando recepción del almacén',
          metadata: { return_id: return1Id, amount: 1250, demo_seed: true },
          source: 'warehouse_system',
          occurred_at: isoHoursAgo(28),
          created_at: now,
        },
        {
          id: randomUUID(),
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          type: 'dispute',
          system: 'stripe',
          level: 'critical',
          title: 'Chargeback CB-20241102-0731 abierto',
          content: 'El banco emisor abrió disputa por €1.250 (motivo: merchandise_not_as_described)',
          metadata: { payment_id: payment1Id, dispute_id: 'dp_1PqXyZ2eZvKYlo2C0aBcDeFg', amount: 1250, demo_seed: true },
          source: 'stripe_webhook',
          occurred_at: isoHoursAgo(26),
          created_at: now,
        },
        {
          id: randomUUID(),
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          type: 'message',
          system: 'whatsapp',
          level: 'warning',
          title: 'Mensaje WhatsApp entrante',
          content: 'Cliente eleva la urgencia y amenaza con redes sociales',
          metadata: { channel: 'whatsapp', sentiment: -0.91, demo_seed: true },
          source: 'whatsapp_webhook',
          occurred_at: yesterday3pm,
          created_at: now,
        },
        {
          id: randomUUID(),
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          type: 'agent',
          system: 'plan_engine',
          level: 'info',
          title: 'Diagnóstico del agente',
          content: 'Confianza 86%: pausar reembolso voluntario hasta cerrar chargeback',
          metadata: { confidence: 0.86, recommended_action: 'request_chargeback_freeze_then_refund', demo_seed: true },
          source: 'super_agent',
          occurred_at: yesterday3pm,
          created_at: now,
        },
        {
          id: randomUUID(),
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          type: 'approval',
          system: 'system',
          level: 'warning',
          title: 'Aprobación pendiente',
          content: 'Refund €1.250 + 10% goodwill — manager review required',
          metadata: { approval_id: approvalId, amount: 1250, demo_seed: true },
          source: 'approvals',
          occurred_at: yesterday3pm,
          created_at: now,
        },
      ];
      const { error } = await supabase.from('customer_activity').insert(activityRows);
      if (error && error.code !== '42P01') {
        logger.warn('demoSeed: customer_activity insert failed (non-fatal)', { error: error.message });
      }
    }

    // ── 10. Audit events (so the case looks "alive") ─────────────────────────
    // The table is `audit_events`; metadata is jsonb (object, not string);
    // timestamp column is `occurred_at` and required NOT NULL.
    {
      const auditRows = [
        {
          id: randomUUID(),
          tenant_id: tenantId,
          workspace_id: workspaceId,
          actor_id: 'system',
          actor_type: 'system',
          action: 'CASE_CREATED',
          entity_type: 'case',
          entity_id: caseId,
          metadata: { source: 'gmail', demo_seed: true },
          occurred_at: twoDaysAgo10am,
        },
        {
          id: randomUUID(),
          tenant_id: tenantId,
          workspace_id: workspaceId,
          actor_id: 'system',
          actor_type: 'agent',
          action: 'AGENT_DIAGNOSIS',
          entity_type: 'case',
          entity_id: caseId,
          metadata: {
            confidence: 0.86,
            recommended_action: 'request_chargeback_freeze_then_refund',
            demo_seed: true,
          },
          occurred_at: yesterday3pm,
        },
        {
          id: randomUUID(),
          tenant_id: tenantId,
          workspace_id: workspaceId,
          actor_id: 'system',
          actor_type: 'agent',
          action: 'APPROVAL_REQUESTED',
          entity_type: 'approval',
          entity_id: approvalId,
          metadata: {
            case_id: caseId,
            action_type: 'refund_payment',
            amount: 1250,
            currency: 'EUR',
            demo_seed: true,
          },
          occurred_at: yesterday3pm,
        },
      ];
      const { error } = await supabase.from('audit_events').insert(auditRows);
      if (error && error.code !== '42P01') {
        logger.warn('demoSeed: audit_events insert failed (non-fatal)', { error: error.message });
      }
    }

    logger.info('demoSeed: seeded demo case', { tenantId, workspaceId, caseId });
    return true;
  } catch (err: any) {
    logger.warn('demoSeed: failed to seed demo case (non-fatal)', {
      tenantId,
      workspaceId,
      error: err?.message || String(err),
      details: err?.details,
      hint: err?.hint,
      code: err?.code,
    });
    return false;
  }
}

/**
 * Best-effort cleanup — used by a future "reset demo data" UI button.
 * Deletes everything that the seeder planted for this workspace.
 */
export async function deleteDemoCase(tenantId: string, workspaceId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const idStub = workspaceId.slice(0, 8);

  // First clean up the rows that reference the demo customer/case/approval
  // by foreign key — these are matched by customer_id / entity_id rather
  // than their own ids, so we can't go through the per-id deletion list.
  try {
    await supabase
      .from('audit_events')
      .delete()
      .in('entity_id', [`demo-case-${idStub}`, `demo-appr-${idStub}`])
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId);
  } catch (err) {
    logger.warn('demoSeed cleanup: audit_events delete failed', { error: String(err) });
  }
  try {
    await supabase
      .from('customer_activity')
      .delete()
      .eq('customer_id', `demo-cust-${idStub}`)
      .eq('tenant_id', tenantId);
  } catch (err) {
    logger.warn('demoSeed cleanup: customer_activity delete failed', { error: String(err) });
  }
  try {
    await supabase
      .from('linked_identities')
      .delete()
      .eq('customer_id', `demo-cust-${idStub}`)
      .eq('tenant_id', tenantId);
  } catch (err) {
    logger.warn('demoSeed cleanup: linked_identities delete failed', { error: String(err) });
  }
  try {
    await supabase
      .from('order_line_items')
      .delete()
      .in('order_id', [`demo-order-1-${idStub}`, `demo-order-2-${idStub}`])
      .eq('tenant_id', tenantId);
  } catch (err) {
    logger.warn('demoSeed cleanup: order_line_items delete failed', { error: String(err) });
  }

  const tablesAndIds: Array<[string, string[]]> = [
    ['approval_requests', [`demo-appr-${idStub}`]],
    ['cases', [`demo-case-${idStub}`]],
    ['messages', [
      `demo-msg-1-${idStub}`,
      `demo-msg-2-${idStub}`,
      `demo-msg-3-${idStub}`,
      `demo-msg-4-${idStub}`,
      `demo-msg-5-${idStub}`,
    ]],
    ['conversations', [`demo-conv-${idStub}`]],
    ['returns', [`demo-ret-1-${idStub}`]],
    ['payments', [`demo-pay-1-${idStub}`, `demo-pay-2-${idStub}`]],
    ['orders', [`demo-order-1-${idStub}`, `demo-order-2-${idStub}`]],
    ['knowledge_articles', [`demo-kb-${idStub}`]],
    ['knowledge_domains', [`demo-kb-dom-${idStub}`]],
    ['customers', [`demo-cust-${idStub}`]],
  ];

  for (const [table, ids] of tablesAndIds) {
    if (ids.length === 0) continue;
    try {
      await supabase
        .from(table)
        .delete()
        .in('id', ids)
        .eq('tenant_id', tenantId);
    } catch (err) {
      logger.warn(`demoSeed cleanup: ${table} delete failed`, { error: String(err) });
    }
  }
}
