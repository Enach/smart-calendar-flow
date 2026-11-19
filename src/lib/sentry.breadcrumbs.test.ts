/**
 * PAC-129 review minor 8: breadcrumbs never keep an address. Team and Manager
 * routes put one in the path (/api/teams/{id}/people/{email},
 * /api/manager/team/members/{email}), raw or percent-encoded.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/react", () => ({ init: vi.fn(), ErrorBoundary: ({ children }: { children: unknown }) => children }));

import * as Sentry from "@sentry/react";
import { initSentry, redactBreadcrumb, redactEmailsInUrl } from "./sentry";

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
    expect(out.data!.arguments[3]).toBe(err);
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
