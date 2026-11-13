/**
 * PAC-83 (owner OQ-1 (c), contract §4): the only door from product code into
 * the demo. The demo exists only in non-production builds: every path below
 * is guarded by the literal build flag `__PACEDAY_DEMO_BUILD__`, so a
 * production build (`vite build`) drops it — and the demo chunk with it.
 *
 * Rules (contract §4.2): demo code lives under src/demo and is reached only by
 * a dynamic import in a branch whose condition is the literal flag. Never
 * wrap the flag in a function or a constant: that leaks the demo chunk into
 * the production bundle (`make demo-check` catches it).
 *
 * Demo data is keyed on the demo session alone (spec D-9). Nothing here sets
 * the session: only the demo entry control (src/demo/DemoEntry.tsx) does.
 */

/** True only in an explicit demo session of a non-production build. */
export function isDemoSession(): boolean {
  if (!__PACEDAY_DEMO_BUILD__) return false;
  try {
    return sessionStorage.getItem("paceday:demo") === "1";
  } catch {
    return false;
  }
}

/** Leave the demo session (sign-out from a demo). Never starts one. */
export function clearDemoSession(): void {
  if (!__PACEDAY_DEMO_BUILD__) return;
  try {
    sessionStorage.removeItem("paceday:demo");
  } catch {
    /* storage unavailable */
  }
}

/**
 * Run `real`, or — only in a demo session of a demo build — the demo
 * implementation registered for `op` ("<group>.<name>"). Never falls back:
 * a failed real call is the caller's error, never demo data.
 */
export async function demoOrReal<T>(op: string, args: readonly unknown[], real: () => Promise<T>): Promise<T> {
  if (__PACEDAY_DEMO_BUILD__) {
    if (isDemoSession()) {
      const { runDemoOperation } = await import("@/demo/operations");
      const out = await runDemoOperation(op, args);
      if (out.handled) return out.value as T;
    }
  }
  return real();
}

/**
 * The local stores the demo writes through (the teams and manager stores are
 * shared with real sessions, where they cache the server's last answer). A
 * demo starts on empty stores and leaving it restores what was there, so no
 * demo write is left behind (PAC-83 AC-15) and no real cache is lost.
 */
const SHARED_STORES = ["paceday:teams:v1", "paceday:manager:v1"] as const;
const STORES_BEFORE_DEMO = "paceday:stores-before-demo";

/** Called by the demo entry when the demo starts. */
export function backupStoresForDemo(): void {
  if (!__PACEDAY_DEMO_BUILD__) return;
  try {
    if (localStorage.getItem(STORES_BEFORE_DEMO) === null) {
      const before: Record<string, string | null> = {};
      for (const key of SHARED_STORES) before[key] = localStorage.getItem(key);
      localStorage.setItem(STORES_BEFORE_DEMO, JSON.stringify(before));
    }
    for (const key of SHARED_STORES) localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

/** Drop the demo's writes and put back the stores as they were before the demo. */
export function restoreStoresAfterDemo(): void {
  if (!__PACEDAY_DEMO_BUILD__) return;
  try {
    const raw = localStorage.getItem(STORES_BEFORE_DEMO);
    if (raw === null) return;
    const before = JSON.parse(raw) as Record<string, string | null>;
    for (const key of SHARED_STORES) {
      const value = before[key];
      if (typeof value === "string") localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    }
    localStorage.removeItem(STORES_BEFORE_DEMO);
  } catch {
    /* storage unavailable or a corrupt backup: leave the stores as they are */
  }
}

// A demo that ended without "Exit demo" (the tab was closed) leaves its writes
// in the shared stores: restore them before anything reads the stores.
if (__PACEDAY_DEMO_BUILD__) {
  if (!isDemoSession()) restoreStoresAfterDemo();
}

/** The session-storage key of the removed automatic preview mode (PAC-83 AC-9). */
const LEGACY_MOCK_MODE_KEY = "clockwise:mock-mode";

/** Read once at start-up only to be removed: a leftover flag means nothing now. */
export function clearLegacyMockMode(): void {
  try {
    sessionStorage.removeItem(LEGACY_MOCK_MODE_KEY);
  } catch {
    /* storage unavailable */
  }
}
clearLegacyMockMode();
