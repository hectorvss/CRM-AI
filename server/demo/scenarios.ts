import type { CanonicalCustomer, CanonicalOrder, CanonicalPayment } from '../integrations/types.js';

export type DemoCommerceWebhook = {
  source: 'shopify' | 'stripe';
  topic: string;
  externalId: string;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
};

export type DemoChannelWebhook = {
  channel: 'whatsapp' | 'email';
  externalId: string;
  payload: Record<string, unknown>;
};

export type DemoScenario = {
  id: string;
  title: string;
  description: string;
  customer: CanonicalCustomer;
  shopifyOrders: CanonicalOrder[];
  stripePayments: CanonicalPayment[];
  commerceWebhooks: DemoCommerceWebhook[];
  channelWebhooks: DemoChannelWebhook[];
};

const now = new Date('2026-04-09T09:00:00.000Z');
const iso = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();
const unix = (minutes: number) => Math.floor(new Date(iso(minutes)).getTime() / 1000);

function customer(
  id: string,
  email: string,
  name: string,
  tags: string[],
  raw: Record<string, unknown> = {},
): CanonicalCustomer {
  return {
    id: `demo_customer_${id}`,
    externalId: `demo_cus_${id}`,
    source: 'shopify',
    fetchedAt: iso(0),
    email,
    phone: (raw.phone as string | undefined) ?? null,
    firstName: name.split(' ')[0] ?? name,
    lastName: name.split(' ').slice(1).join(' ') || null,
    displayName: name,
    tags,
    raw,
  };
}

function order(params: {
  id: string;
  customerId: string;
  status: CanonicalOrder['status'];
  financialStatus: string;
  fulfillmentStatus: string | null;
  total: number;
  tags?: string[];
  createdAt?: string;
}): CanonicalOrder {
  return {
    id: `demo_order_${params.id}`,
    externalId: `demo_ord_${params.id}`,
    source: 'shopify',
    fetchedAt: iso(0),
    externalOrderNumber: `#${params.id}`,
    status: params.status,
    financialStatus: params.financialStatus,
    fulfillmentStatus: params.fulfillmentStatus,
    currency: 'USD',
    totalAmount: params.total,
    subtotal: params.total - 12,
    taxAmount: 7,
    shippingAmount: 5,
    lineItems: [
      {
        externalId: `demo_line_${params.id}_1`,
        title: 'Performance Hoodie',
        sku: 'HOODIE-PERF-BLK',
        quantity: 1,
        unitPrice: params.total - 12,
        totalPrice: params.total - 12,
        currency: 'USD',
      },
    ],
    customerExternalId: `demo_cus_${params.customerId}`,
    shippingAddress: null,
    billingAddress: null,
    tags: params.tags ?? [],
    createdAt: params.createdAt ?? iso(-120),
    updatedAt: iso(-5),
    cancelledAt: null,
    raw: { demo: true, provider: 'shopify_admin' },
  };
}

function payment(params: {
  id: string;
  orderId: string;
  customerId: string;
  status: CanonicalPayment['status'];
  amount: number;
  refunded?: number;
  disputeId?: string | null;
}): CanonicalPayment {
  return {
    id: `demo_payment_${params.id}`,
    externalId: `ch_demo_${params.id}`,
    source: 'stripe',
    fetchedAt: iso(0),
    orderExternalId: `demo_ord_${params.orderId}`,
    customerExternalId: `demo_cus_${params.customerId}`,
    status: params.status,
    amount: params.amount,
    amountRefunded: params.refunded ?? 0,
    currency: 'USD',
    paymentMethod: 'card',
    last4: '4242',
    brand: 'visa',
    hasDispute: Boolean(params.disputeId),
    disputeId: params.disputeId ?? null,
    failureCode: null,
    failureMessage: null,
    createdAt: iso(-119),
    updatedAt: iso(-3),
    raw: { demo: true, provider: 'stripe_api' },
  };
}

