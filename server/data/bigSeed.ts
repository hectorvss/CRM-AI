/**
 * server/data/bigSeed.ts
 *
 * Inserts a large, realistic dataset so every frontend view has meaningful data.
 * All IDs use the `seed-` prefix to avoid conflicts with demo data.
 * Errors in each section are caught and logged (non-fatal).
 */

import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';

interface SeedInput {
  tenantId: string;
  workspaceId: string;
  ownerUserId: string;
}

function isoMinutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

function isoHoursAgo(h: number): string {
  return isoMinutesAgo(h * 60);
}

function isoDaysAgo(d: number): string {
  return isoHoursAgo(d * 24);
}

export async function seedBigDataset(input: SeedInput): Promise<void> {
  const { tenantId, workspaceId, ownerUserId } = input;
  const supabase = getSupabaseAdmin();
  const stub = workspaceId.slice(0, 8);

  // ── Customer IDs ─────────────────────────────────────────────────────────────
  const custVip1   = `seed-cust-vip1-${stub}`;
  const custVip2   = `seed-cust-vip2-${stub}`;
  const custRisk1  = `seed-cust-risk1-${stub}`;
  const custRisk2  = `seed-cust-risk2-${stub}`;
  const custReg1   = `seed-cust-reg1-${stub}`;
  const custReg2   = `seed-cust-reg2-${stub}`;
  const custNew1   = `seed-cust-new1-${stub}`;
  const custCorp1  = `seed-cust-corp1-${stub}`;

  const now = new Date().toISOString();

  // ── 1. Customers ─────────────────────────────────────────────────────────────
  {
    const rows = [
      {
        id: custVip1,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        canonical_email: 'elena.martinez@example.com',
        email: 'elena.martinez@example.com',
        phone: '+34 611 100 001',
        canonical_name: 'Elena Martínez',
        segment: 'vip',
        risk_level: 'medium',
        lifetime_value: 24500,
        currency: 'EUR',
        preferred_channel: 'email',
        dispute_rate: 0.12,
        refund_rate: 0.10,
        chargeback_count: 3,
        total_orders: 18,
        total_spent: 24500,
        created_at: isoDaysAgo(740),
        updated_at: now,
      },
      {
        id: custVip2,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        canonical_email: 'carlos.rodriguez@example.com',
        email: 'carlos.rodriguez@example.com',
        phone: '+34 622 200 002',
        canonical_name: 'Carlos Rodríguez',
        segment: 'vip',
        risk_level: 'low',
        lifetime_value: 31200,
        currency: 'EUR',
        preferred_channel: 'email',
        dispute_rate: 0.02,
        refund_rate: 0.04,
        chargeback_count: 0,
        total_orders: 24,
        total_spent: 31200,
        created_at: isoDaysAgo(920),
        updated_at: now,
      },
      {
        id: custRisk1,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        canonical_email: 'javier.lopez@example.com',
        email: 'javier.lopez@example.com',
        phone: '+34 633 300 003',
        canonical_name: 'Javier López',
        segment: 'at_risk',
        risk_level: 'high',
        lifetime_value: 2100,
        currency: 'EUR',
        preferred_channel: 'whatsapp',
        dispute_rate: 0.28,
        refund_rate: 0.22,
        chargeback_count: 4,
        total_orders: 9,
        total_spent: 2100,
        created_at: isoDaysAgo(360),
        updated_at: now,
      },
      {
        id: custRisk2,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        canonical_email: 'ana.garcia@example.com',
        email: 'ana.garcia@example.com',
        phone: '+34 644 400 004',
        canonical_name: 'Ana García',
        segment: 'at_risk',
        risk_level: 'critical',
        lifetime_value: 890,
        currency: 'EUR',
        preferred_channel: 'chat',
        dispute_rate: 0.45,
        refund_rate: 0.38,
        chargeback_count: 2,
        total_orders: 4,
        total_spent: 890,
        created_at: isoDaysAgo(180),
        updated_at: now,
      },
      {
        id: custReg1,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        canonical_email: 'miguel.torres@example.com',
        email: 'miguel.torres@example.com',
        phone: '+34 655 500 005',
        canonical_name: 'Miguel Torres',
        segment: 'regular',
        risk_level: 'low',
        lifetime_value: 4800,
        currency: 'EUR',
        preferred_channel: 'email',
        dispute_rate: 0.03,
        refund_rate: 0.05,
        chargeback_count: 0,
        total_orders: 11,
        total_spent: 4800,
        created_at: isoDaysAgo(520),
        updated_at: now,
      },
      {
        id: custReg2,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        canonical_email: 'laura.sanchez@example.com',
        email: 'laura.sanchez@example.com',
        phone: '+34 666 600 006',
        canonical_name: 'Laura Sánchez',
        segment: 'regular',
        risk_level: 'low',
        lifetime_value: 3200,
        currency: 'EUR',
        preferred_channel: 'email',
        dispute_rate: 0.01,
        refund_rate: 0.06,
        chargeback_count: 0,
        total_orders: 8,
        total_spent: 3200,
        created_at: isoDaysAgo(400),
        updated_at: now,
      },
      {
        id: custNew1,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        canonical_email: 'pedro.fernandez@example.com',
        email: 'pedro.fernandez@example.com',
        phone: '+34 677 700 007',
        canonical_name: 'Pedro Fernández',
        segment: 'new',
        risk_level: 'low',
        lifetime_value: 120,
        currency: 'EUR',
        preferred_channel: 'chat',
        dispute_rate: 0,
        refund_rate: 0,
        chargeback_count: 0,
        total_orders: 1,
        total_spent: 120,
        created_at: isoDaysAgo(7),
        updated_at: now,
      },
      {
        id: custCorp1,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        canonical_email: 'pedidos@distribuciones-martin.es',
        email: 'pedidos@distribuciones-martin.es',
        phone: '+34 910 800 008',
        canonical_name: 'Distribuciones Martín SL',
        segment: 'enterprise',
        risk_level: 'low',
        lifetime_value: 87000,
        currency: 'EUR',
        preferred_channel: 'email',
        dispute_rate: 0.01,
        refund_rate: 0.02,
        chargeback_count: 0,
        total_orders: 62,
        total_spent: 87000,
        created_at: isoDaysAgo(1100),
        updated_at: now,
      },
    ];
    const { error } = await supabase.from('customers').insert(rows);
    if (error) logger.warn('bigSeed: customers insert failed', { error: error.message });
  }

  // ── 2. Companies ──────────────────────────────────────────────────────────────
  {
    const rows = [
      {
        id: `seed-co-1-${stub}`,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        name: 'Distribuciones Martín SL',
        domain: 'distribuciones-martin.es',
        industry: 'wholesale',
        employee_count: 120,
        annual_revenue: 87000,
        currency: 'EUR',
        created_at: isoDaysAgo(1100),
        updated_at: now,
      },
      {
        id: `seed-co-2-${stub}`,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        name: 'Moda Ibérica SA',
        domain: 'moda-iberica.com',
        industry: 'retail',
        employee_count: 450,
        annual_revenue: 210000,
        currency: 'EUR',
        created_at: isoDaysAgo(800),
        updated_at: now,
      },
      {
        id: `seed-co-3-${stub}`,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        name: 'Boutique Castellana',
        domain: 'boutique-castellana.es',
        industry: 'luxury retail',
        employee_count: 18,
        annual_revenue: 34000,
        currency: 'EUR',
        created_at: isoDaysAgo(500),
        updated_at: now,
      },
    ];
    const { error } = await supabase.from('companies').insert(rows);
    if (error) logger.warn('bigSeed: companies insert failed (non-fatal)', { error: error.message });
  }

  // ── 3. Orders (15) ────────────────────────────────────────────────────────────
  const orderIds = Array.from({ length: 15 }, (_, i) => `seed-order-${i + 1}-${stub}`);
  {
    const brands = ['Zara', 'Mango', 'El Corte Inglés', 'Pull&Bear', 'Massimo Dutti'];
    const statuses = ['delivered', 'delivered', 'delivered', 'in_transit', 'in_transit', 'processing', 'processing', 'cancelled', 'returned', 'delivered', 'in_transit', 'delivered', 'processing', 'returned', 'delivered'];
    const customerLinks = [custVip1, custVip1, custVip2, custVip2, custVip2, custRisk1, custRisk1, custRisk1, custRisk2, custReg1, custReg1, custReg2, custReg2, custCorp1, custNew1];
    const amounts = [890, 1450, 2200, 340, 780, 120, 560, 230, 445, 1890, 670, 320, 890, 4500, 120];

    const rows = orderIds.map((id, i) => ({
      id,
      external_order_id: `SHOP-#5${String(i + 1).padStart(4, '0')}`,
      customer_id: customerLinks[i],
      tenant_id: tenantId,
      workspace_id: workspaceId,
      status: statuses[i],
      fulfillment_status: statuses[i] === 'delivered' ? 'delivered' : statuses[i] === 'in_transit' ? 'shipped' : statuses[i] === 'cancelled' ? 'cancelled' : statuses[i] === 'returned' ? 'returned' : 'processing',
      tracking_number: `GLS-${7000000 + i * 111111}`,
      tracking_url: `https://gls-spain.es/track/${7000000 + i * 111111}`,
      shipping_address: ['Calle Velázquez 47, 28001 Madrid', 'Passeig de Gràcia 88, 08008 Barcelona', 'Av. de la Constitución 12, 41001 Sevilla', 'Calle Colón 30, 46004 Valencia', 'Gran Vía 45, 48011 Bilbao'][i % 5],
      system_states: JSON.stringify({ shopify: statuses[i] }),
      total_amount: amounts[i],
      currency: 'EUR',
      country: 'ES',
      brand: brands[i % brands.length],
      channel: 'shopify',
      order_date: isoDaysAgo(30 - i * 2),
      has_conflict: [6, 7, 8].includes(i) ? 1 : 0,
      risk_level: [2, 5, 6].includes(i) ? 'high' : 'low',
      order_type: 'fashion',
      approval_status: 'auto_approved',
      summary: `Pedido de ${brands[i % brands.length]} — ${amounts[i]}€`,
      last_sync_at: now,
      last_update: now,
      badges: JSON.stringify([]),
      tab: statuses[i] === 'delivered' ? 'delivered' : 'attention',
      created_at: isoDaysAgo(30 - i * 2),
      updated_at: now,
    }));

    const { error } = await supabase.from('orders').insert(rows);
    if (error) logger.warn('bigSeed: orders insert failed', { error: error.message });
  }

  // ── 4. Payments (15, one per order) ──────────────────────────────────────────
  const paymentIds = Array.from({ length: 15 }, (_, i) => `seed-pay-${i + 1}-${stub}`);
  {
    const psps = ['stripe', 'redsys', 'paypal', 'stripe', 'stripe', 'redsys', 'stripe', 'paypal', 'stripe', 'stripe', 'redsys', 'stripe', 'paypal', 'stripe', 'redsys'];
    const statuses = ['captured', 'captured', 'captured', 'captured', 'captured', 'refunded', 'disputed', 'captured', 'refunded', 'captured', 'captured', 'failed', 'captured', 'captured', 'captured'];
    const amounts = [890, 1450, 2200, 340, 780, 120, 560, 230, 445, 1890, 670, 320, 890, 4500, 120];
    const customerLinks = [custVip1, custVip1, custVip2, custVip2, custVip2, custRisk1, custRisk1, custRisk1, custRisk2, custReg1, custReg1, custReg2, custReg2, custCorp1, custNew1];

    const rows = paymentIds.map((id, i) => ({
      id,
      external_payment_id: `pi_seed_${stub}_${i + 1}`,
      order_id: orderIds[i],
      customer_id: customerLinks[i],
      tenant_id: tenantId,
      workspace_id: workspaceId,
      amount: amounts[i],
      currency: 'EUR',
      payment_method: 'card',
      psp: psps[i],
      status: statuses[i],
      system_states: JSON.stringify({ [psps[i]]: statuses[i] }),
      refund_ids: JSON.stringify([]),
      risk_level: statuses[i] === 'disputed' ? 'high' : 'low',
      payment_type: 'card_purchase',
      approval_status: 'auto_approved',
      summary: `Pago ${psps[i]} por pedido SHOP-#5${String(i + 1).padStart(4, '0')}`,
      has_conflict: statuses[i] === 'disputed' ? 1 : 0,
      authorized_at: isoDaysAgo(30 - i * 2),
      captured_at: isoDaysAgo(30 - i * 2),
      refund_status: statuses[i] === 'refunded' ? 'refunded' : 'none',
      created_at: isoDaysAgo(30 - i * 2),
      updated_at: now,
      last_update: now,
    }));

    const { error } = await supabase.from('payments').insert(rows);
    if (error) logger.warn('bigSeed: payments insert failed', { error: error.message });
  }

  // ── 5. Returns (6) ────────────────────────────────────────────────────────────
  const returnIds = Array.from({ length: 6 }, (_, i) => `seed-ret-${i + 1}-${stub}`);
  {
    const reasons = ['damaged_on_arrival', 'wrong_item', 'not_as_described', 'changed_mind', 'defective', 'size_issue'];
    const statuses = ['inspection_pending', 'approved', 'rejected', 'completed', 'inspection_pending', 'approved'];
    const returnOrderLinks = [0, 1, 5, 8, 13, 3]; // indices into orderIds
    const returnCustomers = [custVip1, custVip1, custRisk1, custRisk2, custCorp1, custVip2];
    const returnAmounts = [890, 1450, 120, 445, 4500, 340];

    const rows = returnIds.map((id, i) => ({
      id,
      external_return_id: `RMA-SEED-${1000 + i}`,
      order_id: orderIds[returnOrderLinks[i]],
      customer_id: returnCustomers[i],
      tenant_id: tenantId,
      workspace_id: workspaceId,
      type: 'refund_or_replacement',
      return_reason: reasons[i],
      return_value: returnAmounts[i],
      status: statuses[i],
      inspection_status: statuses[i] === 'inspection_pending' ? 'awaiting_warehouse' : 'completed',
      refund_status: statuses[i] === 'approved' || statuses[i] === 'completed' ? 'refunded' : 'pending_approval',
      carrier_status: 'label_issued',
      has_conflict: i === 0 ? 1 : 0,
      approval_status: statuses[i] === 'approved' || statuses[i] === 'completed' ? 'approved' : 'pending',
      risk_level: i === 0 ? 'high' : 'low',
      linked_refund_id: null,
      linked_shipment_id: `GLS-RMA-SEED-${7800000 + i}`,
      system_states: JSON.stringify({ warehouse: statuses[i] === 'inspection_pending' ? 'awaiting_inbound' : 'received', carrier: 'label_issued' }),
      summary: `Devolución: ${reasons[i].replace(/_/g, ' ')} — €${returnAmounts[i]}`,
      badges: JSON.stringify(i === 0 ? ['damaged', 'high_value'] : []),
      tab: statuses[i],
      method: 'carrier_pickup',
      brand: ['Zara', 'El Corte Inglés', 'Pull&Bear', 'Mango', 'Massimo Dutti', 'Zara'][i],
      country: 'ES',
      currency: 'EUR',
      last_update: now,
      created_at: isoDaysAgo(20 - i * 3),
      updated_at: now,
    }));

    const { error } = await supabase.from('returns').insert(rows);
    if (error) logger.warn('bigSeed: returns insert failed', { error: error.message });
  }

  // ── 6. Knowledge domains (3) + articles (8) ───────────────────────────────────
  const domDevoluciones  = `seed-kb-dom-dev-${stub}`;
  const domEnvios        = `seed-kb-dom-env-${stub}`;
  const domFacturacion   = `seed-kb-dom-fac-${stub}`;

  {
    const domainRows = [
      { id: domDevoluciones, tenant_id: tenantId, workspace_id: workspaceId, name: 'Devoluciones', description: 'Política de devoluciones y reembolsos.', created_at: isoDaysAgo(90) },
      { id: domEnvios,       tenant_id: tenantId, workspace_id: workspaceId, name: 'Envíos y Logística', description: 'Plazos de entrega, carriers y reclamaciones.', created_at: isoDaysAgo(90) },
      { id: domFacturacion,  tenant_id: tenantId, workspace_id: workspaceId, name: 'Facturación y Pagos', description: 'Métodos de pago, facturas y chargebacks.', created_at: isoDaysAgo(90) },
    ];
    const { error } = await supabase.from('knowledge_domains').insert(domainRows);
    if (error) logger.warn('bigSeed: knowledge_domains insert failed', { error: error.message });
  }

  const articleIds = Array.from({ length: 8 }, (_, i) => `seed-kb-art-${i + 1}-${stub}`);
  {
    const articles = [
      {
        id: articleIds[0],
        domain_id: domDevoluciones,
        title: 'Política general de devoluciones (14 días)',
        content: '# Política de devoluciones\n\nAceptamos devoluciones en un plazo de 14 días naturales desde la entrega. El artículo debe estar en perfectas condiciones, sin usar y con etiquetas originales.\n\n## Pasos\n1. Solicitar autorización de devolución (RMA) al equipo de atención al cliente.\n2. Empaquetar el artículo de forma segura.\n3. Imprimir y pegar la etiqueta de devolución.\n4. Entregarlo en cualquier punto de recogida GLS.\n\n## Excepciones\n- Artículos personalizados: no admiten devolución.\n- Ropa interior y bañadores: no admiten devolución por razones de higiene.',
      },
      {
        id: articleIds[1],
        domain_id: domDevoluciones,
        title: 'Reembolsos por artículos dañados en el transporte',
        content: '# Artículos dañados en el transporte\n\nSi el cliente recibe un artículo dañado durante el envío, tiene derecho a un reembolso completo o a un reenvío sin coste adicional.\n\n## Procedimiento\n1. Solicitar fotos del daño al cliente (máximo 48h desde la entrega).\n2. Abrir incidencia con el carrier (GLS / SEUR / Correos Express).\n3. Aprobar el reembolso o reenvío sin esperar la resolución del carrier si el LTV del cliente es > €1.000.\n4. Documentar el caso con las fotos recibidas.',
      },
      {
        id: articleIds[2],
        domain_id: domDevoluciones,
        title: 'Proceso de inspección en almacén',
        content: '# Inspección en almacén\n\nTodos los artículos devueltos se inspeccionan en un plazo de 24-48h hábiles desde la recepción.\n\n## Criterios de aceptación\n- Sin signos de uso.\n- Etiquetas originales intactas.\n- Embalaje original (cuando corresponda).\n\n## Resultado de la inspección\n- **Aceptado**: se procesa el reembolso en 3-5 días hábiles.\n- **Rechazado**: se devuelve el artículo al cliente con un informe fotográfico.',
      },
      {
        id: articleIds[3],
        domain_id: domEnvios,
        title: 'Plazos de entrega por zona geográfica',
        content: '# Plazos de entrega\n\n| Zona | Estándar | Exprés |\n|------|----------|--------|\n| Península | 2-4 días | 24h |\n| Baleares | 3-5 días | 48h |\n| Canarias | 5-8 días | 72h |\n| Portugal | 3-5 días | 48h |\n\n## Carriers utilizados\n- GLS Spain (envío estándar península)\n- SEUR (envío exprés)\n- Correos Express (zonas remotas)\n\n## Seguimiento\nTodos los envíos incluyen número de seguimiento enviado por email al confirmar el pedido.',
      },
      {
        id: articleIds[4],
        domain_id: domEnvios,
        title: 'Reclamaciones por paquetes perdidos',
        content: '# Paquetes perdidos\n\nSi el tracking no muestra movimiento en más de 5 días hábiles, consideramos el paquete como posiblemente perdido.\n\n## Pasos\n1. Verificar el estado en el portal del carrier.\n2. Abrir investigación con el carrier (plazo máximo de respuesta: 10 días hábiles).\n3. Si el carrier confirma la pérdida o transcurren 15 días sin localización, proceder con:\n   - Reenvío sin coste, o\n   - Reembolso completo según preferencia del cliente.\n4. Reclamar el seguro del carrier cuando el importe supere €150.',
      },
      {
        id: articleIds[5],
        domain_id: domEnvios,
        title: 'Envíos internacionales — aduanas y aranceles',
        content: '# Envíos internacionales\n\nLos pedidos enviados fuera de la UE pueden estar sujetos a aranceles e impuestos de importación locales.\n\n## Información al cliente\n- Informar al cliente antes del pago si el destino está fuera de la UE.\n- Los gastos aduaneros corren a cargo del destinatario.\n- No nos hacemos responsables de los retrasos causados por la aduana.\n\n## Países con restricciones de importación de moda\n- Argentina: límite de €200 sin declaración.\n- Brasil: declaración obligatoria > $50 USD.',
      },
      {
        id: articleIds[6],
        domain_id: domFacturacion,
        title: 'Política de chargebacks — protocolo de respuesta',
        content: '# Protocolo de respuesta a chargebacks\n\nCuando un cliente abre un chargeback con su banco, debemos actuar con rapidez para presentar evidencias.\n\n## Plazos\n- Stripe: 7 días para presentar evidencias.\n- Redsys: 10 días.\n- PayPal: 20 días.\n\n## Evidencias a reunir\n1. Confirmación del pedido con dirección de entrega.\n2. Prueba de entrega (firma del carrier o confirmación de entrega).\n3. Comunicaciones con el cliente relacionadas con el pedido.\n4. Fotos del artículo enviado (si están disponibles).\n\n## IMPORTANTE\nNunca procesar un reembolso voluntario mientras hay un chargeback abierto — duplicaría el cargo.',
      },
      {
        id: articleIds[7],
        domain_id: domFacturacion,
        title: 'Métodos de pago aceptados y límites de reembolso',
        content: '# Métodos de pago y reembolsos\n\n## Métodos aceptados\n- Tarjeta de crédito/débito (Visa, Mastercard, Amex)\n- PayPal\n- Bizum (solo España)\n- Transferencia bancaria (pedidos > €500)\n\n## Reembolsos\n- El reembolso se realiza siempre al mismo método de pago original.\n- Plazo: 3-10 días hábiles según el banco emisor.\n- Reembolsos > €500 requieren aprobación de supervisor.\n- Reembolsos > €1.000 requieren aprobación de manager de operaciones.\n\n## Comisiones\n- PayPal cobra 2.9% + €0.30 de comisión al comercio en cada reembolso.',
      },
    ];

    const now2 = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    const rows = articles.map((a) => ({
      ...a,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      type: 'policy',
      status: 'published',
      owner_user_id: ownerUserId,
      review_cycle_days: 180,
      last_reviewed_at: isoDaysAgo(30),
      next_review_at: now2,
      version: 1,
      citation_count: 0,
      outdated_flag: false,
      linked_workflow_ids: JSON.stringify([]),
      linked_approval_policy_ids: JSON.stringify([]),
      created_at: isoDaysAgo(90),
      updated_at: isoDaysAgo(30),
    }));

    const { error } = await supabase.from('knowledge_articles').insert(rows);
    if (error) logger.warn('bigSeed: knowledge_articles insert failed', { error: error.message });
  }

  // ── 7. Cases (20) ─────────────────────────────────────────────────────────────
  const caseIds = Array.from({ length: 20 }, (_, i) => `seed-case-${i + 1}-${stub}`);
  const convIds = Array.from({ length: 12 }, (_, i) => `seed-conv-${i + 1}-${stub}`);

  // Distribution: 4 cases → vip1, 3 → vip2, 3 → risk1, 2 → risk2, 3 → reg1, 2 → reg2, 2 → corp1, 1 → new1
  const caseCustomers = [
    custVip1, custVip1, custVip1, custVip1,   // 1-4
    custVip2, custVip2, custVip2,             // 5-7
    custRisk1, custRisk1, custRisk1,          // 8-10
    custRisk2, custRisk2,                     // 11-12
    custReg1, custReg1, custReg1,             // 13-15
    custReg2, custReg2,                       // 16-17
    custCorp1, custCorp1,                     // 18-19
    custNew1,                                 // 20
  ];

  const caseStatuses = ['open', 'open', 'escalated', 'pending', 'open', 'resolved', 'closed', 'open', 'escalated', 'new', 'open', 'pending', 'open', 'resolved', 'closed', 'open', 'new', 'open', 'pending', 'new'];
  const casePriorities = ['urgent', 'high', 'urgent', 'normal', 'high', 'normal', 'low', 'urgent', 'high', 'normal', 'high', 'normal', 'normal', 'low', 'low', 'normal', 'low', 'high', 'normal', 'low'];
  const caseTypes = ['refund_request', 'damaged_item', 'chargeback', 'billing_issue', 'shipping_delay', 'general_support', 'fraud_review', 'refund_request', 'chargeback', 'damaged_item', 'fraud_review', 'billing_issue', 'shipping_delay', 'general_support', 'account_issue', 'refund_request', 'general_support', 'billing_issue', 'shipping_delay', 'general_support'];
  const caseRisks = ['high', 'medium', 'critical', 'low', 'medium', 'low', 'low', 'critical', 'high', 'medium', 'critical', 'high', 'low', 'low', 'low', 'medium', 'low', 'medium', 'low', 'low'];
  const caseSlaStatuses = ['breached', 'at_risk', 'breached', 'on_track', 'at_risk', 'on_track', 'on_track', 'breached', 'at_risk', 'on_track', 'breached', 'at_risk', 'on_track', 'on_track', 'on_track', 'at_risk', 'on_track', 'on_track', 'on_track', 'on_track'];

  {
    const diagnosisList = [
      'Cliente VIP solicita reembolso por artículo dañado. Alta probabilidad de chargeback si no se resuelve en 24h.',
      'Bolso recibido con cremallera rota. Solicita cambio o reembolso. Sin antecedentes negativos previos.',
      'Chargeback abierto por el banco del cliente. Se requiere respuesta con evidencias en 7 días.',
      'Discrepancia en el importe facturado. Posible error del sistema de precios.',
      'Paquete sin movimiento desde hace 6 días. Posible pérdida por el carrier.',
      'Consulta general sobre política de tallas. Bajo riesgo.',
      'Posible intento de fraude: 3 pedidos con distintas direcciones en 24h.',
      'Cliente de alto riesgo solicita reembolso de €560. Historial de 4 chargebacks previos.',
      'Segundo chargeback del mismo cliente en 30 días. Señal de fraude potencial.',
      'Artículo llegó sin uno de los componentes incluidos en la descripción.',
      'Actividad sospechosa: accesos desde múltiples IPs en diferentes países.',
      'Cliente reclama cargo duplicado en su tarjeta. Verificar logs de pago.',
      'Retraso de 8 días en entrega. Cliente solicita cancelación y reembolso.',
      'Consulta sobre estado de pedido. Resuelto tras informar del tracking.',
      'Solicitud de cambio de contraseña tras intento de acceso no autorizado.',
      'Reembolso por talla incorrecta. Cliente confirmó error al seleccionar.',
      'Primera consulta del cliente nuevo. Pregunta sobre política de devoluciones.',
      'Error en la factura electrónica. NIF del cliente incorrecto.',
      'Pedido empresarial con retraso de 3 días. Requiere confirmación de nueva fecha.',
      'Consulta básica sobre horarios del servicio de atención al cliente.',
    ];

    const rootCauses = [
      'Daño durante el transporte por manipulación inadecuada del carrier.',
      'Defecto de fabricación detectado post-envío.',
      'Cliente inició disputa sin contactar primero con el servicio de atención.',
      'Error en la configuración de precios promocionales en el sistema.',
      'Incidencia en el hub de clasificación del carrier.',
      'N/A — consulta informativa.',
      'Patrón de compra anómalo detectado por el sistema antifraude.',
      'Cliente de alto riesgo con historial de abusos del sistema de devoluciones.',
      'Posible fraude sistémico: mismo dispositivo, distintos datos de pago.',
      'Error de embalaje en el almacén de origen.',
      'Credenciales comprometidas — posible brecha de seguridad externa.',
      'Error técnico en la pasarela de pago (doble procesamiento).',
      'Retraso por huelga de transportistas en la zona de destino.',
      'Tracking no actualizado correctamente en el sistema del carrier.',
      'Intento de acceso por tercero no autorizado.',
      'Error del cliente en la selección de talla durante el proceso de compra.',
      'Primera interacción — sin causa raíz definida.',
      'Error de integración con el sistema de facturación electrónica.',
      'Incidencia logística por volumen estacional elevado.',
      'Consulta rutinaria — sin incidencia.',
    ];

    const recommendedActions = [
      'Aprobar reembolso completo + notificar al carrier.',
      'Emitir etiqueta de cambio y procesar reenvío.',
      'Recopilar evidencias y responder chargeback en plataforma del PSP.',
      'Emitir factura rectificativa y reembolsar diferencia.',
      'Abrir reclamación formal con el carrier y ofrecer reenvío.',
      'Responder con información de política de tallas.',
      'Bloquear cuenta temporalmente y escalar a equipo de fraude.',
      'Solicitar aprobación de supervisor antes de procesar reembolso.',
      'Escalar a equipo de fraude y bloquear futuros pedidos.',
      'Enviar el componente faltante sin coste adicional.',
      'Resetear contraseña forzosamente y activar 2FA.',
      'Verificar doble cargo en Stripe y reembolsar el duplicado.',
      'Ofrecer reembolso o esperar 48h más con confirmación del carrier.',
      'Informar del estado actual del pedido y cerrar el caso.',
      'Restablecer acceso con verificación adicional de identidad.',
      'Procesar devolución y reenvío de la talla correcta.',
      'Explicar la política de devoluciones de forma clara.',
      'Emitir nueva factura con datos correctos.',
      'Contactar al carrier y enviar nueva fecha estimada al cliente.',
      'Informar horarios: L-V 9:00-18:00 y cerrar el caso.',
    ];

    const caseRows = caseIds.map((id, i) => ({
      id,
      case_number: `SEED-${String(i + 1).padStart(4, '0')}`,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      source_system: ['gmail', 'whatsapp', 'chat', 'phone'][i % 4],
      source_channel: ['email', 'whatsapp', 'chat', 'phone'][i % 4],
      type: caseTypes[i],
      intent: caseTypes[i].replace(/_/g, ' '),
      status: caseStatuses[i],
      priority: casePriorities[i],
      severity: casePriorities[i] === 'urgent' ? 'S1' : casePriorities[i] === 'high' ? 'S2' : 'S3',
      risk_level: caseRisks[i],
      fraud_flag: caseTypes[i] === 'fraud_review' ? 1 : 0,
      assigned_user_id: ownerUserId,
      created_by_user_id: ownerUserId,
      sla_status: caseSlaStatuses[i],
      sla_first_response_deadline: isoDaysAgo(-1),
      sla_resolution_deadline: isoDaysAgo(-3 + i),
      customer_id: caseCustomers[i],
      order_ids: JSON.stringify([]),
      payment_ids: JSON.stringify([]),
      return_ids: JSON.stringify([]),
      conversation_id: null,
      ai_diagnosis: diagnosisList[i],
      ai_root_cause: rootCauses[i],
      ai_confidence: 0.72 + (i % 5) * 0.05,
      ai_recommended_action: recommendedActions[i],
      ai_evidence_refs: JSON.stringify([]),
      approval_state: ['urgent', 'escalated'].includes(caseStatuses[i]) || casePriorities[i] === 'urgent' ? 'pending_approval' : 'not_required',
      execution_state: 'idle',
      resolution_state: ['resolved', 'closed'].includes(caseStatuses[i]) ? 'resolved' : 'in_progress',
      has_reconciliation_conflicts: caseRisks[i] === 'critical' ? 1 : 0,
      tags: JSON.stringify([caseTypes[i], caseRisks[i]]),
      created_at: isoDaysAgo(30 - i),
      updated_at: isoDaysAgo(Math.max(0, 5 - i % 5)),
      first_response_at: isoDaysAgo(29 - i),
      last_activity_at: isoDaysAgo(Math.max(0, 2 - i % 3)),
    }));

    const { error } = await supabase.from('cases').insert(caseRows);
    if (error) logger.warn('bigSeed: cases insert failed', { error: error.message });
  }

  // ── 8. Conversations (12) linked to cases ─────────────────────────────────────
  {
    const channels = ['email', 'whatsapp', 'chat', 'phone', 'email', 'chat', 'whatsapp', 'email', 'phone', 'chat', 'email', 'whatsapp'];
    const subjects = [
      'Artículo dañado — solicito reembolso urgente',
      'Mi bolso llegó roto',
      'Chargeback SEED-0003 — disputa abierta',
      'Error en mi factura',
      'Paquete perdido — pedido SHOP-#50005',
      'Consulta sobre política de tallas',
      'Actividad sospechosa en mi cuenta',
      'Reembolso denegado — caso SEED-0008',
      'Segundo chargeback en 30 días',
      'Artículo incompleto recibido',
      'Cargo duplicado en mi tarjeta',
      'Retraso en mi pedido empresarial',
    ];
    const caseForConv = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 17]; // case indices

    const convRows = convIds.map((id, i) => ({
      id,
      case_id: caseIds[caseForConv[i]],
      customer_id: caseCustomers[caseForConv[i]],
      channel: channels[i],
      status: 'open',
      subject: subjects[i],
      external_thread_id: `ext-thread-${stub}-${i + 1}`,
      first_message_at: isoDaysAgo(29 - i * 2),
      last_message_at: isoDaysAgo(Math.max(0, 5 - i)),
      created_at: isoDaysAgo(29 - i * 2),
      updated_at: now,
      tenant_id: tenantId,
      workspace_id: workspaceId,
    }));

    const { error } = await supabase.from('conversations').insert(convRows);
    if (error) logger.warn('bigSeed: conversations insert failed', { error: error.message });
  }

  // Patch cases with conversation_id
  {
    const caseForConv = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 17];
    for (let i = 0; i < convIds.length; i++) {
      const { error } = await supabase
        .from('cases')
        .update({ conversation_id: convIds[i] })
        .eq('id', caseIds[caseForConv[i]])
        .eq('tenant_id', tenantId);
      if (error) logger.warn(`bigSeed: case conv patch ${i} failed`, { error: error.message });
    }
  }

  // ── 9. Messages (5-8 per conversation, ~60 total) ─────────────────────────────
  {
    const messageData: Array<{
      conversationIdx: number;
      messages: Array<{ dir: 'inbound' | 'outbound'; content: string; minsAgo: number; sentiment?: string; sentimentScore?: number }>;
    }> = [
      {
        conversationIdx: 0,
        messages: [
          { dir: 'inbound', content: 'Hola, acabo de recibir mi pedido y el artículo llegó con un daño visible en el lateral. No es aceptable para el precio que pagué. Adjunto fotos. Exijo un reembolso inmediato.', minsAgo: 29 * 1440, sentiment: 'negative', sentimentScore: -0.75 },
          { dir: 'outbound', content: 'Buenos días Elena, lamentamos profundamente lo ocurrido. Hemos revisado tu caso y procederemos a gestionar el reembolso. Necesitamos que nos confirmes el número de pedido y que el artículo esté en las condiciones originales para proceder.', minsAgo: 29 * 1440 - 45 },
          { dir: 'inbound', content: 'El número de pedido es SHOP-#50001. El artículo tiene el precinto puesto, ni lo he usado. ¿Cuándo recibiré el reembolso?', minsAgo: 29 * 1440 - 120, sentiment: 'negative', sentimentScore: -0.5 },
          { dir: 'outbound', content: 'Gracias por la información. Te enviamos ahora mismo la etiqueta de devolución. Una vez recibamos el artículo en el almacén (24-48h), procesaremos el reembolso completo de €890 en 3-5 días hábiles.', minsAgo: 28 * 1440 },
          { dir: 'inbound', content: '¿Por qué tengo que esperar? Esto es una falta de respeto al cliente. Voy a abrir una reclamación con mi banco si no se resuelve hoy.', minsAgo: 27 * 1440, sentiment: 'very_negative', sentimentScore: -0.88 },
          { dir: 'outbound', content: 'Entendemos tu frustración, Elena. Hemos escalado tu caso a prioridad urgente. Nuestro supervisor revisará la solicitud de reembolso antes de fin de jornada.', minsAgo: 26 * 1440 },
        ],
      },
      {
        conversationIdx: 1,
        messages: [
          { dir: 'inbound', content: 'Buenas tardes. He recibido el bolso pero la cremallera no cierra bien desde el primer momento. Parece un defecto de fábrica. ¿Puedo cambiarlo?', minsAgo: 27 * 1440, sentiment: 'negative', sentimentScore: -0.45 },
          { dir: 'outbound', content: 'Hola Carlos, sentimos mucho lo ocurrido. Podemos gestionar el cambio sin problema. ¿Nos envías una foto del defecto para documentarlo en el sistema?', minsAgo: 27 * 1440 - 60 },
          { dir: 'inbound', content: 'Aquí tienes la foto. Como puedes ver, la cremallera está torcida desde la costura.', minsAgo: 26 * 1440, sentiment: 'neutral', sentimentScore: -0.1 },
          { dir: 'outbound', content: 'Perfecto Carlos. Hemos verificado el defecto. Te enviamos la etiqueta de recogida y en cuanto llege al almacén te mandamos el artículo nuevo. Proceso estimado: 5-7 días hábiles.', minsAgo: 25 * 1440 },
          { dir: 'inbound', content: 'De acuerdo. ¿Podéis enviarlo a la misma dirección?', minsAgo: 24 * 1440, sentiment: 'neutral', sentimentScore: 0.1 },
          { dir: 'outbound', content: 'Sí, exactamente a la misma dirección. Te enviaremos el número de seguimiento del nuevo envío en cuanto esté disponible.', minsAgo: 23 * 1440 },
          { dir: 'inbound', content: 'Gracias por la rapidez.', minsAgo: 22 * 1440, sentiment: 'positive', sentimentScore: 0.6 },
        ],
      },
      {
        conversationIdx: 2,
        messages: [
          { dir: 'inbound', content: 'He contactado con mi banco porque no estaba recibiendo respuesta a mi reclamación. Han abierto un chargeback por €2.200. ¿Qué vais a hacer?', minsAgo: 25 * 1440, sentiment: 'negative', sentimentScore: -0.65 },
          { dir: 'outbound', content: 'Hola Carlos, entendemos tu decisión aunque lamentamos que se haya llegado a este punto. Para poder ayudarte mejor, ¿puedes indicarnos el motivo que alegaste ante el banco para abrir la disputa?', minsAgo: 25 * 1440 - 90 },
          { dir: 'inbound', content: 'Puse "servicio no recibido" porque llevaba semanas esperando respuesta.', minsAgo: 24 * 1440, sentiment: 'negative', sentimentScore: -0.55 },
          { dir: 'outbound', content: 'Comprendemos. Vamos a recopilar las evidencias de entrega y comunicación para responder al banco. Si el chargeback se resuelve a tu favor a través del banco, el reembolso llegará por esa vía. Si prefieres retirar la disputa, podemos tramitar el reembolso directamente nosotros de forma más rápida.', minsAgo: 23 * 1440 },
          { dir: 'inbound', content: 'Lo pensaré. ¿Cuánto tardaría si retiro la disputa?', minsAgo: 22 * 1440, sentiment: 'neutral', sentimentScore: 0.0 },
          { dir: 'outbound', content: 'Si retiras la disputa hoy, el reembolso estaría procesado en 3-5 días hábiles. A través del banco pueden ser 30-60 días.', minsAgo: 21 * 1440 },
        ],
      },
      {
        conversationIdx: 3,
        messages: [
          { dir: 'inbound', content: 'Hola, me habéis cobrado €1.450 en lugar de €1.350 que era el precio con el descuento aplicado. Necesito que me reembolséis la diferencia.', minsAgo: 23 * 1440, sentiment: 'negative', sentimentScore: -0.4 },
          { dir: 'outbound', content: 'Buenos días, lamentamos la confusión. Vamos a revisar el pedido y la aplicación del descuento. ¿Nos puedes indicar el código promocional que usaste?', minsAgo: 23 * 1440 - 30 },
          { dir: 'inbound', content: 'El código era VERANO2024. Aparecía como válido en el carrito antes de pagar.', minsAgo: 22 * 1440, sentiment: 'neutral', sentimentScore: -0.1 },
          { dir: 'outbound', content: 'Hemos verificado el error en nuestro sistema. El código VERANO2024 no se aplicó correctamente debido a un problema técnico. Procederemos a reembolsarte los €100 de diferencia en los próximos 3 días.', minsAgo: 21 * 1440 },
          { dir: 'inbound', content: 'Gracias por solucionarlo tan rápido.', minsAgo: 20 * 1440, sentiment: 'positive', sentimentScore: 0.55 },
        ],
      },
      {
        conversationIdx: 4,
        messages: [
          { dir: 'inbound', content: 'Mi pedido SHOP-#50005 lleva 8 días sin moverse según el tracking. ¿Qué está pasando?', minsAgo: 21 * 1440, sentiment: 'negative', sentimentScore: -0.5 },
          { dir: 'outbound', content: 'Hola Carlos, disculpa las molestias. Vamos a contactar urgentemente con GLS para localizar tu paquete. Te actualizaremos en máximo 24h.', minsAgo: 21 * 1440 - 120 },
          { dir: 'inbound', content: 'Han pasado 24h y no tengo noticias. ¿Qué está pasando?', minsAgo: 20 * 1440, sentiment: 'very_negative', sentimentScore: -0.8 },
          { dir: 'outbound', content: 'Pedimos disculpas por el retraso en responderte. El carrier ha confirmado que el paquete fue extraviado en el hub de clasificación. Te ofrecemos dos opciones: reenvío urgente sin coste o reembolso completo. ¿Cuál prefieres?', minsAgo: 19 * 1440 },
          { dir: 'inbound', content: 'Prefiero el reembolso. Ya no me hace falta el producto.', minsAgo: 18 * 1440, sentiment: 'negative', sentimentScore: -0.35 },
          { dir: 'outbound', content: 'Procesaremos el reembolso de €780 en los próximos 3-5 días hábiles. Recibirás confirmación por email. Sentimos mucho los inconvenientes.', minsAgo: 17 * 1440 },
        ],
      },
      {
        conversationIdx: 5,
        messages: [
          { dir: 'inbound', content: 'Hola, ¿qué talla me recomendáis para una persona que mide 1,75 y pesa 75kg?', minsAgo: 15 * 1440, sentiment: 'neutral', sentimentScore: 0.1 },
          { dir: 'outbound', content: 'Hola Miguel, para tu complexión te recomendamos una talla M en la mayoría de nuestras colecciones. Si el producto que te interesa tiene una guía de tallas específica, podemos revisarla contigo.', minsAgo: 15 * 1440 - 45 },
          { dir: 'inbound', content: 'Me interesa la camisa de lino de El Corte Inglés. ¿Corre grande o pequeña?', minsAgo: 14 * 1440, sentiment: 'neutral', sentimentScore: 0.15 },
          { dir: 'outbound', content: 'Esa camisa en concreto tiende a correr ligeramente grande. Te recomendamos pedir una talla S o ceñirte a la M si prefieres un fit más holgado.', minsAgo: 13 * 1440 },
          { dir: 'inbound', content: 'Perfecto, gracias por la ayuda.', minsAgo: 12 * 1440, sentiment: 'positive', sentimentScore: 0.7 },
        ],
      },
      {
        conversationIdx: 6,
        messages: [
          { dir: 'inbound', content: 'Me habéis bloqueado la cuenta sin previo aviso. He intentado hacer un pedido y me dice que mi cuenta está suspendida. ¿Por qué?', minsAgo: 18 * 1440, sentiment: 'very_negative', sentimentScore: -0.85 },
          { dir: 'outbound', content: 'Hola, hemos detectado actividad inusual en tu cuenta que activó nuestros sistemas de protección antifraude. Por seguridad, hemos suspendido temporalmente el acceso. ¿Puedes verificar tu identidad respondiendo a unas preguntas de seguridad?', minsAgo: 18 * 1440 - 30 },
          { dir: 'inbound', content: '¿Qué tipo de preguntas? Esto me parece una tomadura de pelo.', minsAgo: 17 * 1440, sentiment: 'negative', sentimentScore: -0.7 },
          { dir: 'outbound', content: 'Entendemos tu molestia. Las preguntas son sobre tu último pedido y los últimos 4 dígitos de la tarjeta con la que compraste. Es un proceso estándar de seguridad para proteger tu cuenta.', minsAgo: 16 * 1440 },
          { dir: 'inbound', content: 'Nunca he hecho tres pedidos con diferentes direcciones. Alguien debe haber accedido a mi cuenta.', minsAgo: 15 * 1440, sentiment: 'negative', sentimentScore: -0.6 },
          { dir: 'outbound', content: 'Gracias por confirmarlo. Hemos bloqueado los pedidos fraudulentos y estamos investigando el acceso no autorizado. Te enviaremos un enlace seguro para restablecer tu contraseña y activar la verificación en dos pasos.', minsAgo: 14 * 1440 },
        ],
      },
      {
        conversationIdx: 7,
        messages: [
          { dir: 'inbound', content: 'Me habéis denegado el reembolso sin explicación. Llevo esperando una semana y nadie me responde.', minsAgo: 14 * 1440, sentiment: 'very_negative', sentimentScore: -0.9 },
          { dir: 'outbound', content: 'Hola Javier, lamentamos la falta de comunicación. Vamos a revisar el estado de tu solicitud de reembolso ahora mismo.', minsAgo: 14 * 1440 - 60 },
          { dir: 'inbound', content: 'Ya he contactado con mi banco. Si no me respondéis hoy, abro un chargeback.', minsAgo: 13 * 1440, sentiment: 'very_negative', sentimentScore: -0.92 },
          { dir: 'outbound', content: 'Javier, hemos revisado tu caso. La solicitud estaba pendiente de aprobación por el volumen del reembolso. Lo hemos escalado a nuestro supervisor para resolución urgente.', minsAgo: 12 * 1440 },
          { dir: 'inbound', content: 'Espero respuesta antes de las 17:00 de hoy.', minsAgo: 11 * 1440, sentiment: 'negative', sentimentScore: -0.65 },
        ],
      },
      {
        conversationIdx: 8,
        messages: [
          { dir: 'inbound', content: 'Esto es la segunda vez que abro una disputa con vosotros. El pedido no llegó y nadie me ha compensado.', minsAgo: 12 * 1440, sentiment: 'very_negative', sentimentScore: -0.88 },
          { dir: 'outbound', content: 'Hola Javier, lamentamos que estés teniendo esta experiencia. Vamos a revisar ambos casos en detalle para entender qué ocurrió.', minsAgo: 12 * 1440 - 45 },
          { dir: 'inbound', content: 'La primera vez tampoco me devolvisteis el dinero a tiempo. Esto es inaceptable.', minsAgo: 11 * 1440, sentiment: 'very_negative', sentimentScore: -0.95 },
          { dir: 'outbound', content: 'Comprendemos tu frustración. Hemos escalado ambos casos al equipo de gestión de disputas. Te contactarán en las próximas 2 horas.', minsAgo: 10 * 1440 },
          { dir: 'inbound', content: 'Más os vale. Voy a dejar una reseña en Trustpilot también.', minsAgo: 9 * 1440, sentiment: 'very_negative', sentimentScore: -0.85 },
        ],
      },
      {
        conversationIdx: 9,
        messages: [
          { dir: 'inbound', content: 'Hola, he recibido un abrigo que en la descripción incluía un cinturón coordinado pero no venía en la caja.', minsAgo: 10 * 1440, sentiment: 'negative', sentimentScore: -0.45 },
          { dir: 'outbound', content: 'Hola Javier, disculpa el inconveniente. Vamos a verificar con el almacén si el cinturón fue omitido durante el embalaje.', minsAgo: 10 * 1440 - 30 },
          { dir: 'inbound', content: '¿Y mientras tanto? ¿Tengo que esperar semanas para tener el producto completo que pagué?', minsAgo: 9 * 1440, sentiment: 'negative', sentimentScore: -0.6 },
          { dir: 'outbound', content: 'Confirmaremos en 24h. Si efectivamente fue un error de embalaje, te enviaremos el cinturón por mensajería urgente sin coste adicional.', minsAgo: 8 * 1440 },
          { dir: 'inbound', content: 'De acuerdo, espero vuestra confirmación.', minsAgo: 7 * 1440, sentiment: 'neutral', sentimentScore: -0.05 },
        ],
      },
      {
        conversationIdx: 10,
        messages: [
          { dir: 'inbound', content: 'Me habéis cobrado dos veces el mismo pedido. En mi tarjeta aparecen dos cargos de €670 del mismo día.', minsAgo: 8 * 1440, sentiment: 'negative', sentimentScore: -0.7 },
          { dir: 'outbound', content: 'Hola Laura, esto es muy inusual. Vamos a revisar inmediatamente los registros de pago para verificar si se produjo un doble cargo.', minsAgo: 8 * 1440 - 20 },
          { dir: 'inbound', content: 'Os envío captura de pantalla del extracto bancario.', minsAgo: 7 * 1440, sentiment: 'neutral', sentimentScore: -0.1 },
          { dir: 'outbound', content: 'Hemos confirmado el doble cargo en nuestros sistemas. Ha sido un error técnico de nuestra pasarela de pago. Procederemos a reembolsar inmediatamente los €670 duplicados.', minsAgo: 6 * 1440 },
          { dir: 'inbound', content: '¿Cuánto tarda en verse en el banco?', minsAgo: 5 * 1440, sentiment: 'neutral', sentimentScore: 0.05 },
          { dir: 'outbound', content: 'Depende del banco, normalmente entre 3 y 10 días hábiles. El reembolso ya está procesado por nuestra parte.', minsAgo: 4 * 1440 },
          { dir: 'inbound', content: 'Gracias por resolverlo rápido.', minsAgo: 3 * 1440, sentiment: 'positive', sentimentScore: 0.6 },
        ],
      },
      {
        conversationIdx: 11,
        messages: [
          { dir: 'inbound', content: 'Buenas tardes, somos Distribuciones Martín SL. Nuestro pedido de reposición para esta semana lleva 3 días de retraso y necesitamos confirmación urgente de la nueva fecha de entrega.', minsAgo: 6 * 1440, sentiment: 'neutral', sentimentScore: -0.2 },
          { dir: 'outbound', content: 'Buenas tardes, lamentamos el retraso. Estamos coordinando con el equipo logístico para obtener la fecha exacta de entrega. ¿Nos podéis confirmar el número de pedido?', minsAgo: 6 * 1440 - 30 },
          { dir: 'inbound', content: 'Es el SHOP-#50014. Lo necesitamos para el jueves como muy tarde o tendremos un problema de stock.', minsAgo: 5 * 1440, sentiment: 'negative', sentimentScore: -0.4 },
          { dir: 'outbound', content: 'Hemos escalado la consulta al equipo de logística B2B. El pedido está en tránsito y confirman entrega para el miércoles antes de las 14:00.', minsAgo: 4 * 1440 },
          { dir: 'inbound', content: 'Perfecto, gracias por la confirmación. ¿Podéis enviarla también por email?', minsAgo: 3 * 1440, sentiment: 'neutral', sentimentScore: 0.2 },
          { dir: 'outbound', content: 'Por supuesto, os enviamos el email de confirmación ahora mismo con el número de seguimiento actualizado.', minsAgo: 2 * 1440 },
        ],
      },
    ];

    for (const { conversationIdx, messages } of messageData) {
      const convId = convIds[conversationIdx];
      const caseForConv = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 17];
      const caseIdx = caseForConv[conversationIdx];
      const custId = caseCustomers[caseIdx];

      const msgRows = messages.map((m, mi) => ({
        id: `seed-msg-${conversationIdx + 1}-${mi + 1}-${stub}`,
        conversation_id: convId,
        case_id: caseIds[caseIdx],
        customer_id: custId,
        type: m.dir === 'inbound' ? 'customer' : 'agent',
        direction: m.dir,
        sender_id: m.dir === 'inbound' ? custId : ownerUserId,
        sender_name: m.dir === 'inbound' ? ['Elena Martínez', 'Carlos Rodríguez', 'Carlos Rodríguez', 'Carlos Rodríguez', 'Carlos Rodríguez', 'Miguel Torres', 'Javier López', 'Javier López', 'Javier López', 'Javier López', 'Laura Sánchez', 'Distribuciones Martín SL'][conversationIdx] : 'Customer Care',
        content: m.content,
        content_type: 'text',
        channel: ['email', 'whatsapp', 'chat', 'phone', 'email', 'chat', 'whatsapp', 'email', 'phone', 'chat', 'email', 'whatsapp'][conversationIdx],
        external_message_id: `ext-msg-${conversationIdx + 1}-${mi + 1}-${stub}`,
        sentiment: m.sentiment || 'neutral',
        sentiment_score: m.sentimentScore ?? 0,
        attachments: JSON.stringify([]),
        sent_at: isoMinutesAgo(m.minsAgo),
        created_at: isoMinutesAgo(m.minsAgo),
        delivered_at: isoMinutesAgo(m.minsAgo),
        tenant_id: tenantId,
      }));

      const { error } = await supabase.from('messages').insert(msgRows);
      if (error) logger.warn(`bigSeed: messages conv${conversationIdx + 1} insert failed`, { error: error.message });
    }
  }

  // ── 10. Internal Notes (12) ───────────────────────────────────────────────────
  {
    const notes = [
      'Cliente VIP con historial de 3 chargebacks previos. Escalar a manager antes de procesar cualquier reembolso > €500. Registrar todas las comunicaciones.',
      'Defecto de fábrica confirmado con fotos. Coordinar con proveedor para reclamación. Reenvío aprobado sin necesidad de inspección.',
      'Chargeback activo en Stripe. No procesar reembolso voluntario simultáneo. Plazo de respuesta: 7 días desde apertura (vence el próximo martes).',
      'Error de pricing confirmado por el equipo técnico. Bug en la aplicación de cupones simultáneos. Ya reportado a desarrollo.',
      'Carrier confirmó extravío en hub de clasificación. Reclamación de seguro enviada (pedido > €500). Reembolso aprobado por supervisor.',
      'Consulta informativa resuelta. Sin acción adicional requerida. Cerrar caso tras confirmación del cliente.',
      'Cuenta bloqueada por seguridad. Investigación de fraude en curso. No desbloquear sin validación del equipo de seguridad.',
      'Cliente con historial de alto riesgo. Cuarta solicitud de reembolso en 6 meses. Requiere validación adicional antes de aprobar.',
      'Segundo chargeback del mismo cliente en 30 días. Consultar con compliance si procede bloqueo definitivo de cuenta.',
      'Error de embalaje en almacén. Reportado al equipo de calidad. Cinturón enviado por mensajería urgente (DHL, salida hoy).',
      'Doble cargo confirmado — bug en el sistema de retry de pagos de Redsys. Ya reportado a finanzas. Reembolso procesado sin necesidad de aprobación.',
      'Cliente B2B prioritario. SLA especial: respuesta < 2h, entrega confirmada por logística B2B. Mantener comunicación proactiva.',
    ];

    const noteRows = notes.map((content, i) => ({
      id: `seed-note-${i + 1}-${stub}`,
      case_id: caseIds[[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 17][i]],
      content,
      created_by: ownerUserId,
      created_by_type: 'human',
      created_at: isoDaysAgo(28 - i * 2),
      tenant_id: tenantId,
      workspace_id: workspaceId,
    }));

    const { error } = await supabase.from('internal_notes').insert(noteRows);
    if (error) logger.warn('bigSeed: internal_notes insert failed', { error: error.message });
  }

  // ── 11. Approval requests (5 pending) ────────────────────────────────────────
  const approvalIds = Array.from({ length: 5 }, (_, i) => `seed-appr-${i + 1}-${stub}`);
  {
    const approvalData = [
      { caseIdx: 0,  custId: custVip1,  amount: 890,  type: 'refund_payment',        riskLevel: 'high',   desc: 'Reembolso artículo dañado — cliente VIP con chargeback activo' },
      { caseIdx: 2,  custId: custVip2,  amount: 2200, type: 'chargeback_concession',  riskLevel: 'high',   desc: 'Concesión chargeback €2.200 — requiere aprobación manager' },
      { caseIdx: 7,  custId: custRisk1, amount: 560,  type: 'refund_payment',        riskLevel: 'critical', desc: 'Reembolso cliente de alto riesgo — 4 chargebacks previos' },
      { caseIdx: 11, custId: custRisk2, amount: 4200, type: 'exception',             riskLevel: 'critical', desc: 'Excepción de política — cliente con flag de fraude activo' },
      { caseIdx: 17, custId: custCorp1, amount: 4500, type: 'credit',               riskLevel: 'medium',  desc: 'Crédito B2B por retraso logístico — contrato empresarial' },
    ];

    const rows = approvalIds.map((id, i) => ({
      id,
      case_id: caseIds[approvalData[i].caseIdx],
      tenant_id: tenantId,
      workspace_id: workspaceId,
      requested_by: 'system',
      requested_by_type: 'agent',
      action_type: approvalData[i].type,
      action_payload: JSON.stringify({
        amount: approvalData[i].amount,
        currency: 'EUR',
        customer_id: approvalData[i].custId,
        reason: approvalData[i].desc,
      }),
      risk_level: approvalData[i].riskLevel,
      evidence_package: JSON.stringify({ summary: approvalData[i].desc }),
      status: 'pending',
      assigned_to: ownerUserId,
      decision_at: null,
      decision_note: null,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      created_at: isoDaysAgo(i + 1),
      updated_at: isoDaysAgo(i + 1),
    }));

    const { error } = await supabase.from('approval_requests').insert(rows);
    if (error) logger.warn('bigSeed: approval_requests insert failed', { error: error.message });
  }

  // Patch cases with approval IDs
  {
    const approvalData = [
      { caseIdx: 0,  approvalIdx: 0 },
      { caseIdx: 2,  approvalIdx: 1 },
      { caseIdx: 7,  approvalIdx: 2 },
      { caseIdx: 11, approvalIdx: 3 },
      { caseIdx: 17, approvalIdx: 4 },
    ];
    for (const { caseIdx, approvalIdx } of approvalData) {
      const { error } = await supabase
        .from('cases')
        .update({ active_approval_request_id: approvalIds[approvalIdx] })
        .eq('id', caseIds[caseIdx])
        .eq('tenant_id', tenantId);
      if (error) logger.warn(`bigSeed: case approval patch ${caseIdx} failed`, { error: error.message });
    }
  }

  // ── 12. CSAT surveys (10) ─────────────────────────────────────────────────────
  {
    const csatData = [
      { caseIdx: 1, custId: custVip2,  rating: 5, comment: 'Excelente atención, resolvieron mi problema muy rápido.', channel: 'email' },
      { caseIdx: 3, custId: custVip2,  rating: 4, comment: 'Bien resuelto, aunque tardaron un día más de lo esperado.', channel: 'chat' },
      { caseIdx: 4, custId: custVip2,  rating: 2, comment: 'El paquete se perdió y tardaron demasiado en gestionarlo.', channel: 'email' },
      { caseIdx: 5, custId: custReg1,  rating: 5, comment: 'Muy amables y resolutivos. Recomendable.', channel: 'chat' },
      { caseIdx: 9, custId: custRisk1, rating: 1, comment: 'Pésimo servicio. Nadie responde. Una semana esperando.', channel: 'whatsapp' },
      { caseIdx: 12, custId: custReg1, rating: 3, comment: 'Correcto pero podría ser más rápido.', channel: 'email' },
      { caseIdx: 13, custId: custReg1, rating: 5, comment: 'Perfecto, sin incidencias.', channel: 'email' },
      { caseIdx: 14, custId: custReg2, rating: 4, comment: 'Bien gestionado en general.', channel: 'chat' },
      { caseIdx: 15, custId: custReg2, rating: 2, comment: 'Tuvieron que llamarme dos veces para pedir la misma información.', channel: 'phone' },
      { caseIdx: 19, custId: custNew1, rating: 5, comment: 'Primera experiencia muy positiva, muy bien atendido.', channel: 'chat' },
    ];

    const rows = csatData.map((d, i) => ({
      id: `seed-csat-${i + 1}-${stub}`,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      contact_id: d.custId,
      rating: d.rating,
      feedback_message: d.comment,
      created_at: isoDaysAgo(25 - i * 2),
    }));

    const { error } = await supabase.from('csat_survey_responses').insert(rows);
    if (error) logger.warn('bigSeed: csat_survey_responses insert failed (non-fatal)', { error: error.message });
  }

  // ── 13. Audit events (30) ─────────────────────────────────────────────────────
  {
    const auditRows = [
      // Case creations
      ...caseIds.slice(0, 10).map((id, i) => ({
        id: randomUUID(),
        tenant_id: tenantId,
        workspace_id: workspaceId,
        actor_id: 'system',
        actor_type: 'system',
        action: 'CASE_CREATED',
        entity_type: 'case',
        entity_id: id,
        metadata: { source: ['gmail', 'whatsapp', 'chat', 'phone'][i % 4], big_seed: true },
        occurred_at: isoDaysAgo(30 - i),
      })),
      // AI diagnoses
      ...caseIds.slice(0, 5).map((id, i) => ({
        id: randomUUID(),
        tenant_id: tenantId,
        workspace_id: workspaceId,
        actor_id: 'system',
        actor_type: 'agent',
        action: 'AGENT_DIAGNOSIS',
        entity_type: 'case',
        entity_id: id,
        metadata: { confidence: 0.72 + i * 0.05, big_seed: true },
        occurred_at: isoDaysAgo(29 - i),
      })),
      // Approval requests
      ...approvalIds.map((id, i) => ({
        id: randomUUID(),
        tenant_id: tenantId,
        workspace_id: workspaceId,
        actor_id: 'system',
        actor_type: 'agent',
        action: 'APPROVAL_REQUESTED',
        entity_type: 'approval',
        entity_id: id,
        metadata: { big_seed: true },
        occurred_at: isoDaysAgo(i + 1),
      })),
      // Status changes
      { id: randomUUID(), tenant_id: tenantId, workspace_id: workspaceId, actor_id: ownerUserId, actor_type: 'human', action: 'CASE_ESCALATED', entity_type: 'case', entity_id: caseIds[2], metadata: { reason: 'chargeback_open', big_seed: true }, occurred_at: isoDaysAgo(22) },
      { id: randomUUID(), tenant_id: tenantId, workspace_id: workspaceId, actor_id: ownerUserId, actor_type: 'human', action: 'CASE_ESCALATED', entity_type: 'case', entity_id: caseIds[8], metadata: { reason: 'repeat_chargeback', big_seed: true }, occurred_at: isoDaysAgo(15) },
      { id: randomUUID(), tenant_id: tenantId, workspace_id: workspaceId, actor_id: ownerUserId, actor_type: 'human', action: 'CASE_RESOLVED', entity_type: 'case', entity_id: caseIds[5], metadata: { big_seed: true }, occurred_at: isoDaysAgo(10) },
      { id: randomUUID(), tenant_id: tenantId, workspace_id: workspaceId, actor_id: ownerUserId, actor_type: 'human', action: 'CASE_CLOSED',    entity_type: 'case', entity_id: caseIds[6], metadata: { big_seed: true }, occurred_at: isoDaysAgo(8) },
      { id: randomUUID(), tenant_id: tenantId, workspace_id: workspaceId, actor_id: ownerUserId, actor_type: 'human', action: 'CASE_RESOLVED', entity_type: 'case', entity_id: caseIds[13], metadata: { big_seed: true }, occurred_at: isoDaysAgo(6) },
      { id: randomUUID(), tenant_id: tenantId, workspace_id: workspaceId, actor_id: ownerUserId, actor_type: 'human', action: 'CASE_CLOSED',    entity_type: 'case', entity_id: caseIds[14], metadata: { big_seed: true }, occurred_at: isoDaysAgo(5) },
      // Fraud review actions
      { id: randomUUID(), tenant_id: tenantId, workspace_id: workspaceId, actor_id: ownerUserId, actor_type: 'human', action: 'ACCOUNT_SUSPENDED', entity_type: 'customer', entity_id: custRisk2, metadata: { reason: 'fraud_flag', big_seed: true }, occurred_at: isoDaysAgo(4) },
    ];

    const { error } = await supabase.from('audit_events').insert(auditRows);
    if (error) logger.warn('bigSeed: audit_events insert failed (non-fatal)', { error: error.message });
  }

  // ── 14. Notifications (8 unread) ─────────────────────────────────────────────
  {
    const notifRows = [
      { type: 'sla_breach',            title: 'SLA incumplido — SEED-0001', body: 'El caso SEED-0001 de Elena Martínez ha superado el plazo de primera respuesta.', entity_type: 'case', entity_id: caseIds[0] },
      { type: 'sla_breach',            title: 'SLA en riesgo — SEED-0005',  body: 'El caso SEED-0005 de Carlos Rodríguez está a 1 hora de incumplir el SLA.', entity_type: 'case', entity_id: caseIds[4] },
      { type: 'assignment',            title: 'Nuevo caso asignado — SEED-0017', body: 'Se te ha asignado el caso SEED-0017 de Laura Sánchez.', entity_type: 'case', entity_id: caseIds[16] },
      { type: 'mention',               title: 'Te han mencionado en SEED-0008', body: 'El supervisor te ha mencionado en la nota interna del caso SEED-0008.', entity_type: 'case', entity_id: caseIds[7] },
      { type: 'new_message',           title: 'Nuevo mensaje — Javier López', body: 'Javier López ha enviado un mensaje en el caso SEED-0008 hace 2 minutos.', entity_type: 'conversation', entity_id: convIds[7] },
      { type: 'automation_triggered',  title: 'Regla de automatización activada', body: 'La regla "Escalar casos con chargeback + alto riesgo" se ha ejecutado en SEED-0003.', entity_type: 'case', entity_id: caseIds[2] },
      { type: 'csat_received',         title: 'Nueva encuesta CSAT recibida', body: 'Ana García ha valorado su experiencia con 1/5 estrellas.', entity_type: 'case', entity_id: caseIds[9] },
      { type: 'assignment',            title: 'Aprobación pendiente de revisión', body: 'Hay 5 solicitudes de aprobación pendientes de tu revisión.', entity_type: 'approval', entity_id: approvalIds[0] },
    ];

    const rows = notifRows.map((n, i) => ({
      id: `seed-notif-${i + 1}-${stub}`,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      user_id: ownerUserId,
      notification_type: n.type,
      title: n.title,
      body: n.body,
      read: false,
      entity_type: n.entity_type,
      entity_id: n.entity_id,
      created_at: isoDaysAgo(i % 3 === 0 ? 1 : 0),
    }));

    const { error } = await supabase.from('notifications').insert(rows);
    if (error) logger.warn('bigSeed: notifications insert failed (non-fatal)', { error: error.message });
  }

  // ── 15. Case status history ───────────────────────────────────────────────────
  {
    const historyRows = [
      { id: randomUUID(), case_id: caseIds[0],  from_status: 'new', to_status: 'open',      changed_by: 'system', changed_by_type: 'system', reason: 'auto_open_on_message', created_at: isoDaysAgo(29), tenant_id: tenantId },
      { id: randomUUID(), case_id: caseIds[2],  from_status: 'new', to_status: 'open',      changed_by: 'system', changed_by_type: 'system', created_at: isoDaysAgo(25), tenant_id: tenantId },
      { id: randomUUID(), case_id: caseIds[2],  from_status: 'open', to_status: 'escalated', changed_by: ownerUserId, changed_by_type: 'human', reason: 'chargeback_open', created_at: isoDaysAgo(22), tenant_id: tenantId },
      { id: randomUUID(), case_id: caseIds[5],  from_status: 'new', to_status: 'open',      changed_by: 'system', changed_by_type: 'system', created_at: isoDaysAgo(24), tenant_id: tenantId },
      { id: randomUUID(), case_id: caseIds[5],  from_status: 'open', to_status: 'resolved',  changed_by: ownerUserId, changed_by_type: 'human', created_at: isoDaysAgo(10), tenant_id: tenantId },
      { id: randomUUID(), case_id: caseIds[6],  from_status: 'new', to_status: 'open',      changed_by: 'system', changed_by_type: 'system', created_at: isoDaysAgo(23), tenant_id: tenantId },
      { id: randomUUID(), case_id: caseIds[6],  from_status: 'open', to_status: 'closed',    changed_by: ownerUserId, changed_by_type: 'human', created_at: isoDaysAgo(8), tenant_id: tenantId },
      { id: randomUUID(), case_id: caseIds[8],  from_status: 'new', to_status: 'open',      changed_by: 'system', changed_by_type: 'system', created_at: isoDaysAgo(22), tenant_id: tenantId },
      { id: randomUUID(), case_id: caseIds[8],  from_status: 'open', to_status: 'escalated', changed_by: ownerUserId, changed_by_type: 'human', reason: 'repeat_chargeback', created_at: isoDaysAgo(15), tenant_id: tenantId },
      { id: randomUUID(), case_id: caseIds[13], from_status: 'new', to_status: 'open',      changed_by: 'system', changed_by_type: 'system', created_at: isoDaysAgo(17), tenant_id: tenantId },
      { id: randomUUID(), case_id: caseIds[13], from_status: 'open', to_status: 'resolved',  changed_by: ownerUserId, changed_by_type: 'human', created_at: isoDaysAgo(6), tenant_id: tenantId },
      { id: randomUUID(), case_id: caseIds[14], from_status: 'new', to_status: 'open',      changed_by: 'system', changed_by_type: 'system', created_at: isoDaysAgo(16), tenant_id: tenantId },
      { id: randomUUID(), case_id: caseIds[14], from_status: 'open', to_status: 'resolved',  changed_by: ownerUserId, changed_by_type: 'human', created_at: isoDaysAgo(5), tenant_id: tenantId },
      { id: randomUUID(), case_id: caseIds[14], from_status: 'resolved', to_status: 'closed', changed_by: ownerUserId, changed_by_type: 'human', created_at: isoDaysAgo(5), tenant_id: tenantId },
    ];

    const { error } = await supabase.from('case_status_history').insert(historyRows);
    if (error) logger.warn('bigSeed: case_status_history insert failed (non-fatal)', { error: error.message });
  }

  // ── 16. Linked identities (2-4 per customer) ─────────────────────────────────
  {
    const identityRows = [
      // Elena Martínez (custVip1)
      { id: `seed-li-v1-shop-${stub}`, customer_id: custVip1, tenant_id: tenantId, workspace_id: workspaceId, system: 'shopify', external_id: `shopify_cust_vip1_${stub}`, confidence: 1.0, verified: true, verified_at: isoDaysAgo(740), created_at: isoDaysAgo(740) },
      { id: `seed-li-v1-stripe-${stub}`, customer_id: custVip1, tenant_id: tenantId, workspace_id: workspaceId, system: 'stripe', external_id: `cus_VIP1Elena${stub}`, confidence: 1.0, verified: true, verified_at: isoDaysAgo(740), created_at: isoDaysAgo(740) },
      { id: `seed-li-v1-gmail-${stub}`, customer_id: custVip1, tenant_id: tenantId, workspace_id: workspaceId, system: 'gmail', external_id: 'elena.martinez@example.com', confidence: 0.98, verified: true, verified_at: isoDaysAgo(700), created_at: isoDaysAgo(700) },
      // Carlos Rodríguez (custVip2)
      { id: `seed-li-v2-shop-${stub}`, customer_id: custVip2, tenant_id: tenantId, workspace_id: workspaceId, system: 'shopify', external_id: `shopify_cust_vip2_${stub}`, confidence: 1.0, verified: true, verified_at: isoDaysAgo(920), created_at: isoDaysAgo(920) },
      { id: `seed-li-v2-stripe-${stub}`, customer_id: custVip2, tenant_id: tenantId, workspace_id: workspaceId, system: 'stripe', external_id: `cus_VIP2Carlos${stub}`, confidence: 1.0, verified: true, verified_at: isoDaysAgo(920), created_at: isoDaysAgo(920) },
      { id: `seed-li-v2-wa-${stub}`, customer_id: custVip2, tenant_id: tenantId, workspace_id: workspaceId, system: 'whatsapp', external_id: '+34622200002', confidence: 0.95, verified: true, verified_at: isoDaysAgo(800), created_at: isoDaysAgo(800) },
      { id: `seed-li-v2-gmail-${stub}`, customer_id: custVip2, tenant_id: tenantId, workspace_id: workspaceId, system: 'gmail', external_id: 'carlos.rodriguez@example.com', confidence: 0.97, verified: true, verified_at: isoDaysAgo(850), created_at: isoDaysAgo(850) },
      // Javier López (custRisk1)
      { id: `seed-li-r1-shop-${stub}`, customer_id: custRisk1, tenant_id: tenantId, workspace_id: workspaceId, system: 'shopify', external_id: `shopify_cust_risk1_${stub}`, confidence: 1.0, verified: true, verified_at: isoDaysAgo(360), created_at: isoDaysAgo(360) },
      { id: `seed-li-r1-paypal-${stub}`, customer_id: custRisk1, tenant_id: tenantId, workspace_id: workspaceId, system: 'paypal', external_id: `paypal_risk1_${stub}`, confidence: 0.90, verified: false, verified_at: null, created_at: isoDaysAgo(200) },
      // Ana García (custRisk2)
      { id: `seed-li-r2-shop-${stub}`, customer_id: custRisk2, tenant_id: tenantId, workspace_id: workspaceId, system: 'shopify', external_id: `shopify_cust_risk2_${stub}`, confidence: 1.0, verified: true, verified_at: isoDaysAgo(180), created_at: isoDaysAgo(180) },
      { id: `seed-li-r2-stripe-${stub}`, customer_id: custRisk2, tenant_id: tenantId, workspace_id: workspaceId, system: 'stripe', external_id: `cus_Risk2Ana${stub}`, confidence: 0.85, verified: false, verified_at: null, created_at: isoDaysAgo(120) },
      // Miguel Torres (custReg1)
      { id: `seed-li-g1-shop-${stub}`, customer_id: custReg1, tenant_id: tenantId, workspace_id: workspaceId, system: 'shopify', external_id: `shopify_cust_reg1_${stub}`, confidence: 1.0, verified: true, verified_at: isoDaysAgo(520), created_at: isoDaysAgo(520) },
      { id: `seed-li-g1-gmail-${stub}`, customer_id: custReg1, tenant_id: tenantId, workspace_id: workspaceId, system: 'gmail', external_id: 'miguel.torres@example.com', confidence: 0.97, verified: true, verified_at: isoDaysAgo(500), created_at: isoDaysAgo(500) },
      // Laura Sánchez (custReg2)
      { id: `seed-li-g2-shop-${stub}`, customer_id: custReg2, tenant_id: tenantId, workspace_id: workspaceId, system: 'shopify', external_id: `shopify_cust_reg2_${stub}`, confidence: 1.0, verified: true, verified_at: isoDaysAgo(400), created_at: isoDaysAgo(400) },
      { id: `seed-li-g2-stripe-${stub}`, customer_id: custReg2, tenant_id: tenantId, workspace_id: workspaceId, system: 'stripe', external_id: `cus_Reg2Laura${stub}`, confidence: 1.0, verified: true, verified_at: isoDaysAgo(400), created_at: isoDaysAgo(400) },
      // Distribuciones Martín SL (custCorp1)
      { id: `seed-li-c1-shop-${stub}`, customer_id: custCorp1, tenant_id: tenantId, workspace_id: workspaceId, system: 'shopify', external_id: `shopify_cust_corp1_${stub}`, confidence: 1.0, verified: true, verified_at: isoDaysAgo(1100), created_at: isoDaysAgo(1100) },
      { id: `seed-li-c1-stripe-${stub}`, customer_id: custCorp1, tenant_id: tenantId, workspace_id: workspaceId, system: 'stripe', external_id: `cus_Corp1Martin${stub}`, confidence: 1.0, verified: true, verified_at: isoDaysAgo(1100), created_at: isoDaysAgo(1100) },
      { id: `seed-li-c1-redsys-${stub}`, customer_id: custCorp1, tenant_id: tenantId, workspace_id: workspaceId, system: 'redsys', external_id: `redsys_corp1_${stub}`, confidence: 0.98, verified: true, verified_at: isoDaysAgo(900), created_at: isoDaysAgo(900) },
      // Pedro Fernández (custNew1)
      { id: `seed-li-n1-shop-${stub}`, customer_id: custNew1, tenant_id: tenantId, workspace_id: workspaceId, system: 'shopify', external_id: `shopify_cust_new1_${stub}`, confidence: 1.0, verified: true, verified_at: isoDaysAgo(7), created_at: isoDaysAgo(7) },
    ];

    const { error } = await supabase.from('linked_identities').insert(identityRows);
    if (error) logger.warn('bigSeed: linked_identities insert failed (non-fatal)', { error: error.message });
  }

  logger.info('bigSeed: completed', {
    tenantId,
    workspaceId,
    counts: {
      customers: 8,
      companies: 3,
      orders: 15,
      payments: 15,
      returns: 6,
      knowledge_domains: 3,
      knowledge_articles: 8,
      cases: 20,
      conversations: 12,
      messages: '~60',
      internal_notes: 12,
      approval_requests: 5,
      csat_surveys: 10,
      audit_events: 30,
      notifications: 8,
      case_status_history: 14,
      linked_identities: 19,
    },
  });
}

