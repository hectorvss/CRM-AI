import React, { useEffect, useState } from 'react';
import { billingApi } from '../../api/client';
import { useAICredits } from '../../hooks/useAICredits';

interface UsageEvent {
  id: string;
  event_type: string;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  credits_charged: number;
  source: string | null;
  occurred_at: string;
}

/**
 * AI credits dashboard panel for Settings → Billing.
 *
 *  - Live usage summary (period, included, used, top-up, flexible).
 *  - Last 50 ai_usage_events with type, model, credits, source.
 *  - "Download CSV" exports the visible events list.
 */
export default function AICreditsPanel() {
  const { data: usage, refresh } = useAICredits(30_000);
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingEvents(true);
      try {
        const resp = await billingApi.usageEvents(50, 0);
        if (!cancelled) setEvents(resp.events as UsageEvent[]);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load events');
      } finally {
        if (!cancelled) setLoadingEvents(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const downloadCsv = () => {
    const header = ['occurred_at', 'event_type', 'model', 'prompt_tokens', 'completion_tokens', 'credits_charged', 'source'];
    const rows = events.map((e) => [
      e.occurred_at,
      e.event_type,
      e.model || '',
      e.prompt_tokens,
      e.completion_tokens,
      e.credits_charged,
      e.source || '',
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!usage) return <div className="p-4 text-sm text-gray-500">Loading AI credits…</div>;

  const includedRemaining = Math.max(0, usage.included - usage.usedThisPeriod);
  const totalAvailable = includedRemaining + usage.topupBalance;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Stat label="Plan" value={usage.plan} />
        <Stat label="Used this period" value={`${usage.usedThisPeriod.toLocaleString()} / ${usage.unlimited ? '∞' : usage.included.toLocaleString()}`} />
        <Stat label="Top-up balance" value={usage.topupBalance.toLocaleString()} />
        <Stat label="Available now" value={usage.unlimited ? '∞' : totalAvailable.toLocaleString()} />
      </div>

      {!usage.unlimited && (
        <div>
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Period {usage.periodStart.slice(0, 10)} → {usage.periodEnd.slice(0, 10)}</span>
            <span>{usage.percentUsed}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded overflow-hidden">
            <div
              className={`h-full ${usage.percentUsed >= 100 ? 'bg-red-500' : usage.percentUsed >= 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(100, usage.percentUsed)}%` }}
            />
          </div>
        </div>
      )}

      {usage.flexibleEnabled && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-900">
          Flexible billing is enabled (€19 per 1,000 credits). Used this period: <b>{usage.flexibleUsedThisPeriod.toLocaleString()}</b>
          {usage.flexibleCap !== null && <> · cap: {usage.flexibleCap.toLocaleString()}</>}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="font-medium">Recent AI activity</h3>
        <div className="flex gap-2">
          <button onClick={() => void refresh()} className="text-xs border rounded px-2 py-1 hover:bg-gray-50">Refresh</button>
          <button onClick={downloadCsv} className="text-xs border rounded px-2 py-1 hover:bg-gray-50">Download CSV</button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {loadingEvents ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : events.length === 0 ? (
        <div className="text-sm text-gray-500">No AI usage recorded yet.</div>
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Tokens</th>
                <th className="px-3 py-2">Credits</th>
                <th className="px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(e.occurred_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{e.event_type}</td>
                  <td className="px-3 py-2">{e.model || '—'}</td>
                  <td className="px-3 py-2">{(e.prompt_tokens + e.completion_tokens).toLocaleString()}</td>
                  <td className="px-3 py-2">{e.credits_charged}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs ${
                      e.source === 'flexible' ? 'bg-amber-100 text-amber-800' :
                      e.source === 'topup' ? 'bg-blue-100 text-blue-800' :
                      e.source === 'denied' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-700'
                    }`}>{e.source || 'included'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold capitalize">{value}</div>
    </div>
  );
}