function shopifyOrderWebhook(topic: string, order: CanonicalOrder): DemoCommerceWebhook {
  return {
    source: 'shopify',
    topic,
    externalId: order.externalId,
    headers: {
      'x-shopify-topic': topic,
      'x-shopify-shop-domain': 'demo-store.myshopify.com',
    },
    payload: {
      id: Number(order.externalId.replace('demo_ord_', '')),
      admin_graphql_api_id: `gid://shopify/Order/${order.externalId}`,
      name: order.externalOrderNumber,
      email: 'customer@example.com',
      financial_status: order.financialStatus,
      fulfillment_status: order.fulfillmentStatus,
      currency: order.currency,
      total_price: String(order.totalAmount),
      subtotal_price: String(order.subtotal),
      total_tax: String(order.taxAmount),
      total_shipping_price_set: { shop_money: { amount: String(order.shippingAmount), currency_code: order.currency } },
      customer: { id: Number((order.customerExternalId ?? '0').replace('demo_cus_', '')) },
      line_items: order.lineItems.map(item => ({
        id: Number(item.externalId.replace(/\D/g, '')) || 1,
        title: item.title,
        sku: item.sku,
        quantity: item.quantity,
        price: String(item.unitPrice),
        total_discount: '0.00',
      })),
      tags: order.tags.join(', '),
      created_at: order.createdAt,
      updated_at: order.updatedAt,
      cancelled_at: order.cancelledAt,
    },
  };
}

function stripeEvent(type: string, payment: CanonicalPayment, minutes = 0): DemoCommerceWebhook {
  return {
    source: 'stripe',
    topic: type,
    externalId: payment.externalId,
    headers: {
      'stripe-signature': 'demo_signature',
    },
    payload: {
      id: `evt_demo_${type.replace(/\W/g, '_')}_${payment.externalId}`,
      object: 'event',
      api_version: '2024-04-10',
      created: unix(minutes),
      type,
      data: {
        object: {
          id: payment.externalId,
          object: 'charge',
          amount: Math.round(payment.amount * 100),
          amount_refunded: Math.round(payment.amountRefunded * 100),
          currency: payment.currency.toLowerCase(),
          status: payment.status === 'failed' ? 'failed' : 'succeeded',
          disputed: payment.hasDispute,
          dispute: payment.disputeId ? { id: payment.disputeId } : null,
          refunded: payment.status === 'refunded',
          payment_method_details: { type: 'card', card: { last4: payment.last4, brand: payment.brand } },
          metadata: {
            order_id: payment.orderExternalId ?? '',
            customer_id: payment.customerExternalId ?? '',
          },
          created: unix(minutes),
        },
      },
    },
  };
}

function whatsappMessage(id: string, phone: string, name: string, body: string, minutes = 0): DemoChannelWebhook {
  return {
    channel: 'whatsapp',
    externalId: `wamid.demo.${id}`,
    payload: {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'demo_waba_001',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            contacts: [{ wa_id: phone, profile: { name } }],
            messages: [{
              id: `wamid.demo.${id}`,
              from: phone,
              timestamp: String(unix(minutes)),
              type: 'text',
              text: { body },
            }],
          },
        }],
      }],
    },
  };
}

function emailMessage(id: string, from: string, subject: string, body: string, minutes = 0): DemoChannelWebhook {
  return {
    channel: 'email',
    externalId: `demo-email-${id}`,
    payload: {
      MessageID: `demo-email-${id}`,
      From: from,
      Subject: subject,
      TextBody: body,
      Date: iso(minutes),
      Attachments: [],
    },
  };
}

const sarah = customer('55210', 'sarah.jenkins@acme.inc', 'Sarah Jenkins', ['vip', 'enterprise'], { phone: '+14155550101' });
const marcus = customer('55211', 'marcus.chen@example.com', 'Marcus Chen', ['standard'], { phone: '+14155550102' });
const elena = customer('55213', 'elena.rodriguez@example.com', 'Elena Rodriguez', ['standard'], { phone: '+14155550103' });
const james = customer('55214', 'james.wilson@example.com', 'James Wilson', ['vip'], { phone: '+14155550104' });

