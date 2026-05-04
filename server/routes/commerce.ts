/**
 * server/routes/commerce.ts
 *
 * Multi-provider commerce endpoints used by the Orders / Refund flow modal.
 * Today this surfaces:
 *
 *   GET  /api/commerce/products?provider=shopify|woocommerce&q=<title>
 *        Live product search across the tenant's connected ecommerce
 *        platform. Returns a normalised shape so the UI doesn't have to
 *        know whether the catalog came from Shopify or WooCommerce.
 *
 *   POST /api/commerce/draft-orders
 *        Create a draft order (cart) on the tenant's connected ecommerce.
 *        Used when an agent processes an exchange — the draft order
 *        replaces refunded items with the new selection.
 *
 * Both endpoints are tenant-scoped via the existing `*ForTenant` resolvers
 * (Shopify, WooCommerce). When no connector is configured the endpoint
 * returns 503 with a typed error.
 */

import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(extractMultiTenant);

interface NormalisedProduct {
  provider: 'shopify' | 'woocommerce';
  id: string;
  title: string;
  vendor?: string;
  productType?: string;
  status?: string;
  imageUrl?: string;
  priceMin?: number;
  priceMax?: number;
  currency?: string;
  variants: Array<{
    id: string;
    title: string;
    sku?: string;
    price: number;
    available?: boolean;
    inventoryQuantity?: number;
  }>;
}

function normaliseShopifyProduct(p: any): NormalisedProduct {
  const variants = Array.isArray(p?.variants) ? p.variants : [];
  const prices = variants.map((v: any) => Number(v.price ?? 0)).filter((n: number) => Number.isFinite(n) && n > 0);
  return {
    provider: 'shopify',
    id: String(p.id),
    title: String(p.title ?? p.handle ?? 'Untitled'),
    vendor: p.vendor || undefined,
    productType: p.product_type || undefined,
    status: p.status || undefined,
    imageUrl: p.image?.src || p.images?.[0]?.src || undefined,
    priceMin: prices.length ? Math.min(...prices) : undefined,
    priceMax: prices.length ? Math.max(...prices) : undefined,
    currency: undefined, // Shopify shop currency comes from /shop.json — UI can fall back to order currency
    variants: variants.map((v: any) => ({
      id: String(v.id),
      title: String(v.title ?? 'Default'),
      sku: v.sku || undefined,
      price: Number(v.price ?? 0),
      available: v.inventory_quantity == null ? undefined : v.inventory_quantity > 0,
      inventoryQuantity: v.inventory_quantity ?? undefined,
    })),
  };
}

function normaliseWooProduct(p: any): NormalisedProduct {
  const price = Number(p?.price ?? 0);
  const variations = Array.isArray(p?.variations) ? p.variations : [];
  return {
    provider: 'woocommerce',
    id: String(p.id),
    title: String(p.name ?? 'Untitled'),
    productType: p.type || undefined,
    status: p.status || undefined,
    imageUrl: p.images?.[0]?.src || undefined,
    priceMin: Number.isFinite(price) && price > 0 ? price : undefined,
    priceMax: Number.isFinite(price) && price > 0 ? price : undefined,
    currency: undefined,
    // WooCommerce nests variations as numeric IDs in /products/:id, the UI
    // can request the full variation list via product detail if needed.
    variants: variations.length === 0
      ? [{ id: String(p.id), title: 'Default', sku: p.sku || undefined, price, available: p.in_stock !== false, inventoryQuantity: p.stock_quantity ?? undefined }]
      : variations.map((vid: any) => ({ id: String(vid), title: 'Variant', price })),
  };
}

// ── GET /api/commerce/products ─────────────────────────────────────────────

