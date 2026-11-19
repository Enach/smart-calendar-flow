/**
 * PAC-129 review minor 8: breadcrumbs never keep an address. Team and Manager
 * routes put one in the path (/api/teams/{id}/people/{email},
 * /api/manager/team/members/{email}), raw or percent-encoded.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/react", () => ({ init: vi.fn(), ErrorBoundary: ({ children }: { children: unknown }) => children }));

import * as Sentry from "@sentry/react";
import { CONSOLE_ARG_MAX_BREADTH, CONSOLE_ARG_MAX_DEPTH, initSentry, redactBreadcrumb, redactConsoleArgument, redactEmailsInUrl } from "./sentry";

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
    expect(outObj["[Truncated]"]).toBe(50);
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
      { "[email]": { email: "[email]" } },
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