/**
 * Best-effort cleanup — deletes all rows planted by seedBigDataset for this workspace.
 */
export async function deleteBigSeed(tenantId: string, workspaceId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const stub = workspaceId.slice(0, 8);

  // Delete by customer_id / entity_id first (no own-id filter)
  const customerIds = [
    `seed-cust-vip1-${stub}`,
    `seed-cust-vip2-${stub}`,
    `seed-cust-risk1-${stub}`,
    `seed-cust-risk2-${stub}`,
    `seed-cust-reg1-${stub}`,
    `seed-cust-reg2-${stub}`,
    `seed-cust-new1-${stub}`,
    `seed-cust-corp1-${stub}`,
  ];

  const caseIds = Array.from({ length: 20 }, (_, i) => `seed-case-${i + 1}-${stub}`);
  const approvalIds = Array.from({ length: 5 }, (_, i) => `seed-appr-${i + 1}-${stub}`);
  const convIds = Array.from({ length: 12 }, (_, i) => `seed-conv-${i + 1}-${stub}`);
  const orderIds = Array.from({ length: 15 }, (_, i) => `seed-order-${i + 1}-${stub}`);
  const paymentIds = Array.from({ length: 15 }, (_, i) => `seed-pay-${i + 1}-${stub}`);
  const returnIds = Array.from({ length: 6 }, (_, i) => `seed-ret-${i + 1}-${stub}`);
  const articleIds = Array.from({ length: 8 }, (_, i) => `seed-kb-art-${i + 1}-${stub}`);

  // Audit events
  try {
    await supabase.from('audit_events').delete()
      .in('entity_id', [...caseIds, ...approvalIds, ...customerIds])
      .eq('tenant_id', tenantId);
  } catch (err) { logger.warn('bigSeed cleanup: audit_events delete failed', { error: String(err) }); }

  // Notifications
  try {
    const notifIds = Array.from({ length: 8 }, (_, i) => `seed-notif-${i + 1}-${stub}`);
    await supabase.from('notifications').delete().in('id', notifIds).eq('tenant_id', tenantId);
  } catch (err) { logger.warn('bigSeed cleanup: notifications delete failed', { error: String(err) }); }

  // CSAT surveys
  try {
    const csatIds = Array.from({ length: 10 }, (_, i) => `seed-csat-${i + 1}-${stub}`);
    await supabase.from('csat_survey_responses').delete().in('id', csatIds).eq('tenant_id', tenantId);
  } catch (err) { logger.warn('bigSeed cleanup: csat_survey_responses delete failed', { error: String(err) }); }

  // Linked identities
  try {
    await supabase.from('linked_identities').delete().in('customer_id', customerIds).eq('tenant_id', tenantId);
  } catch (err) { logger.warn('bigSeed cleanup: linked_identities delete failed', { error: String(err) }); }

  // Case status history
  try {
    await supabase.from('case_status_history').delete().in('case_id', caseIds).eq('tenant_id', tenantId);
  } catch (err) { logger.warn('bigSeed cleanup: case_status_history delete failed', { error: String(err) }); }

  // Internal notes
  try {
    const noteIds = Array.from({ length: 12 }, (_, i) => `seed-note-${i + 1}-${stub}`);
    await supabase.from('internal_notes').delete().in('id', noteIds).eq('tenant_id', tenantId);
  } catch (err) { logger.warn('bigSeed cleanup: internal_notes delete failed', { error: String(err) }); }

  // Messages (by conversation_id)
  try {
    await supabase.from('messages').delete().in('conversation_id', convIds).eq('tenant_id', tenantId);
  } catch (err) { logger.warn('bigSeed cleanup: messages delete failed', { error: String(err) }); }

  const tablesAndIds: Array<[string, string[]]> = [
    ['approval_requests', approvalIds],
    ['cases', caseIds],
    ['conversations', convIds],
    ['returns', returnIds],
    ['payments', paymentIds],
    ['orders', orderIds],
    ['knowledge_articles', articleIds],
    ['knowledge_domains', [
      `seed-kb-dom-dev-${stub}`,
      `seed-kb-dom-env-${stub}`,
      `seed-kb-dom-fac-${stub}`,
    ]],
    ['companies', [`seed-co-1-${stub}`, `seed-co-2-${stub}`, `seed-co-3-${stub}`]],
    ['customers', customerIds],
  ];

  for (const [table, ids] of tablesAndIds) {
    if (ids.length === 0) continue;
    try {
      await supabase.from(table).delete().in('id', ids).eq('tenant_id', tenantId);
    } catch (err) {
      logger.warn(`bigSeed cleanup: ${table} delete failed`, { error: String(err) });
    }
  }

  logger.info('bigSeed: cleanup completed', { tenantId, workspaceId });
}
