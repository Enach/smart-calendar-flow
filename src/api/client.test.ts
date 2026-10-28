import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The API sits on another origin than the page, as in a split deployment: the
// step-up URL must resolve against the API base, never the page (PAC-50 §9
// D-6). The base is read once at module load, so it is set before any import.
vi.hoisted(() => {
  (window as Window & { __API_BASE_URL__?: string }).__API_BASE_URL__ = "https://api.paceday.test/api";
});

import {
  ApiHttpError,
  apiErrorMessage,
  fetchSsoStepupOptions,
  setMockMode,
  ssoStepupRequired,
  ssoStepupStartUrl,
} from "./client";

// PAC-50 AC-22: a 403 carrying `stepup_url` is a typed step-up-required
// outcome, never an automatic navigation; any other 403 renders as before.

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/admin.directory.user.readonly";
const MS_SCOPES = ["Organization.Read.All", "RoleManagement.Read.Directory"];

function stepupBody(scopes: Record<string, string[]>, without: string[] = ["sso_configuration_writes"]) {
  return {
    error: "sso_write_requires_admin_stepup",
    stepup_url: "/api/admin/sso/stepup",
    stepup_scopes: scopes,
    without_stepup: without,
  };
}

const fetchMock = vi.fn<typeof fetch>();

describe("ssoStepupRequired (PAC-50 AC-22)", () => {
  it("yields the outcome with stepup_url resolved against the API base origin and the values as received", () => {
    const before = window.location.href;
    const out = ssoStepupRequired(new ApiHttpError(403, stepupBody({ google: [GOOGLE_SCOPE], microsoft: MS_SCOPES })));
    expect(out).toEqual({
      kind: "sso_stepup_required",
      stepupUrl: "https://api.paceday.test/api/admin/sso/stepup",
      stepupScopes: { google: [GOOGLE_SCOPE], microsoft: MS_SCOPES },
      withoutStepup: ["sso_configuration_writes"],
      providers: ["google", "microsoft"],
    });
    // Recognising the 403 navigates nowhere.
    expect(window.location.href).toBe(before);
  });

  it("offers only the providers that are keys of stepup_scopes, and none when it is empty", () => {
    expect(ssoStepupRequired(new ApiHttpError(403, stepupBody({ google: [GOOGLE_SCOPE] })))?.providers).toEqual(["google"]);
    expect(ssoStepupRequired(new ApiHttpError(403, stepupBody({ microsoft: MS_SCOPES })))?.providers).toEqual(["microsoft"]);
    expect(ssoStepupRequired(new ApiHttpError(403, stepupBody({})))?.providers).toEqual([]);
  });

  it("still recognises the 403 when without_stepup carries a code it does not know", () => {
    const out = ssoStepupRequired(new ApiHttpError(403, stepupBody({ google: [GOOGLE_SCOPE] }, ["sso_configuration_writes", "org_membership"])));
    expect(out?.withoutStepup).toEqual(["sso_configuration_writes", "org_membership"]);
  });

  it("leaves every other 403, and non-403 failures, as they render today", () => {
    for (const data of [
      { error: "provider_domain_mismatch" },
      { error: "sso_write_requires_fresh_login" },
      { error: "org membership required" },
      undefined,
    ]) {
      const e = new ApiHttpError(403, data);
      expect(ssoStepupRequired(e)).toBeNull();
    }
    expect(apiErrorMessage(new ApiHttpError(403, { error: "provider_domain_mismatch" }))).toBe("provider_domain_mismatch");
    expect(apiErrorMessage(new ApiHttpError(403))).toBe("You don't have permission to do this.");
    expect(ssoStepupRequired(new ApiHttpError(400, stepupBody({ google: [GOOGLE_SCOPE] })))).toBeNull();
    expect(ssoStepupRequired(new Error("boom"))).toBeNull();
  });

  it("does not recognise a body that breaks the contract (strict parse)", () => {
    expect(ssoStepupRequired(new ApiHttpError(403, { ...stepupBody({ google: [GOOGLE_SCOPE] }), extra: 1 }))).toBeNull();
    expect(ssoStepupRequired(new ApiHttpError(403, { ...stepupBody({}), stepup_url: "https://evil.test/x" }))).toBeNull();
  });

  it("explains the step-up 403 in words instead of its code", () => {
    expect(apiErrorMessage(new ApiHttpError(403, stepupBody({ google: [GOOGLE_SCOPE] })))).toMatch(/administrator account/);
  });

  it("builds the start URL with the chosen provider only", () => {
    const out = ssoStepupRequired(new ApiHttpError(403, stepupBody({ google: [GOOGLE_SCOPE] })));
    expect(out).not.toBeNull();
    expect(ssoStepupStartUrl(out!, "google")).toBe("https://api.paceday.test/api/admin/sso/stepup?provider=google");
  });
});

describe("fetchSsoStepupOptions (PAC-50 AC-25, contract revision 8)", () => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /api/admin/sso/stepup/options on the API base and returns the offer", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          stepup_url: "/api/admin/sso/stepup",
          stepup_scopes: { google: [GOOGLE_SCOPE] },
          without_stepup: ["sso_configuration_writes"],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const offer = await fetchSsoStepupOptions();
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.paceday.test/api/admin/sso/stepup/options");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("GET");
    expect(offer).toEqual({
      stepupUrl: "https://api.paceday.test/api/admin/sso/stepup",
      stepupScopes: { google: [GOOGLE_SCOPE] },
      withoutStepup: ["sso_configuration_writes"],
      providers: ["google"],
    });
  });

  it("surfaces the membership 403 as an ApiHttpError", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "org membership required" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(fetchSsoStepupOptions()).rejects.toMatchObject({ name: "ApiHttpError", status: 403 });
  });

  it("rejects a response with an undeclared property", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ stepup_url: "/api/admin/sso/stepup", stepup_scopes: {}, without_stepup: ["x"], breakglass: true }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(fetchSsoStepupOptions()).rejects.toThrow();
  });
});
