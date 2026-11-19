/**
 * PAC-129 review minor 8: breadcrumbs never keep an address. Team and Manager
 * routes put one in the path (/api/teams/{id}/people/{email},
 * /api/manager/team/members/{email}), raw or percent-encoded.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/react", () => ({ init: vi.fn(), ErrorBoundary: ({ children }: { children: unknown }) => children }));

import * as Sentry from "@sentry/react";
import {
  CONSOLE_ARG_MAX_BREADTH,
  CONSOLE_ARG_MAX_DEPTH,
  CONSOLE_CALL_CHAR_BUDGET,
  CONSOLE_CALL_NODE_BUDGET,
  CONSOLE_MAX_ARGUMENTS,
  REDACT_MAX_STRING,
  TRUNCATED_STRING_MARKER,
  initSentry,
  redactBreadcrumb,
  redactConsoleArgument,
  redactConsoleArgumentCounted,
  redactConsoleArgumentsCounted,
  redactEmailsInUrl,
} from "./sentry";

describe("redactBreadcrumb", () => {
  it("redacts %40-encoded and raw addresses in fetch and xhr URLs", () => {
    const out = redactBreadcrumb({
      category: "fetch",
      data: { method: "DELETE", url: "/api/teams/11111111-1111-4111-8111-111111111111/people/pat%2Bx%40ext.example", status_code: 204 },
    });
    expect(out.data).toEqual({ method: "DELETE", url: "/api/teams/11111111-1111-4111-8111-111111111111/people/[email]", status_code: 204 });
    expect(redactBreadcrumb({ category: "xhr", data: { url: "/api/manager/team/members/sam@acme.example/schedule?team_id=t1" } }).data!.url).toBe(
      "/api/manager/team/members/[email]/schedule?team_id=t1",
    );
  });

  it("redacts navigation from/to and the query string, and leaves address-free URLs alone", () => {
    const out = redactBreadcrumb({ category: "navigation", data: { from: "/team?tab=find", to: "/app?attendees=a%40b.example,c@d.example&duration=30" } });
    expect(out.data).toEqual({ from: "/team?tab=find", to: "/app?attendees=[email]&duration=30" });
    expect(redactEmailsInUrl("/api/teams/t1/availability?date=2030-03-04")).toBe("/api/teams/t1/availability?date=2030-03-04");
  });

  it("PAC-139: redacts the string arguments of a console breadcrumb and keeps the others", () => {
    const err = { name: "Error" };
    const out = redactBreadcrumb({
      category: "console",
      level: "error",
      message: "remove failed for sam@acme.example 404",
      data: { logger: "console", arguments: ["remove failed for", "sam@acme.example", 404, err, "/api/teams/t1/people/pat%40ext.example"] },
    });
    expect(out.message).toBe("remove failed for [email] 404");
    expect(out.data).toEqual({ logger: "console", arguments: ["remove failed for", "[email]", 404, err, "/api/teams/t1/people/[email]"] });
    // PAC-145: objects are redacted copies, never the logged object itself.
    expect(out.data!.arguments[3]).not.toBe(err);
  });

  it("PAC-139: an address followed by punctuation in free text is still redacted", () => {
    expect(redactEmailsInUrl("failed for sam@acme.example: 500")).toBe("failed for [email]: 500");
    expect(redactEmailsInUrl("ask Sam.Lee@Mail.Acme.Example.")).toBe("ask [email].");
  });

  it("PAC-139 review: redacts IDN, Unicode, percent-encoded and unusual domains", () => {
    const cases = [
      "user@example.xn--p1ai",
      "ivan%40mail.xn--p1ai",
      "ivan@почта.рф",
      "user@例え.テスト",
      "ivan%40%D0%BF%D0%BE%D1%87%D1%82%D0%B0.%D1%80%D1%84",
      "sam%40acme%2Ecom",
      "sam@acme.com-backup",
      "ivan@mail.ru,react@1.2.3",
      "react@1.2.3,ivan@mail.ru",
      "user@localhost",
      // A domain that starts with a digit and a hyphen is not a version.
      "x@7-eleven.com",
      "x@1-800-flowers.com",
      "x@3-dsystems.com",
      "x@2.5-cms.co",
      "x@1+foo.com",
    ];
    for (const addr of cases) {
      expect(redactEmailsInUrl(`/api/teams/t1/people/${addr}?x=1`)).toBe("/api/teams/t1/people/[email]?x=1");
      expect(redactEmailsInUrl(`/app?attendees=${addr}&duration=30`)).toBe("/app?attendees=[email]&duration=30");
      expect(redactBreadcrumb({ category: "console", data: { arguments: [addr] } }).data!.arguments).toEqual(["[email]"]);
    }
  });

  it("PAC-139: leaves pkg@version URL segments alone", () => {
    for (const url of [
      "https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js",
      "https://unpkg.com/@sentry/react@8.1.0/build/index.js",
      "https://esm.sh/zod@3.23.8-beta.1?target=es2022",
      "https://unpkg.com/lodash@latest/lodash.js",
      "https://cdn.example/npm/react@18/index.js",
      "https://cdn.example/npm/pkg@1.2.3/index.js",
      "https://cdn.example/npm/pkg@18.3.1-beta/index.js",
      "https://cdn.example/npm/pkg@v2.0.0+build.5/index.js",
      "https://cdn.example/npm/pkg%401.2.3/index.js",
    ]) {
      expect(redactEmailsInUrl(url)).toBe(url);
      expect(redactBreadcrumb({ category: "fetch", data: { url } }).data!.url).toBe(url);
    }
  });

  it("is installed as beforeBreadcrumb", () => {
    initSentry({ VITE_SENTRY_DSN: "https://publickey@o1.ingest.example.test/1", MODE: "production" });
    expect(vi.mocked(Sentry.init).mock.calls[0][0]).toMatchObject({ beforeBreadcrumb: redactBreadcrumb });
  });
});

describe("PAC-145: console breadcrumb object and Error arguments", () => {
  const consoleCrumb = (...args: unknown[]) =>
    redactBreadcrumb({ category: "console", level: "error", data: { logger: "console", arguments: args } }).data!.arguments as unknown[];
  // Every address these tests log is at acme.example or ext.example. (A bare
  // "@" is not a leak: stack frames carry scoped package paths, /@vitest/.)
  const leaks = (v: unknown) => /(?:@|%40)(?:acme|ext)\.example/i.test(JSON.stringify(v));

  it("redacts an address held in an object, console.error({email})", () => {
    const email = "sam@acme.example";
    expect(consoleCrumb({ email })).toEqual([{ email: "[email]" }]);
  });

  it("redacts nested values, array items and object keys", () => {
    const out = consoleCrumb({
      team: { id: "t1", members: [{ email: "pat%40ext.example", role: "member" }, "sam@acme.example"] },
      byEmail: { "lee@acme.example": { count: 2 } },
      status: 404,
      ok: false,
      none: null,
    });
    expect(out).toEqual([
      {
        team: { id: "t1", members: [{ email: "[email]", role: "member" }, "[email]"] },
        byEmail: { "[email]": { count: 2 } },
        status: 404,
        ok: false,
        none: null,
      },
    ]);
  });

  it("redacts an Error's message, stack, cause and own properties", () => {
    // `cause` set by hand: the app's TS lib predates the ErrorOptions argument.
    const err = Object.assign(new Error("remove failed for sam@acme.example"), {
      cause: new Error("404 for pat@ext.example"),
      email: "lee@acme.example",
    });
    const [out] = consoleCrumb(err) as [Record<string, unknown>];
    expect(out.name).toBe("Error");
    expect(out.message).toBe("remove failed for [email]");
    expect(out.email).toBe("[email]");
    expect((out.cause as Record<string, unknown>).message).toBe("404 for [email]");
    expect(typeof out.stack).toBe("string");
    expect(leaks(out)).toBe(false);
  });

  it("is cycle-safe and shows a repeated (non-cyclic) object twice", () => {
    const a: Record<string, unknown> = { email: "sam@acme.example" };
    a.self = a;
    const shared = { email: "pat@ext.example" };
    const [out, out2] = consoleCrumb(a, { x: shared, y: shared });
    expect(out).toEqual({ email: "[email]", self: "[Circular]" });
    expect(out2).toEqual({ x: { email: "[email]" }, y: { email: "[email]" } });
  });

  it("stops at the depth bound, and what it drops is replaced, never passed through", () => {
    let deep: Record<string, unknown> = { email: "sam@acme.example" };
    for (let i = 0; i < 40; i++) deep = { child: deep, note: `level ${i} for lee@acme.example` };
    const [out] = consoleCrumb(deep);
    expect(leaks(out)).toBe(false);
    let node = out as Record<string, unknown>;
    for (let i = 0; i < CONSOLE_ARG_MAX_DEPTH - 1; i++) node = node.child as Record<string, unknown>;
    expect(node.child).toBe("[Truncated]");
  });

  it("stops at the breadth bound", () => {
    const big = Array.from({ length: CONSOLE_ARG_MAX_BREADTH + 50 }, (_, i) => `u${i}@acme.example`);
    const [out] = consoleCrumb(big) as [unknown[]];
    expect(out).toHaveLength(CONSOLE_ARG_MAX_BREADTH + 1);
    expect(out[CONSOLE_ARG_MAX_BREADTH]).toBe("[Truncated]");
    expect(leaks(out)).toBe(false);
    const wide = Object.fromEntries(big.map((e, i) => [`k${i}`, e]));
    const [outObj] = consoleCrumb(wide) as [Record<string, unknown>];
    expect(outObj["[Truncated]"]).toBe(true);
    expect(Object.keys(outObj)).toHaveLength(CONSOLE_ARG_MAX_BREADTH + 1);
    expect(leaks(outObj)).toBe(false);
  });

  it("handles Map, Set, Date, functions, class instances and throwing getters", () => {
    class Member {
      constructor(public email: string) {}
    }
    const throwing = Object.defineProperty({}, "boom", {
      enumerable: true,
      get() {
        throw new Error("no");
      },
    });
    const out = consoleCrumb(
      new Map([["sam@acme.example", { email: "pat@ext.example" }]]),
      new Set(["lee@acme.example"]),
      new Date("2030-03-04T00:00:00Z"),
      function send() {},
      new Member("kim@acme.example"),
      throwing,
    );
    expect(out).toEqual([
      [["[email]", { email: "[email]" }]],
      ["[email]"],
      "2030-03-04T00:00:00.000Z",
      "[Function]",
      { __type: "Member", email: "[email]" },
      { boom: "[Unreadable]" },
    ]);
  });

  it("does not mutate the logged value", () => {
    const logged = { email: "sam@acme.example", nested: { to: ["pat@ext.example"] } };
    const before = JSON.stringify(logged);
    consoleCrumb(logged);
    expect(JSON.stringify(logged)).toBe(before);
  });

  it("leaves primitives as they are", () => {
    expect([1, true, null, undefined, 10n].map((v) => redactConsoleArgument(v))).toEqual([1, true, null, undefined, 10n]);
  });
});

describe("PAC-145 review: bounded work", () => {
  it("visits at most CONSOLE_CALL_NODE_BUDGET values of a DAG of shared objects", () => {
    // 6 levels x 16 keys all pointing at the next level: 16^6 paths, and
    // 3.5 s before the budget.
    let level: Record<string, unknown> = { email: "sam@acme.example" };
    for (let d = 0; d < 6; d++) {
      const next: Record<string, unknown> = {};
      for (let k = 0; k < 16; k++) next[`k${k}`] = level;
      level = next;
    }
    const { value, nodes } = redactConsoleArgumentCounted(level);
    expect(nodes).toBeLessThanOrEqual(CONSOLE_CALL_NODE_BUDGET);
    expect(nodes).toBe(CONSOLE_CALL_NODE_BUDGET); // the budget, not the shape, stopped it
    expect(JSON.stringify(value)).toContain("[Truncated]");
    expect(JSON.stringify(value)).not.toContain("acme.example");
  });

  it("never exceeds the budget on wide objects, arrays, Maps and Sets", () => {
    const wide = Array.from({ length: 50 }, () => Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, `u${i}@acme.example`])));
    for (const v of [wide, new Map(wide.map((o, i) => [i, o])), new Set(wide), { a: wide, b: wide }]) {
      const { value, nodes } = redactConsoleArgumentCounted(v);
      expect(nodes).toBeLessThanOrEqual(CONSOLE_CALL_NODE_BUDGET);
      expect(JSON.stringify(value)).not.toContain("acme.example");
    }
  });

  it("keeps the depth within Sentry's normalizeDepth plus the argument level", () => {
    expect(CONSOLE_ARG_MAX_DEPTH).toBeLessThanOrEqual(4);
    expect(redactConsoleArgument({ a: { b: { c: { d: { e: 1 } } } } })).toEqual({ a: { b: { c: { d: "[Truncated]" } } } });
  });

  it("summarises a huge typed array or buffer without walking it", () => {
    const bytes = new Uint8Array(5e6);
    const { value, nodes } = redactConsoleArgumentCounted(bytes);
    expect(value).toBe("[Uint8Array(5000000)]");
    expect(nodes).toBe(1);
    expect(redactConsoleArgument(new Float64Array(3))).toBe("[Float64Array(3)]");
    expect(redactConsoleArgument(new DataView(new ArrayBuffer(8)))).toBe("[DataView(8)]");
    expect(redactConsoleArgument(new ArrayBuffer(16))).toBe("[ArrayBuffer(16)]");
    expect(redactConsoleArgument({ payload: bytes })).toEqual({ payload: "[Uint8Array(5000000)]" });
  });

  it("short-circuits window and document", () => {
    expect(redactConsoleArgumentCounted(window)).toEqual({ value: "[Window]", nodes: 1 });
    expect(redactConsoleArgumentCounted(document)).toEqual({ value: "[#document]", nodes: 1 });
    const el = document.createElement("div");
    el.title = "sam@acme.example";
    expect(redactConsoleArgument({ el })).toEqual({ el: "[DIV]" });
  });

  it("reads keys lazily: a huge object costs the breadth bound, not its size", () => {
    const huge: Record<string, string> = {};
    for (let i = 0; i < 200_000; i++) huge[`k${i}`] = "x";
    let reads = 0;
    const counted = new Proxy(huge, {
      get(target, key) {
        reads++;
        return Reflect.get(target, key);
      },
    });
    const { value, nodes } = redactConsoleArgumentCounted(counted);
    expect((value as Record<string, unknown>)["[Truncated]"]).toBe(true);
    expect(nodes).toBeLessThanOrEqual(CONSOLE_ARG_MAX_BREADTH + 1);
    // toJSON probe + the kept keys; never every key.
    expect(reads).toBeLessThanOrEqual(CONSOLE_ARG_MAX_BREADTH + 2);
  });

  it("runs getters eagerly, but no more of them than the bounds allow", () => {
    let calls = 0;
    const o: Record<string, unknown> = {};
    for (let i = 0; i < 1000; i++) {
      Object.defineProperty(o, `g${i}`, {
        enumerable: true,
        get() {
          calls++;
          return "sam@acme.example";
        },
      });
    }
    const out = redactConsoleArgument(o) as Record<string, unknown>;
    expect(calls).toBe(CONSOLE_ARG_MAX_BREADTH);
    expect(out.g0).toBe("[email]");
  });

  it("keeps at most CONSOLE_MAX_ARGUMENTS arguments of one console call", () => {
    const args = Array.from({ length: CONSOLE_MAX_ARGUMENTS + 5 }, () => "sam@acme.example");
    const out = redactBreadcrumb({ category: "console", data: { arguments: args } }).data!.arguments as unknown[];
    expect(out).toHaveLength(CONSOLE_MAX_ARGUMENTS + 1);
    expect(out[CONSOLE_MAX_ARGUMENTS]).toBe("[Truncated]");
    expect(out[0]).toBe("[email]");
  });
});

describe("PAC-145 review: toJSON, Map keys, Set truncation", () => {
  it("redacts what toJSON returns (a URL, a custom type) and survives a throwing toJSON", () => {
    const url = new URL("https://app.example/api/teams/t1/people/sam%40acme.example?invite=pat@ext.example");
    expect(redactConsoleArgument(url)).toBe("https://app.example/api/teams/t1/people/[email]?invite=[email]");
    expect(redactConsoleArgument({ at: url })).toEqual({ at: "https://app.example/api/teams/t1/people/[email]?invite=[email]" });
    expect(redactConsoleArgument({ toJSON: () => ({ owner: "lee@acme.example" }) })).toEqual({ owner: "[email]" });
    expect(
      redactConsoleArgument({
        toJSON() {
          throw new Error("no");
        },
      }),
    ).toBe("[Unreadable]");
    const self = { toJSON: () => self };
    expect(redactConsoleArgument(self)).toBe("[Circular]");
  });

  it("keeps Map entries distinct when their keys would collide", () => {
    const a = { id: 1 };
    const b = { id: 2 };
    const out = redactConsoleArgument(
      new Map<unknown, unknown>([
        [1, "one"],
        ["1", "sam@acme.example"],
        [a, "a"],
        [b, "b"],
      ]),
    );
    expect(out).toEqual([
      [1, "one"],
      ["1", "[email]"],
      [{ id: 1 }, "a"],
      [{ id: 2 }, "b"],
    ]);
  });

  it("truncates a huge Set and Map without copying them", () => {
    const set = new Set(Array.from({ length: 100_000 }, (_, i) => `u${i}@acme.example`));
    const outSet = redactConsoleArgument(set) as unknown[];
    expect(outSet).toHaveLength(CONSOLE_ARG_MAX_BREADTH + 1);
    expect(outSet[CONSOLE_ARG_MAX_BREADTH]).toBe("[Truncated]");
    expect(JSON.stringify(outSet)).not.toContain("acme.example");
    const map = new Map(Array.from(set, (v, i) => [i, v]));
    const outMap = redactConsoleArgument(map) as unknown[];
    expect(outMap).toHaveLength(CONSOLE_ARG_MAX_BREADTH + 1);
    expect(outMap[CONSOLE_ARG_MAX_BREADTH]).toBe("[Truncated]");
  });
});

describe("PAC-145 review: string redaction is linear and capped", () => {
  // The pre-PAC-145 implementation, kept as the reference: the rewrite must
  // agree with it on every string it can process in reasonable time.
  const OLD_EMAIL_IN_URL = /[^/?#&=\s]+?(?:@|%40)([^/?#&=\s]+)/gi;
  const OLD_PKG_VERSION = /^v?\d+(?:\.\d+)*$|^v?\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?(?:\+[0-9a-z.-]+)?$/i;
  const OLD_PKG_DIST_TAG = /^(?:latest|next|beta|alpha|canary|rc|stable|dev|experimental|insiders|nightly)$/i;
  const OLD_TRAILING = /[.,:;!?)\]'"]+$/;
  const oldRedact = (url: string) =>
    url.replace(OLD_EMAIL_IN_URL, (match: string, domain: string) => {
      const tail = OLD_TRAILING.exec(domain)?.[0] ?? "";
      const bare = domain.slice(0, domain.length - tail.length);
      if (OLD_PKG_VERSION.test(bare) || OLD_PKG_DIST_TAG.test(bare)) return match;
      return `[email]${tail}`;
    });

  it("agrees with the previous regex implementation", () => {
    const corpus = [
      "/api/teams/t1/people/sam@acme.example?x=1",
      "/api/teams/t1/people/pat%2Bx%40ext.example",
      "/app?attendees=a%40b.example,c@d.example&duration=30",
      "failed for sam@acme.example: 500",
      "ask Sam.Lee@Mail.Acme.Example.",
      "ivan@mail.ru,react@1.2.3",
      "react@1.2.3,ivan@mail.ru",
      "@fs/C:/x/@vitest/runner",
      "@@x",
      "a@",
      "a@@b",
      "a%40",
      "a%4",
      "%40x",
      "a%40%40b",
      "x@...",
      "x@a.b...)\"",
      "sam%40acme%2Ecom",
      "https://unpkg.com/@sentry/react@8.1.0/build/index.js",
      "https://unpkg.com/lodash@latest/lodash.js",
      "pkg@v2.0.0+build.5 and user@localhost!",
      "x@7-eleven.com x@2.5-cms.co x@1+foo.com",
      "ivan@почта.рф user@例え.テスト",
      "tab\tsep@a.b\nnext@c.d",
      "",
      "plain text with no address",
    ];
    for (const s of corpus) expect(redactEmailsInUrl(s), s).toBe(oldRedact(s));
  });

  it("scans in linear time even without the cap (200k characters took 24 s before)", () => {
    // Cap off, so this times the scan itself: linear is milliseconds, the old
    // quadratic regex is tens of seconds. 2 s leaves room for a slow machine.
    const run = "a".repeat(200_000);
    const punct = "x@a" + ".".repeat(200_000) + "b";
    const t0 = performance.now();
    expect(redactEmailsInUrl(run + " sam@acme.example", Infinity)).toBe(run + " [email]");
    expect(redactEmailsInUrl(punct, Infinity)).toBe("[email]");
    expect(redactEmailsInUrl("%40".repeat(70_000) + "a", Infinity)).toBe("[email]");
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it("is fast on near-cap strings with the cap on", () => {
    // Under the cap the scan itself must be linear: a near-cap run is the
    // worst case left.
    const nearCap = "a".repeat(REDACT_MAX_STRING - 20) + " x@acme.example";
    const nearCapPunct = "x@a" + ".".repeat(REDACT_MAX_STRING - 10) + "b";
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      redactEmailsInUrl(nearCap);
      redactEmailsInUrl(nearCapPunct);
    }
    // 40 near-cap strings: milliseconds when linear, many seconds when
    // quadratic. The 2 s ceiling leaves room for a slow CI machine.
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(redactEmailsInUrl(nearCap)).toBe("a".repeat(REDACT_MAX_STRING - 20) + " [email]");
  });

  it("cuts a string longer than REDACT_MAX_STRING at a segment boundary, and marks the cut", () => {
    const long = "sam@acme.example " + "b".repeat(200_000);
    expect(redactEmailsInUrl(long)).toBe("[email] " + TRUNCATED_STRING_MARKER);
    const fits = "x".repeat(REDACT_MAX_STRING);
    expect(redactEmailsInUrl(fits)).toBe(fits);
  });

  it("never leaves part of an address that straddles the cut", () => {
    for (const pad of [8180, 8185, REDACT_MAX_STRING - 6, REDACT_MAX_STRING - 1]) {
      const straddle = "x".repeat(pad) + " jean.dupont@acme.example";
      const out = redactEmailsInUrl(straddle);
      // The partial last segment is dropped, not kept half-visible.
      expect(out, `pad ${pad}`).toBe("x".repeat(pad) + " " + TRUNCATED_STRING_MARKER);
      expect(out).not.toContain("jean");
    }
    // The limit falls exactly at the end of the address: it is whole, and
    // redacted.
    const exact = "x".repeat(REDACT_MAX_STRING - 25) + " jean.dupont@acme.example" + " tail";
    expect(redactEmailsInUrl(exact)).toBe("x".repeat(REDACT_MAX_STRING - 25) + " [email]" + TRUNCATED_STRING_MARKER);
    // In a URL, the boundaries are the path and query separators.
    const url = "/api/teams/t1/people/" + "q".repeat(REDACT_MAX_STRING - 30) + "?to=jean.dupont@acme.example";
    expect(redactEmailsInUrl(url)).not.toContain("jean");
  });

  it("replaces a string with no segment boundary within the limit entirely", () => {
    expect(redactEmailsInUrl("a".repeat(REDACT_MAX_STRING + 1))).toBe("[Truncated]");
    expect(redactEmailsInUrl("jean.dupont@acme.example" + "z".repeat(20_000))).toBe("[Truncated]");
  });
});

describe("PAC-145 re-review: one budget per console call", () => {
  it("shares the node and character budgets across all the arguments of a call", () => {
    // 100 arguments x 1500 strings of 100k characters: 20 s with a
    // per-argument budget.
    const big = "y".repeat(100_000) + " sam@acme.example";
    const args = Array.from({ length: 100 }, () => Array.from({ length: 1500 }, () => big));
    const { value, nodes, chars } = redactConsoleArgumentsCounted(args);
    expect(nodes).toBeLessThanOrEqual(CONSOLE_CALL_NODE_BUDGET);
    expect(chars).toBeLessThanOrEqual(CONSOLE_CALL_CHAR_BUDGET);
    expect(value).toHaveLength(100);
    expect(value.at(-1)).toBe("[Truncated]"); // the budget was spent before the last argument
    expect(JSON.stringify(value)).not.toContain("acme.example");
  });

  it("spends the node budget once per call, not once per argument", () => {
    const wide = Array.from({ length: 100 }, (_, i) => i);
    const { value, nodes } = redactConsoleArgumentsCounted(Array.from({ length: 50 }, () => wide));
    expect(nodes).toBe(CONSOLE_CALL_NODE_BUDGET);
    expect(value.at(-1)).toBe("[Truncated]");
  });

  it("redactBreadcrumb uses the shared budgets", () => {
    const big = "sam@acme.example " + "y".repeat(50_000);
    const out = redactBreadcrumb({ category: "console", data: { arguments: Array.from({ length: 20 }, () => big) } }).data!.arguments as unknown[];
    const scanned = out.filter((a) => a !== "[Truncated]");
    // 64k characters of budget, 8192 per string at most: 8 strings scanned.
    expect(scanned.length).toBe(CONSOLE_CALL_CHAR_BUDGET / REDACT_MAX_STRING);
    expect(JSON.stringify(out)).not.toContain("acme.example");
  });
});

describe("PAC-145 re-review: a revoked Proxy", () => {
  it("costs only its own value, not the argument or the breadcrumb", () => {
    const { proxy, revoke } = Proxy.revocable({ email: "sam@acme.example" }, {});
    revoke();
    const out = redactBreadcrumb({
      category: "console",
      data: { arguments: ["failed for pat@ext.example", proxy, { ok: "lee@acme.example", bad: proxy }] },
    }).data!.arguments;
    expect(out).toEqual(["failed for [email]", "[Unreadable]", { ok: "[email]", bad: "[Unreadable]" }]);
  });
});
