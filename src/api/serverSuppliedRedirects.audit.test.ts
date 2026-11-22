/**
 * Read-only security audit of 2026-11-22, follow-up item 1.
 *
 * Two values out of a response body reach `window.location` through `apiUrl`:
 * the `redirect_url` of POST /api/auth/detect (src/components/auth/
 * AuthDialog.tsx) and the `stepup_url` of the SSO step-up offer, which the
 * step-up screens hand to `window.location.assign`. Both are paths on the API
 * origin by contract. Only one of the two was actually open: `stepup_url` is
 * pinned to a single literal by the schema every answer carrying it is parsed
 * with, while `redirect_url` is `z.string().optional()` and `AuthDialog` reads
 * the detect answer through a bare cast, so nothing at all stood between that
 * body and the navigation.
 *
 * `safeLinkUrl` is not the control for either: it refuses every relative URL,
 * and a relative URL is all a correct value here ever is. `apiPathUrl` holds
 * `redirect_url` to being a path instead — the rule
 * `AuthDialog.resolveRedirect` already applies to the `?redirect=` query
 * parameter.
 *
 * No `__API_BASE_URL__` is stubbed in this file on purpose: an un-injected API
 * host is what `bun run dev` and the local Docker image give, and it is exactly
 * where the gap bites, because an empty prefix leaves a `//host` value
 * protocol-relative. Neither of those two environments sends a CSP.
 */
import { describe, expect, it } from "vitest";

import { ApiHttpError, ssoStepupRequired } from "./client";
import { apiPathUrl, apiUrl, API_BASE } from "@/lib/api";

const PAGE = "https://app.paceday.test";

/** Shapes an authority rather than a path: the values that must be refused. */
const NOT_PATHS = [
  "//evil.example/signin",
  "/\\evil.example/signin",
  "https://evil.example/signin",
  "evil.example/signin",
  "javascript:alert(1)",
  "",
];

describe("a path out of a response body cannot become a navigation off-origin", () => {
  it("the deployment under test is the one with no API host injected", () => {
    // Without this the concatenation below cannot produce an authority, and
    // the test would pass for the wrong reason.
    expect(API_BASE).toBe("");
  });

  it("is why `apiUrl` alone was not enough: a `//host` value stays protocol-relative", () => {
    expect(apiUrl("//evil.example/signin")).toBe("//evil.example/signin");
    // Which is what the browser would then resolve it to.
    expect(new URL("//evil.example/signin", PAGE).origin).toBe("https://evil.example");
  });

  it.each(NOT_PATHS)("apiPathUrl refuses %j", (value) => {
    expect(apiPathUrl(value)).toBeNull();
  });

  it("passes an ordinary path through exactly as apiUrl does", () => {
    for (const path of ["/api/auth/sso/acme.test", "/api/admin/sso/stepup", "/a"]) {
      expect(apiPathUrl(path)).toBe(apiUrl(path));
      expect(new URL(apiPathUrl(path)!, PAGE).origin).toBe(PAGE);
    }
  });
});

/**
 * The step-up offer is the other value that reaches `window.location.assign`
 * out of a response body, and it needs no `apiPathUrl` of its own: the
 * contract types `stepup_url` as `SsoStepupUrl`, which is the single literal
 * `"/api/admin/sso/stepup"`, and every answer carrying one is parsed with that
 * schema before `toOffer` sees it. These lock that structural reason in place,
 * so the day the contract widens `stepup_url` to a free string the gap does
 * not reopen in silence.
 */
describe("an SSO step-up offer can only ever name its one contract path", () => {
  const body = (stepupUrl: string) => ({
    error: "sso_write_requires_admin_stepup",
    stepup_url: stepupUrl,
    stepup_scopes: { google: ["https://www.googleapis.com/auth/admin.directory.user.readonly"] },
    without_stepup: ["sso_configuration_writes"],
  });

  it("is not the step-up outcome at all when stepup_url is not that path", () => {
    for (const bad of [...NOT_PATHS, "/api/admin/sso/stepup/../../evil"]) {
      // Not recognised, so the caller renders the 403 as an ordinary failure
      // and no screen offers a step-up to navigate to.
      expect(ssoStepupRequired(new ApiHttpError(403, body(bad)))).toBeNull();
    }
  });

  it("resolves the contract path against the API origin and offers its provider", () => {
    const out = ssoStepupRequired(new ApiHttpError(403, body("/api/admin/sso/stepup")));
    expect(out?.providers).toEqual(["google"]);
    expect(out?.stepupUrl).toBe(apiUrl("/api/admin/sso/stepup"));
    expect(new URL(out!.stepupUrl, PAGE).origin).toBe(PAGE);
  });
});
