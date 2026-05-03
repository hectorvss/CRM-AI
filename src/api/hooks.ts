/**
 * useApi / useMutation — Generic data fetching + mutation hooks for the SPA.
 *
 * Failure model
 * -------------
 * The fetcher / mutator passed in must throw on any non-OK response. We expect
 * the error to optionally carry a numeric `.status` (HTTP code). `src/api/client.ts`
 * (`request()`) is responsible for attaching `.status` — see the cross-cutting
 * note in PROGRESS.md if it is missing for a given codepath.
 *
 * Behaviour
 * ---------
 * - Status 401 → emit a global `crmai:unauthorized` window event and STOP retrying.
 *   A top-level listener (wired in main.tsx) is responsible for clearing the
 *   membership cache, signing out of Supabase, and redirecting to the sign-in
 *   page with a `return` query param so the user lands back where they were.
 * - Status 403 → surface the error message ("no permission") without crashing.
 *   No retry — repeating the request will not grant permission.
 * - Status 5xx (or undefined) → log via console.error, surface a clear message,
 *   retry up to 3 times with exponential backoff (only for read hooks).
 * - Network errors (`err.message` undefined / TypeError) → treat as transient.
 *
 * NEVER swallow errors silently: every failure path either logs to console or
 * exposes a user-facing message via the returned `error` field.
 */

import { useState, useEffect, useCallback } from 'react';

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** HTTP status when known (401/403/500/…). null for network or unknown errors. */
  status: number | null;
  refetch: () => void;
}

/** Event name dispatched on `window` when an authenticated request returns 401. */
export const UNAUTHORIZED_EVENT = 'crmai:unauthorized';

/** Build a user-facing error message that never resolves to "undefined". */
function describeError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.length > 0) return err;
  if (err && typeof err === 'object') {
    const anyErr = err as { message?: unknown; error?: unknown };
    if (typeof anyErr.message === 'string' && anyErr.message.length > 0) return anyErr.message;
    if (typeof anyErr.error === 'string' && anyErr.error.length > 0) return anyErr.error;
  }
  return 'Network error. Please check your connection and try again.';
}

/** Read a numeric `.status` off whatever the fetcher threw, if present. */
function extractStatus(err: unknown): number | null {
  if (err && typeof err === 'object') {
    const s = (err as { status?: unknown }).status;
    if (typeof s === 'number' && Number.isFinite(s)) return s;
  }
  return null;
}

/** Dispatch the global unauthorized event so the app can sign the user out. */
function emitUnauthorized() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    } catch {
      /* environments without CustomEvent — ignore */
    }
  }
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: any[] = [],
  fallback?: T,
): ApiState<T> {
  const [data, setData] = useState<T | null>(fallback ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [retryTick, setRetryTick] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    setLoading(true);
    setError(null);
    setStatus(null);
    setData(fallback ?? null);

    fetcher()
      .then(result => {
        if (cancelled) return;
        setData(result);
        setLoading(false);
        setAttempt(0);
      })
      .catch(err => {
        if (cancelled) return;

        const httpStatus = extractStatus(err);
        const message = describeError(err);

        // Always log the failure — do not silently swallow.
        console.error('[useApi] fetch failed:', { status: httpStatus, message, err });

        setStatus(httpStatus);
        setError(message);
        setLoading(false);

        // 401: do not retry. Trigger the global sign-out flow.
        if (httpStatus === 401) {
          emitUnauthorized();
          return;
        }

        // 403: do not retry. The user simply lacks permission.
        if (httpStatus === 403) {
          return;
        }

        // 4xx (other than 401/403): client error, retrying won't help.
        if (httpStatus !== null && httpStatus >= 400 && httpStatus < 500) {
          return;
        }

        // 5xx / network / unknown: retry with backoff up to 3 times.
        if (attempt < 3) {
          retryTimer = setTimeout(() => {
            if (cancelled) return;
            setAttempt(current => current + 1);
            setRetryTick(current => current + 1);
          }, 750 * (attempt + 1));
        }
      });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, retryTick]);

  return { data, loading, error, status, refetch };
}

interface MutationOptions<TOutput> {
  /** Called when the mutation throws. Receives the original error object so
   *  callers can inspect `.status`. Runs after the hook has updated its own
   *  `error`/`status` state. */
  onError?: (err: unknown) => void;
  /** Optional success callback. */
  onSuccess?: (out: TOutput) => void;
}

/**
 * useMutation — For POST/PATCH/DELETE actions.
 *
 * Returns `null` when the mutation throws so call-sites can branch on it, but
 * surfaces the error message + HTTP status for UI feedback. 401 also triggers
 * the global unauthorized event (same as useApi).
 */
export function useMutation<TInput, TOutput>(
  mutator: (input: TInput) => Promise<TOutput>,
  options: MutationOptions<TOutput> = {},
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);

  const { onError, onSuccess } = options;

  const mutate = useCallback(
    async (input: TInput): Promise<TOutput | null> => {
      setLoading(true);
      setError(null);
      setStatus(null);
      try {
        const result = await mutator(input);
        setLoading(false);
        if (onSuccess) {
          try { onSuccess(result); } catch (cbErr) { console.error('[useMutation] onSuccess threw', cbErr); }
        }
        return result;
      } catch (err: unknown) {
        const httpStatus = extractStatus(err);
        const message = describeError(err);
        console.error('[useMutation] action failed:', { status: httpStatus, message, err });

        setStatus(httpStatus);
        setError(message);
        setLoading(false);

        if (httpStatus === 401) {
          emitUnauthorized();
        }

        if (onError) {
          try { onError(err); } catch (cbErr) { console.error('[useMutation] onError threw', cbErr); }
        }
        return null;
      }
    },
    [mutator, onError, onSuccess],
  );

  return { mutate, loading, error, status };
}
