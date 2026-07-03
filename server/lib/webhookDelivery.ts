import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';

/**
 * Deliver a broadcast event to the workspace's active webhook subscriptions.
 *
 * Fire-and-forget: callers `void` this so it never blocks the request path.
 *
 * SECURITY (SSRF): the target URL is workspace-configured. As a first-line
 * defence we require http(s) and block hostnames that are obviously internal
 * (loopback, RFC-1918 private ranges, link-local / cloud-metadata). This is NOT
 * complete — a public hostname can still resolve to a private IP (DNS rebinding).
 * A DNS-resolution-based allowlist is a hardening follow-up (see
 * docs/SUPABASE_PENDING.md). Each delivery is bounded by a 5 s timeout.
 */

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '0.0.0.0' || h === '::' || h === '::1') return true;
  // IPv4 literal ranges
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127) return true;                 // loopback
    if (a === 10) return true;                  // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true;    // private
    if (a === 169 && b === 254) return true;    // link-local / cloud metadata
    if (a === 0) return true;
  }
  return false;
}

function isSafeWebhookUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (isBlockedHost(u.hostname)) return false;
  return true;
}

export async function deliverToWebhooks(
  tenantId: string,
  workspaceId: string | null,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('webhook_subscriptions')
      .select('id, url, events, active')
      .eq('tenant_id', tenantId)
      .eq('active', true);
    if (workspaceId) query = query.eq('workspace_id', workspaceId);

    const { data: subs, error } = await query;
    if (error || !subs?.length) return;

    const matching = (subs as Array<{ url: string; events: unknown }>).filter((s) => {
      const evs = Array.isArray(s.events) ? (s.events as string[]) : [];
      const subscribed = evs.length === 0 || evs.includes(event);
      return subscribed && isSafeWebhookUrl(s.url);
    });
    if (!matching.length) return;

    const body = JSON.stringify({ event, data, timestamp: new Date().toISOString() });

    await Promise.allSettled(
      matching.map(async (s) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5_000);
        try {
          const res = await fetch(s.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Clain-Event': event },
            body,
            signal: controller.signal,
          });
          if (!res.ok) {
            logger.warn('Webhook delivery non-2xx', { url: s.url, status: res.status, event });
          }
        } catch (err: any) {
          logger.warn('Webhook delivery failed', { url: s.url, event, error: String(err?.message ?? err) });
        } finally {
          clearTimeout(timer);
        }
      }),
    );
  } catch (err: any) {
    logger.warn('deliverToWebhooks failed', { error: String(err?.message ?? err) });
  }
}
