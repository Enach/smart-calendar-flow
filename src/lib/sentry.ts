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

// An email-shaped segment inside a URL path or query, raw or with "@"
// percent-encoded. Segment boundaries are / ? # & = and whitespace, so the
// rest of the URL (route shape, team id) stays readable. The first "@" (or
// "%40") of a segment that has at least one character before it and one after
// it decides: "ivan@mail.ru,react@1.2.3" is one address-bearing segment, not
// a package. The whole segment is replaced.
//
// PAC-145 review: this used to be one regex with a lazy local part, which is
// quadratic on a long run with no separator (200k characters took 24 s). The
// segments are now found with a greedy, linear match and each one is scanned
// once, with the same result.
const URL_SEGMENT = /[^/?#&=\s]+/g;

// PAC-145 review: the longest string redactEmailsInUrl looks at. Anything
// longer is cut here and marked, before any scan, so the work per string is
// bounded whatever is logged.
export const REDACT_MAX_STRING = 8192;
export const TRUNCATED_STRING_MARKER = "…[truncated]";

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
// Stripped with a loop from the end, not a regex: /[...]+$/ is quadratic on a
// long run of punctuation.
const TRAILING_PUNCTUATION = ".,:;!?)]'\"";

/** The domain part of an email-shaped segment, or null when it has none. */
function emailDomain(segment: string): string | null {
  for (let i = 1; i < segment.length; i++) {
    if (segment[i] === "@") {
      if (i + 1 < segment.length) return segment.slice(i + 1);
    } else if (segment[i] === "%" && segment[i + 1] === "4" && segment[i + 2] === "0" && i + 3 < segment.length) {
      return segment.slice(i + 3);
    }
  }
  return null;
}

/**
 * Replaces every email-shaped segment of a URL with "[email]". A string longer
 * than maxLength (REDACT_MAX_STRING; tests pass Infinity to time the scan
 * alone) is cut and marked first.
 */
export function redactEmailsInUrl(url: string, maxLength: number = REDACT_MAX_STRING): string {
  if (url.length > maxLength) url = url.slice(0, maxLength) + TRUNCATED_STRING_MARKER;
  return url.replace(URL_SEGMENT, (segment: string) => {
    const domain = emailDomain(segment);
    if (domain === null) return segment;
    let end = domain.length;
    while (end > 0 && TRAILING_PUNCTUATION.includes(domain[end - 1])) end--;
    const bare = domain.slice(0, end);
    const tail = domain.slice(end);
    if (PKG_VERSION.test(bare) || PKG_DIST_TAG.test(bare)) return segment;
    return `[email]${tail}`;
  });
}

// PAC-145: how far into a logged object redactConsoleArgument looks: Sentry's
// own normalizeDepth (3) plus the argument level. Anything deeper would not be
// shown by Sentry anyway.
export const CONSOLE_ARG_MAX_DEPTH = 4;
// PAC-145: how many entries of one object, array, Map or Set are kept.
export const CONSOLE_ARG_MAX_BREADTH = 100;
// PAC-145 review: the total number of values redactConsoleArgument visits for
// one argument, whatever its shape. Depth and breadth alone do not bound the
// work: shared objects multiply (a DAG of 6 objects x 16 keys took 3.5 s).
export const CONSOLE_ARG_NODE_BUDGET = 1500;
// PAC-145 review: how many arguments of one console call are kept.
export const CONSOLE_MAX_ARGUMENTS = 100;

const TRUNCATED = "[Truncated]";

interface RedactionWalk {
  nodes: number;
  ancestors: WeakSet<object>;
}

function constructorName(value: object): string {
  try {
    const name = (value as { constructor?: { name?: unknown } }).constructor?.name;
    return typeof name === "string" && name !== "" ? name : "Object";
  } catch {
    return "Object";
  }
}

function walk(value: unknown, depth: number, w: RedactionWalk): unknown {
  if (w.nodes >= CONSOLE_ARG_NODE_BUDGET) return TRUNCATED;
  w.nodes++;
  if (typeof value === "string") return redactEmailsInUrl(value);
  if (typeof value === "function") return "[Function]";
  if (value === null || typeof value !== "object") return value;
  if (w.ancestors.has(value)) return "[Circular]";
  if (depth >= CONSOLE_ARG_MAX_DEPTH) return TRUNCATED;
  // Summaries, never walked: each would cost work proportional to its size.
  if (typeof window !== "undefined" && value === window) return "[Window]";
  if (typeof Node !== "undefined" && value instanceof Node) return `[${value.nodeName}]`;
  if (ArrayBuffer.isView(value)) {
    const n = "length" in value && typeof value.length === "number" ? value.length : value.byteLength;
    return `[${constructorName(value)}(${n})]`;
  }
  if (value instanceof ArrayBuffer) return `[ArrayBuffer(${value.byteLength})]`;

  w.ancestors.add(value);
  try {
    const next = (v: unknown) => walk(v, depth + 1, w);
    // What JSON.stringify would use: a URL, a Date, anything with toJSON is
    // redacted as what it serialises to.
    let toJSON: unknown;
    try {
      toJSON = (value as { toJSON?: unknown }).toJSON;
    } catch {
      return "[Unreadable]";
    }
    if (typeof toJSON === "function" && !(value instanceof Error)) {
      try {
        return next(toJSON.call(value));
      } catch {
        return "[Unreadable]";
      }
    }
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        if (i >= CONSOLE_ARG_MAX_BREADTH || w.nodes >= CONSOLE_ARG_NODE_BUDGET) {
          out.push(TRUNCATED);
          break;
        }
        out.push(next(value[i]));
      }
      return out;
    }
    if (value instanceof Map) {
      // A list of [key, value] pairs, so keys that would stringify the same
      // (1 and "1", two objects) stay distinct. Iterated lazily: a huge Map
      // is never copied.
      const out: unknown[] = [];
      for (const [k, v] of value) {
        if (out.length >= CONSOLE_ARG_MAX_BREADTH || w.nodes >= CONSOLE_ARG_NODE_BUDGET) {
          out.push(TRUNCATED);
          break;
        }
        out.push([next(k), next(v)]);
      }
      return out;
    }
    if (value instanceof Set) {
      const out: unknown[] = [];
      for (const v of value) {
        if (out.length >= CONSOLE_ARG_MAX_BREADTH || w.nodes >= CONSOLE_ARG_NODE_BUDGET) {
          out.push(TRUNCATED);
          break;
        }
        out.push(next(v));
      }
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
    } else if (constructorName(value) !== "Object") {
      out.__type = constructorName(value);
    }
    // Own enumerable keys, read lazily with a counter: Object.keys would
    // allocate every key of a huge object first. Getters run here, eagerly, as
    // they would in Sentry's serialiser; the breadth bound and the node budget
    // bound how many of them run.
    let kept = 0;
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      if (kept >= CONSOLE_ARG_MAX_BREADTH || w.nodes >= CONSOLE_ARG_NODE_BUDGET) {
        out[TRUNCATED] = true;
        break;
      }
      kept++;
      let v: unknown;
      try {
        v = (value as Record<string, unknown>)[key];
      } catch {
        v = "[Unreadable]";
      }
      out[redactEmailsInUrl(key)] = next(v);
    }
    return out;
  } finally {
    // Only ancestors count as a cycle: the same object logged twice side by
    // side is shown twice (the node budget bounds what that can cost).
    w.ancestors.delete(value);
  }
}

