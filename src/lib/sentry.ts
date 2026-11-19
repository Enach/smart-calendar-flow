import * as Sentry from "@sentry/react";
import { z } from "zod";

/**
 * PAC-14 frontend Sentry integration.
 *
 * Derives entirely from the approved contract `contracts/features/PAC-14.md` §4
 * (Frontend business rules) and the merged plan `PAC-14-plan.md`:
 *  - init once, before the React tree mounts;
 *  - DSN from the build-time `import.meta.env.VITE_SENTRY_DSN` only. There is no
 *    default DSN (PAC-86, PAC-14 §4 amendment): unset or empty means web
 *    monitoring is off and `Sentry.init` is never called;
 *  - `environment: import.meta.env.MODE`; `sendDefaultPii: false`;
 *  - allowed monitoring-status transitions: `uninitialized -> active`
 *    (init succeeds) and `uninitialized -> disabled` (no DSN / init throws).
 *    No other transitions; once `active` it stays `active` for the session and
 *    the app MUST NOT re-init.
 */

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
 * An absent/empty DSN yields `null`: monitoring is off (PAC-86, no default DSN).
 */
export function resolveSentryConfig(env: {
  VITE_SENTRY_DSN?: string;
  MODE?: string;
}): SentryConfig | null {
  const rawDsn = (env.VITE_SENTRY_DSN ?? "").trim();
  if (rawDsn === "") {
    return null;
  }
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
    if (config === null) {
      // uninitialized -> disabled: no DSN configured at build time, so no
      // event is ever sent anywhere (PAC-86).
      status = "disabled";
      return status;
    }
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      // PII off by default per contract §2/§4: no user email/tokens on events.
      sendDefaultPii: false,
      // errors-only for v1 (no tracing spans), mirrors backend TracesSampleRate 0.0.
      tracesSampleRate: 0.0,
      // PAC-129 review: team and Manager paths carry addresses
      // (/api/teams/{id}/people/{email}, /api/manager/team/members/{email}).
      beforeBreadcrumb: redactBreadcrumb,
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

// An email-shaped run of characters inside a URL path or query segment, raw
// or with "@" percent-encoded. Segment boundaries are / ? # & = so the rest of
// the URL (route shape, team id) stays readable. The local part is lazy, so
// the first "@" of a segment decides: "ivan@mail.ru,react@1.2.3" is one
// address-bearing segment, not a package.
const EMAIL_IN_URL = /[^/?#&=\s]+?(?:@|%40)([^/?#&=\s]+)/gi;

// PAC-139: the only segments left alone are pkg@version ones, where what
// follows "@" is a version (1.2.3, 18.3.1-beta, v2.0.0+build.5) or a common
// dist-tag (latest, next, ...). Everything else is redacted, user@localhost too,
// including IDN (xn--), Unicode and percent-encoded domains: when in doubt the
// address goes, because under-redaction is the worse failure.
// A pre-release or build suffix only after a full x.y.z: 7-eleven.com and
// 2.5-cms.co are domains, not versions.
const PKG_VERSION = /^v?\d+(?:\.\d+)*$|^v?\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?(?:\+[0-9a-z.-]+)?$/i;
const PKG_DIST_TAG = /^(?:latest|next|beta|alpha|canary|rc|stable|dev|experimental|insiders|nightly)$/i;
// Sentence punctuation after an address in a console message stays visible.
const TRAILING_PUNCTUATION = /[.,:;!?)\]'"]+$/;

/** Replaces every email-shaped segment of a URL with "[email]". */
export function redactEmailsInUrl(url: string): string {
  return url.replace(EMAIL_IN_URL, (match: string, domain: string) => {
    const tail = TRAILING_PUNCTUATION.exec(domain)?.[0] ?? "";
    const bare = domain.slice(0, domain.length - tail.length);
    if (PKG_VERSION.test(bare) || PKG_DIST_TAG.test(bare)) return match;
    return `[email]${tail}`;
  });
}

// PAC-145: how far into a logged object redactConsoleArgument looks. Sentry
// itself serialises breadcrumb data only 3 levels deep (normalizeDepth), so
// anything below this bound would not be shown anyway; it is replaced rather
// than passed through unread.
export const CONSOLE_ARG_MAX_DEPTH = 6;
// PAC-145: how many entries of one object or array are kept (Sentry keeps
// 1000, normalizeMaxBreadth). Bounds the work on a huge logged value.
export const CONSOLE_ARG_MAX_BREADTH = 200;

function constructorName(value: object): string {
  const name = (value as { constructor?: { name?: unknown } }).constructor?.name;
  return typeof name === "string" && name !== "" ? name : "Object";
}

/**
 * PAC-145: a console argument with every string in it redacted, at any depth
 * up to CONSOLE_ARG_MAX_DEPTH: values and keys of plain objects, array items,
 * and an Error's name, message, stack, cause and own properties. The result is
 * a fresh plain value; the logged object is never mutated. A cycle becomes
 * "[Circular]", anything deeper than the bound "[Truncated]", a function
 * "[Function]" and a DOM node "[NodeName]", so nothing is kept unread.
 */
export function redactConsoleArgument(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === "string") return redactEmailsInUrl(value);
  if (typeof value === "function") return "[Function]";
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  if (depth >= CONSOLE_ARG_MAX_DEPTH) return "[Truncated]";
  if (typeof Node !== "undefined" && value instanceof Node) return `[${value.nodeName}]`;
  seen.add(value);
  try {
    const next = (v: unknown) => redactConsoleArgument(v, depth + 1, seen);
    if (Array.isArray(value)) {
      const out = value.slice(0, CONSOLE_ARG_MAX_BREADTH).map(next);
      if (value.length > CONSOLE_ARG_MAX_BREADTH) out.push("[Truncated]");
      return out;
    }
    const out: Record<string, unknown> = {};
    if (value instanceof Error) {
      // Not enumerable, so the own-key walk below would miss them; Sentry
      // serialises them.
      out.name = next(value.name);
      out.message = next(value.message);
      if (value.stack !== undefined) out.stack = next(value.stack);
      if ("cause" in value && value.cause !== undefined) out.cause = next(value.cause);
    } else if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
    } else if (value instanceof Map) {
      return next(Object.fromEntries(value));
    } else if (value instanceof Set) {
      return next([...value]);
    } else if (constructorName(value) !== "Object") {
      out.__type = constructorName(value);
    }
    const keys = Object.keys(value);
    for (const key of keys.slice(0, CONSOLE_ARG_MAX_BREADTH)) {
      let v: unknown;
      try {
        v = (value as Record<string, unknown>)[key];
      } catch {
        v = "[Unreadable]";
      }
      out[redactEmailsInUrl(key)] = next(v);
    }
    if (keys.length > CONSOLE_ARG_MAX_BREADTH) out["[Truncated]"] = keys.length - CONSOLE_ARG_MAX_BREADTH;
    return out;
  } finally {
    // Only ancestors count as a cycle: the same object logged twice side by
    // side is shown twice.
    seen.delete(value);
  }
}

/**
 * PAC-129 review: fetch, xhr and navigation breadcrumbs record request and
 * page URLs, and team and Manager routes put an address in the path. Every
 * URL-bearing field of a breadcrumb, and every value a console breadcrumb
 * logged (data.arguments), strings inside objects and Errors included
 * (PAC-145), is redacted before it is kept.
 */
export function redactBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  const data = breadcrumb.data;
  if (data) {
    const next: Record<string, unknown> = { ...data };
    for (const key of ["url", "from", "to"]) {
      if (typeof next[key] === "string") next[key] = redactEmailsInUrl(next[key] as string);
    }
    // PAC-139: console breadcrumbs keep the logged values in data.arguments.
    if (Array.isArray(next.arguments)) {
      next.arguments = next.arguments.map((arg: unknown) => redactConsoleArgument(arg));
    }
    breadcrumb = { ...breadcrumb, data: next };
  }
  if (typeof breadcrumb.message === "string") breadcrumb = { ...breadcrumb, message: redactEmailsInUrl(breadcrumb.message) };
  return breadcrumb;
}
