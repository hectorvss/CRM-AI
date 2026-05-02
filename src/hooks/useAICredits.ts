import { useEffect, useState, useCallback, useRef } from 'react';
import { billingApi } from '../api/client';

export interface AICreditsState {
  plan: string;
  periodStart: string;
  periodEnd: string;
  included: number;
  usedThisPeriod: number;
  topupBalance: number;
  flexibleEnabled: boolean;
  flexibleCap: number | null;
  flexibleUsedThisPeriod: number;
  percentUsed: number;
  unlimited: boolean;
}

export interface UseAICreditsReturn {
  data: AICreditsState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** True when usage is at/over 100% AND flexible billing is not enabled. */
  blocked: boolean;
  /** True when usage is in the warning zone (>= 80% < 100%). */
  warning: boolean;
  /** True when the workspace is on flexible (post-paid) billing right now. */
  flexibleActive: boolean;
}

const POLL_INTERVAL_MS = 60_000;

/**
 * Polls /api/billing/usage every minute and exposes the AI credits state.
 * Use across the app (SuperAgent banner, AIStudio, settings) to drive
 * "credits low" / "credits exhausted" UI states.
 */
export function useAICredits(pollMs: number = POLL_INTERVAL_MS): UseAICreditsReturn {
  const [data, setData] = useState<AICreditsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const usage = await billingApi.usage();
      if (mountedRef.current) {
        setData(usage as AICreditsState);
        setError(null);
      }
    } catch (err: any) {
      if (mountedRef.current) setError(err?.message || 'Failed to load usage');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [pollMs, refresh]);

  const percent = data?.percentUsed ?? 0;
  const flexibleActive = !!(data && !data.unlimited && percent >= 100 && data.flexibleEnabled);
  const blocked = !!(data && !data.unlimited && percent >= 100 && !data.flexibleEnabled);
  const warning = !!(data && !data.unlimited && percent >= 80 && percent < 100);

  return { data, loading, error, refresh, blocked, warning, flexibleActive };
}
