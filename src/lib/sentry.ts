import * as Sentry from "@sentry/react";
import { z } from "zod";

/**
 * PAC-14 frontend Sentry integration.
 *
 * Derives entirely from the approved contract `contracts/features/PAC-14.md` §4
 * (Frontend business rules) and the merged plan `PAC-14-plan.md`:
 *  - init once, before the React tree mounts;
 *  - DSN from `import.meta.env.VITE_SENTRY_DSN`, falling back to the documented default;
 *  - `environment: import.meta.env.MODE`; `sendDefaultPii: false`;
 *  - allowed monitoring-status transitions: `uninitialized -> active`
 *    (init succeeds) and `uninitialized -> disabled` (no DSN / init throws).
 *    No other transitions; once `active` it stays `active` for the session and
 *    the app MUST NOT re-init.
 */

/** Documented default DSN from the PAC-14 issue / contract §4. */
export const DEFAULT_SENTRY_DSN =
  "https://8141ab6e48ded81c6d47f8f074c1a648@o4512081160896512.ingest.de.sentry.io/4512083551060048";

/**
 * Strict config schema (contract §4). No `.passthrough()`, no `.partial()`:
 * unknown fields are rejected, matching the repo's existing wire-contract style
 * (`src/contracts/managerTeam.ts`).
 */
export const sentryConfigSchema = z
  .object({
    dsn: z.string().url(),
    environment: z.string(),
    enabled: z.boolean().default(true),
  })
  .strict();

export type SentryConfig = z.infer<typeof sentryConfigSchema>;

/** Monitoring lifecycle status. Only the transitions below are permitted. */
export type MonitoringStatus = "uninitialized" | "active" | "disabled";

let status: MonitoringStatus = "uninitialized";

/** Current monitoring status (read-only view for callers / tests). */
export function getMonitoringStatus(): MonitoringStatus {
  return status;
}

/**
 * Resolve the effective config from the environment.
 * An absent/empty DSN yields `enabled: false` (contract failure path: init no-ops).
 */
export function resolveSentryConfig(env: {
  VITE_SENTRY_DSN?: string;
  MODE?: string;
}): SentryConfig {
  const rawDsn = (env.VITE_SENTRY_DSN ?? "").trim() || DEFAULT_SENTRY_DSN;
  const environment = env.MODE ?? "development";

  // Validate the DSN through the strict schema. A malformed DSN throws in the
  // schema; the caller treats that as "monitoring disabled" (fail-open).
  const parsed = sentryConfigSchema.parse({
    dsn: rawDsn,
    environment,
    enabled: true,
  });
  return parsed;
}

/**
 * Initialize Sentry exactly once. Fail-open: any error (missing/malformed DSN,
 * SDK throw) degrades to `disabled` and never blocks the app from mounting.
 *
 * Returns the resulting status. Calling again after `active` is a no-op that
 * returns `active` (contract: the app MUST NOT re-init).
 */
export function initSentry(
  env: { VITE_SENTRY_DSN?: string; MODE?: string } = {
    VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN as string | undefined,
    MODE: import.meta.env.MODE,
  },
): MonitoringStatus {
  // Only `uninitialized` may transition. Never re-init.
  if (status !== "uninitialized") {
    return status;
  }

  try {
    const config = resolveSentryConfig(env);
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      // PII off by default per contract §2/§4: no user email/tokens on events.
      sendDefaultPii: false,
      // errors-only for v1 (no tracing spans), mirrors backend TracesSampleRate 0.0.
      tracesSampleRate: 0.0,
    });
    status = "active";
  } catch (err) {
    // uninitialized -> disabled. Do not rethrow; the SPA must still render.
    console.warn("sentry init failed, monitoring disabled:", err);
    status = "disabled";
  }

  return status;
}

/**
 * Test-only reset of the module-level status. Not exported for production use
 * paths; guarded so it cannot be used to re-init a live session.
 */
export function __resetMonitoringStatusForTests(): void {
  status = "uninitialized";
}
