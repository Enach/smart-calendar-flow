import { useEffect, useState } from "react";

/**
 * Returns `true` only after `value` has been continuously `true` for `delayMs`.
 * Flips back to `false` immediately when `value` becomes `false`.
 *
 * Use to suppress loading overlays / skeletons for very fast API responses,
 * avoiding flicker when a request resolves in <250ms.
 */
export function useDebouncedFlag(value: boolean, delayMs = 250): boolean {
  const [debounced, setDebounced] = useState(false);

  useEffect(() => {
    if (!value) {
      setDebounced(false);
      return;
    }
    const t = window.setTimeout(() => setDebounced(true), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
