import { useEffect, useState } from "react";

import { STILL_WORKING_AFTER_MS } from "@/api/client";

/**
 * PAC-83 (spec §3.2, D-3): true once `active` has stayed true for
 * STILL_WORKING_AFTER_MS. A setTimeout, so fake timers and Playwright's
 * page.clock drive it.
 */
export function useStillWorking(active: boolean, afterMs: number = STILL_WORKING_AFTER_MS): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!active) {
      setLate(false);
      return;
    }
    const t = setTimeout(() => setLate(true), afterMs);
    return () => clearTimeout(t);
  }, [active, afterMs]);
  return active && late;
}