router.get('/products', requirePermission('orders.read'), async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const provider = String(req.query.provider ?? '').toLowerCase();
  const q = String(req.query.q ?? '').trim();
  const limit = Math.min(Number(req.query.limit ?? 25), 100);

  // If provider unspecified, try Shopify first then WooCommerce.
  const order: Array<'shopify' | 'woocommerce'> =
    provider === 'shopify' ? ['shopify']
    : provider === 'woocommerce' || provider === 'woo' ? ['woocommerce']
    : ['shopify', 'woocommerce'];

  const errors: string[] = [];
  for (const p of order) {
    try {
      if (p === 'shopify') {
        const { shopifyForTenant } = await import('../integrations/shopify-tenant.js');
        const r = await shopifyForTenant(req.tenantId, req.workspaceId ?? null);
        if (!r) { errors.push('shopify: not connected'); continue; }
        const all = await r.rest.listProducts({ limit, status: 'active' });
        const filtered = q
          ? (all as any[]).filter((row) =>
              [row.title, row.vendor, row.product_type, row.handle, row.tags]
                .filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase()))
          : (all as any[]);
        const items = filtered.slice(0, limit).map(normaliseShopifyProduct);
        return res.json({ provider: 'shopify', count: items.length, items });
      }
      if (p === 'woocommerce') {
        const { wooForTenant } = await import('../integrations/woocommerce-tenant.js');
        const r = await wooForTenant(req.tenantId, req.workspaceId ?? null);
        if (!r) { errors.push('woocommerce: not connected'); continue; }
        const items = await r.adapter.listProducts({ perPage: limit, search: q || undefined });
        return res.json({
          provider: 'woocommerce',
          count: items.length,
          items: items.map(normaliseWooProduct),
        });
      }
    } catch (err: any) {
      logger.warn(`commerce/products ${p} failed`, { error: err?.message });
      errors.push(`${p}: ${err?.message || 'unknown error'}`);
    }
  }

  return res.status(503).json({
    error: 'No ecommerce connector available',
    detail: errors.join(' · '),
    items: [],
  });
});

// ── POST /api/commerce/draft-orders ────────────────────────────────────────

router.post('/draft-orders', requirePermission('orders.write'), async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const body = req.body ?? {};
  const provider = String(body.provider ?? '').toLowerCase() || 'shopify';
  const lineItems = Array.isArray(body.lineItems) ? body.lineItems : [];
  const customerId = body.customerExternalId || body.customer_id;
  const note = body.note || `Replacement draft order created from CRM-AI refund flow`;

  if (lineItems.length === 0) return res.status(400).json({ error: 'lineItems is required' });

  try {
    if (provider === 'shopify') {
      const { shopifyForTenant } = await import('../integrations/shopify-tenant.js');
      const r = await shopifyForTenant(req.tenantId, req.workspaceId ?? null);
      if (!r) return res.status(503).json({ error: 'shopify connector not configured for tenant' });
      const adapter: any = r.rest;
      // Shopify accepts variant_id-based line items.
      const draft = typeof adapter.createDraftOrder === 'function'
        ? await adapter.createDraftOrder({
            line_items: lineItems.map((li: any) => ({
              variant_id: Number(li.variantId ?? li.variant_id),
              quantity: Number(li.quantity ?? 1),
            })),
            customer: customerId ? { id: Number(customerId) } : undefined,
            note,
            tags: ['crm-ai-refund-exchange'],
          })
        : null;
      if (!draft) return res.status(501).json({ error: 'shopify adapter does not support createDraftOrder yet' });
      return res.json({ ok: true, provider: 'shopify', draft });
    }
    if (provider === 'woocommerce' || provider === 'woo') {
      const { wooForTenant } = await import('../integrations/woocommerce-tenant.js');
      const r = await wooForTenant(req.tenantId, req.workspaceId ?? null);
      if (!r) return res.status(503).json({ error: 'woocommerce connector not configured for tenant' });
      const adapter: any = r.adapter;
      const draft = typeof adapter.createOrder === 'function'
        ? await adapter.createOrder({
            status: 'pending',
            line_items: lineItems.map((li: any) => ({
              product_id: Number(li.productId ?? li.product_id),
              variation_id: li.variantId ? Number(li.variantId) : undefined,
              quantity: Number(li.quantity ?? 1),
            })),
            customer_note: note,
          })
        : null;
      if (!draft) return res.status(501).json({ error: 'woocommerce adapter does not support createOrder yet' });
      return res.json({ ok: true, provider: 'woocommerce', draft });
    }
    return res.status(400).json({ error: `unsupported provider: ${provider}` });
  } catch (err: any) {
    logger.error('commerce/draft-orders failed', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
});

export default router;
