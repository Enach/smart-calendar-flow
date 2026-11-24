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

/**
 * PAC-92: the backup is kept in `sessionStorage`, scoped to the tab that
 * entered the demo — like the demo session flag itself, and for the same
 * reason src/components/auth/rememberedEmail.ts chooses sessionStorage.
 * In `localStorage` it was shared by every tab of the origin, so a second tab
 * opened during a demo restored the stores and dropped the backup, and the
 * demo tab's later writes then survived its exit.
 *
 * Read from `localStorage` too, once, by the start-up undo below: that is
 * where builds before PAC-92 kept it.
 */
const STORES_BEFORE_DEMO = "paceday:stores-before-demo";

/**
 * `localStorage`, so every tab sees it: a demo somewhere may have written the
 * shared stores. Removed when a tab leaves a demo cleanly (the stores are back
 * as they were); until then any tab that is not in a demo drops the stores
 * rather than show another tab's demo data.
 */
const STORES_TOUCHED_BY_DEMO = "paceday:demo-touched-stores";

/** Called by the demo entry when the demo starts. */
export function backupStoresForDemo(): void {
  if (!__PACEDAY_DEMO_BUILD__) return;
  try {
    if (sessionStorage.getItem(STORES_BEFORE_DEMO) === null) {
      const before: Record<string, string | null> = {};
      for (const key of SHARED_STORES) before[key] = localStorage.getItem(key);
      sessionStorage.setItem(STORES_BEFORE_DEMO, JSON.stringify(before));
    }
    localStorage.setItem(STORES_TOUCHED_BY_DEMO, "1");
    for (const key of SHARED_STORES) localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

/** Put back the stores recorded in `raw`. False when there was nothing to put back. */
function putBackStores(raw: string | null): boolean {
  if (raw === null) return false;
  const before = JSON.parse(raw) as Record<string, string | null>;
  for (const key of SHARED_STORES) {
    const value = before[key];
    if (typeof value === "string") localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  }
  return true;
}

/** Drop this tab's demo writes and put back the stores as they were before its demo. */
export function restoreStoresAfterDemo(): void {
  if (!__PACEDAY_DEMO_BUILD__) return;
  try {
    if (!putBackStores(sessionStorage.getItem(STORES_BEFORE_DEMO))) return;
    sessionStorage.removeItem(STORES_BEFORE_DEMO);
    localStorage.removeItem(STORES_TOUCHED_BY_DEMO);
  } catch {
    /* storage unavailable or a corrupt backup: leave the stores as they are */
  }
}

/**
 * A demo that ended without "Exit demo" (the tab was closed) leaves its writes
 * in the shared stores, and its tab-scoped backup went with the tab. Drop the
 * stores instead of restoring them: they only cache the server's last answer,
 * so the next read asks the server again — and nothing a demo made is left for
 * a real session (AC-15). A demo still running in another tab keeps the flag,
 * so this tab shows none of its data and that tab's own exit still puts the
 * real cache back from its own backup.
 */
function undoAbandonedDemo(): void {
  try {
    // Before PAC-92 the backup was in localStorage: honour one last time.
    if (putBackStores(localStorage.getItem(STORES_BEFORE_DEMO))) {
      localStorage.removeItem(STORES_BEFORE_DEMO);
      localStorage.removeItem(STORES_TOUCHED_BY_DEMO);
      return;
    }
    if (localStorage.getItem(STORES_TOUCHED_BY_DEMO) === null) return;
    for (const key of SHARED_STORES) localStorage.removeItem(key);
  } catch {
    /* storage unavailable or a corrupt backup: leave the stores as they are */
  }
}

// Undo before anything reads the stores.
if (__PACEDAY_DEMO_BUILD__) {
  if (!isDemoSession()) undoAbandonedDemo();
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
