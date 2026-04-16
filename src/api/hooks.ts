/**
 * useApi — Generic data fetching hook with loading/error state.
 * Falls back gracefully when the backend is not running.
 */
import { useState, useEffect, useCallback } from 'react';

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: any[] = [],
  fallback?: T
): ApiState<T> {
  const [data, setData] = useState<T | null>(fallback ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [retryTick, setRetryTick] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    setLoading(true);
    setError(null);
    setData(fallback ?? null);

    fetcher()
      .then(result => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
          setAttempt(0);
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.warn('[useApi] fetch failed:', err.message);
          setError(err.message);
          setLoading(false);
          if (attempt < 3) {
            retryTimer = setTimeout(() => {
              if (!cancelled) {
                setAttempt(current => current + 1);
                setRetryTick(current => current + 1);
              }
            }, 750 * (attempt + 1));
          }
        }
      });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, retryTick]);

  return { data, loading, error, refetch };
}

/**
 * useMutation — For POST/PATCH/DELETE actions.
 */
export function useMutation<TInput, TOutput>(
  mutator: (input: TInput) => Promise<TOutput>
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (input: TInput): Promise<TOutput | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await mutator(input);
        setLoading(false);
        return result;
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
        return null;
      }
    },
    [mutator]
  );

  return { mutate, loading, error };
}