const sarahOrder = order({ id: '55210', customerId: '55210', status: 'fulfilled', financialStatus: 'paid', fulfillmentStatus: 'fulfilled', total: 129, tags: ['vip'] });
const sarahPayment = payment({ id: '55210', orderId: '55210', customerId: '55210', status: 'refunded', amount: 129, refunded: 129 });

const marcusOrder = order({ id: '55211', customerId: '55211', status: 'confirmed', financialStatus: 'paid', fulfillmentStatus: 'pending', total: 248 });
const marcusPayment = payment({ id: '55211', orderId: '55211', customerId: '55211', status: 'captured', amount: 248 });

const elenaOrder = order({ id: '55213', customerId: '55213', status: 'fulfilled', financialStatus: 'paid', fulfillmentStatus: 'fulfilled', total: 89 });
const elenaPayment = payment({ id: '55213', orderId: '55213', customerId: '55213', status: 'captured', amount: 89 });

const jamesOrder = order({ id: '55214', customerId: '55214', status: 'fulfilled', financialStatus: 'paid', fulfillmentStatus: 'fulfilled', total: 410, tags: ['vip'] });
const jamesPayment = payment({ id: '55214', orderId: '55214', customerId: '55214', status: 'captured', amount: 410 });

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'refund-psp-oms-mismatch',
    title: 'Refund approved in Stripe but pending in OMS',
    description: 'Stripe says the refund succeeded, while the order workflow still believes the refund is pending.',
    customer: sarah,
    shopifyOrders: [sarahOrder],
    stripePayments: [sarahPayment],
    commerceWebhooks: [
      shopifyOrderWebhook('orders/fulfilled', sarahOrder),
      stripeEvent('charge.refunded', sarahPayment, 1),
    ],
    channelWebhooks: [
      whatsappMessage('sarah-refund', '+14155550101', 'Sarah Jenkins', "Hi, I was told my refund for ORD-55210 was approved five days ago but I still don't see it in my account.", 2),
    ],
  },
  {
    id: 'cancel-after-packing',
    title: 'Cancellation requested after packing',
    description: 'Customer asks to cancel after warehouse packing has started, requiring policy-aware handling.',
    customer: marcus,
    shopifyOrders: [marcusOrder],
    stripePayments: [marcusPayment],
    commerceWebhooks: [
      shopifyOrderWebhook('orders/updated', marcusOrder),
      stripeEvent('payment_intent.succeeded', marcusPayment, 1),
    ],
    channelWebhooks: [
      emailMessage('marcus-cancel', 'Marcus Chen <marcus.chen@example.com>', 'Cancel order #55211', 'Please cancel my order. I placed it by mistake and do not want it shipped.', 2),
    ],
  },
  {
    id: 'damaged-item-return',
    title: 'Delivered item arrived damaged',
    description: 'Delivered order with customer-reported damage and return flow in progress.',
    customer: elena,
    shopifyOrders: [elenaOrder],
    stripePayments: [elenaPayment],
    commerceWebhooks: [
      shopifyOrderWebhook('orders/fulfilled', elenaOrder),
      stripeEvent('payment_intent.succeeded', elenaPayment, 1),
    ],
    channelWebhooks: [
      whatsappMessage('elena-damaged', '+14155550103', 'Elena Rodriguez', 'My hoodie arrived damaged. The package was torn and the item has a visible stain. Can I return it?', 2),
    ],
  },
  {
    id: 'vip-policy-exception',
    title: 'VIP return outside standard policy',
    description: 'VIP customer is outside the return window but may deserve a goodwill exception.',
    customer: james,
    shopifyOrders: [jamesOrder],
    stripePayments: [jamesPayment],
    commerceWebhooks: [
      shopifyOrderWebhook('orders/fulfilled', jamesOrder),
      stripeEvent('payment_intent.succeeded', jamesPayment, 1),
    ],
    channelWebhooks: [
      emailMessage('james-vip-return', 'James Wilson <james.wilson@example.com>', 'Return request for ORD-55214', "I want to return order ORD-55214. It's been a few weeks but the product isn't working correctly.", 2),
    ],
  },
];

export function getDemoScenario(id: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find(scenario => scenario.id === id);
}
