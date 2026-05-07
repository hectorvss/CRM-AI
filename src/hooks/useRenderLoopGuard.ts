import { useRef } from 'react';

/**
 * Diagnostic hook that detects render loops at runtime.
 *
 * Records every render timestamp in a ref-backed window. If the component
 * exceeds `threshold` renders within `windowMs`, it logs a console error so
 * the loop is visible AND traceable in DevTools. We deliberately do NOT throw
 * — throwing would unmount the component entirely and remove the evidence.
 *
 * Intended to stay in the codebase even after the immediate fix lands —
 * cheap, side-effect-free, and invaluable when a future regression silently
 * starts hammering React again.
 */
export function useRenderLoopGuard(
  componentName: string,
  threshold = 50,
  windowMs = 5000,
): { count: number; tripped: boolean } {
  const renderTimesRef = useRef<number[]>([]);
  const trippedRef = useRef(false);

  const now = Date.now();
  renderTimesRef.current.push(now);
  const cutoff = now - windowMs;
  renderTimesRef.current = renderTimesRef.current.filter(t => t >= cutoff);

  const count = renderTimesRef.current.length;
  const tripped = count > threshold;
  if (tripped && !trippedRef.current) {
    trippedRef.current = true;
    // eslint-disable-next-line no-console
    console.error(
      `[${componentName}] RENDER LOOP DETECTED: ${count} renders in ${windowMs}ms`,
    );
  }
  return { count, tripped };
}
