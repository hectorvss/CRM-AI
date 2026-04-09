import { integrationRegistry } from '../integrations/registry.js';
import type {
  CanonicalCustomer,
  CanonicalOrder,
  CanonicalPayment,
  CanonicalRefund,
  IntegrationAdapter,
  ReadableCustomers,
  ReadableOrders,
  ReadablePayments,
} from '../integrations/types.js';
import type { DemoScenario } from './scenarios.js';

type ShopifySandboxAdapter = IntegrationAdapter & ReadableOrders & ReadableCustomers;
type StripeSandboxAdapter = IntegrationAdapter & ReadablePayments;

function findByExternalId<T extends { externalId: string }>(
  values: T[],
  externalId: string,
): T | undefined {
  return values.find(value =>
    value.externalId === externalId ||
    value.externalId.endsWith(`_${externalId}`) ||
    externalId.endsWith(`_${value.externalId}`),
  );
}

function findCustomerByShopifyNumericId(
  customers: CanonicalCustomer[],
  externalId: string,
): CanonicalCustomer | undefined {
  return customers.find(customer =>
    customer.externalId === externalId ||
    customer.externalId.endsWith(`_${externalId}`),
  );
}

export function registerDemoIntegrationAdapters(scenarios: DemoScenario[]): void {
  const customers = scenarios.map(scenario => scenario.customer);
  const orders = scenarios.flatMap(scenario => scenario.shopifyOrders);
  const payments = scenarios.flatMap(scenario => scenario.stripePayments);

  const shopifyAdapter: ShopifySandboxAdapter = {
    system: 'shopify',
    verifyWebhook: () => true,
    async ping() {},
    async getOrder(externalId: string): Promise<CanonicalOrder> {
      const order = findByExternalId(orders, externalId);
      if (!order) {
        throw new Error(`Demo Shopify order not found: ${externalId}`);
      }
      return {
        ...order,
        fetchedAt: new Date().toISOString(),
        raw: { ...order.raw, mode: 'sandbox', sourcePayloadShape: 'shopify_admin_order' },
      };
    },
    async listOrders(params?: { limit?: number }): Promise<CanonicalOrder[]> {
      return orders.slice(0, params?.limit ?? orders.length);
    },
    async getCustomer(externalId: string): Promise<CanonicalCustomer> {
      const customer = findCustomerByShopifyNumericId(customers, externalId);
      if (!customer) {
        throw new Error(`Demo Shopify customer not found: ${externalId}`);
      }
      return {
        ...customer,
        fetchedAt: new Date().toISOString(),
        raw: { ...customer.raw, mode: 'sandbox', sourcePayloadShape: 'shopify_admin_customer' },
      };
    },
    async findCustomerByEmail(email: string): Promise<CanonicalCustomer | null> {
      return customers.find(customer => customer.email?.toLowerCase() === email.toLowerCase()) ?? null;
    },
    async findCustomerByPhone(phone: string): Promise<CanonicalCustomer | null> {
      return customers.find(customer => customer.phone === phone) ?? null;
    },
  };

  const stripeAdapter: StripeSandboxAdapter = {
    system: 'stripe',
    verifyWebhook: () => true,
    async ping() {},
    async getPayment(externalId: string): Promise<CanonicalPayment> {
      const payment = findByExternalId(payments, externalId);
      if (!payment) {
        throw new Error(`Demo Stripe payment not found: ${externalId}`);
      }
      return {
        ...payment,
        fetchedAt: new Date().toISOString(),
        raw: { ...payment.raw, mode: 'sandbox', sourcePayloadShape: 'stripe_charge' },
      };
    },
    async listRefunds(_paymentExternalId: string): Promise<CanonicalRefund[]> {
      return [];
    },
  };

  integrationRegistry.register(shopifyAdapter);
  integrationRegistry.register(stripeAdapter);
}
