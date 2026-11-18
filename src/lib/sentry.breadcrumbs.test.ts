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

  it("is installed as beforeBreadcrumb", () => {
    initSentry({ VITE_SENTRY_DSN: "https://publickey@o1.ingest.example.test/1", MODE: "production" });
    expect(vi.mocked(Sentry.init).mock.calls[0][0]).toMatchObject({ beforeBreadcrumb: redactBreadcrumb });
  });
});
