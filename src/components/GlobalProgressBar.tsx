import { useEffect, useRef, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

/**
 * Thin animated progress bar pinned to the top of the viewport.
 * Visible whenever any TanStack Query request or mutation is in flight,
 * plus any manually-tracked fetch via `trackRequest()`.
 *
 * The bar grows asymptotically toward ~90% while requests are pending,
 * then snaps to 100% and fades out once everything settles — same UX
 * pattern as nprogress / YouTube / GitHub.
 */
export function GlobalProgressBar() {
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const [manualCount, setManualCount] = useState(() => manualState.count);

  useEffect(() => subscribeManual(setManualCount), []);

  const active = isFetching + isMutating + manualCount > 0;
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const tickRef = useRef<number | null>(null);
  const hideRef = useRef<number | null>(null);

  useEffect(() => {
    // Clear any pending hide when work starts again.
    if (hideRef.current) {
      window.clearTimeout(hideRef.current);
      hideRef.current = null;
    }

    if (active) {
      setVisible(true);
      // Trickle upward toward 90% while requests are pending.
      if (tickRef.current === null) {
        tickRef.current = window.setInterval(() => {
          setProgress((p) => {
            if (p >= 90) return p;
            // Larger increments at the start, smaller as we approach 90%.
            const remaining = 90 - p;
            return p + Math.max(0.5, remaining * 0.08);
          });
        }, 200);
      }
      // Kickstart so the bar is immediately visible on first request.
      setProgress((p) => (p < 10 ? 12 : p));
    } else {
      // Snap to 100% then fade.
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      setProgress(100);
      hideRef.current = window.setTimeout(() => {
        setVisible(false);
        // Reset for next cycle after the fade-out completes.
        window.setTimeout(() => setProgress(0), 200);
      }, 250);
    }

    return () => {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [active]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
    >
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        className="h-full origin-left bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.6)] transition-[transform,opacity] duration-200 ease-out"
        style={{
          transform: `scaleX(${progress / 100})`,
          opacity: visible ? 1 : 0,
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Manual tracker — for fetch calls that bypass TanStack Query.        */
/* Use `trackRequest(promise)` or the start/end pair around any async  */
/* operation that should also pulse the global bar.                    */
/* ------------------------------------------------------------------ */

const manualState = { count: 0 };
const listeners = new Set<(n: number) => void>();

function subscribeManual(fn: (n: number) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit() {
  listeners.forEach((fn) => fn(manualState.count));
}

export function startRequest(): () => void {
  manualState.count += 1;
  emit();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    manualState.count = Math.max(0, manualState.count - 1);
    emit();
  };
}

export function trackRequest<T>(promise: Promise<T>): Promise<T> {
  const end = startRequest();
  return promise.finally(end);
}