/**
 * PAC-145 test seam: redactConsoleArgument's result and the number of values
 * it visited, which never exceeds CONSOLE_ARG_NODE_BUDGET.
 */
export function redactConsoleArgumentCounted(value: unknown): { value: unknown; nodes: number } {
  const w: RedactionWalk = { nodes: 0, ancestors: new WeakSet() };
  return { value: walk(value, 0, w), nodes: w.nodes };
}

/**
 * PAC-145: a console argument with every string in it redacted: values and
 * keys of plain objects, array items, Map and Set entries, an Error's name,
 * message, stack, cause and own properties, and whatever a toJSON method
 * returns. The result is a fresh plain value; the logged object is never
 * mutated.
 *
 * The work is bounded per argument: at most CONSOLE_ARG_NODE_BUDGET values
 * visited, CONSOLE_ARG_MAX_DEPTH levels, CONSOLE_ARG_MAX_BREADTH entries per
 * container, REDACT_MAX_STRING characters per string, each scanned in linear
 * time. Typed arrays, buffers, DOM nodes and window are summarised, never
 * walked. Whatever a bound cuts off becomes "[Truncated]" (a cut string ends
 * in "…[truncated]"), never passed through unread. A cycle becomes
 * "[Circular]", a function "[Function]", a throwing getter or toJSON
 * "[Unreadable]". Getters and toJSON methods are invoked, eagerly, as Sentry's
 * own serialiser would; the bounds above limit how many run.
 */
export function redactConsoleArgument(value: unknown): unknown {
  return redactConsoleArgumentCounted(value).value;
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
      const args = next.arguments as unknown[];
      const kept = args.slice(0, CONSOLE_MAX_ARGUMENTS).map((arg: unknown) => redactConsoleArgument(arg));
      if (args.length > CONSOLE_MAX_ARGUMENTS) kept.push(TRUNCATED);
      next.arguments = kept;
    }
    breadcrumb = { ...breadcrumb, data: next };
  }
  if (typeof breadcrumb.message === "string") breadcrumb = { ...breadcrumb, message: redactEmailsInUrl(breadcrumb.message) };
  return breadcrumb;
}
