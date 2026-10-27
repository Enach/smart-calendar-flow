import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api, describeAuditEntry, disconnectNotice, setMockMode } from "./client";

// PAC-67 (web half): the two disconnects answer ProviderDisconnectResult, the
// client says what became of the grant at the provider (spec D-2, AC-15,
// AC-17), and the activity log words the three connection kinds.

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function requestPath(input: RequestInfo | URL): string {
  return new URL(String(input), window.location.origin).pathname;
}

describe("provider disconnects (PAC-67)", () => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs /api/conference/zoom/disconnect and returns the result", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ provider: "zoom", revocation: "unconfirmed" }));
    await expect(api.zoomDisconnect()).resolves.toEqual({ provider: "zoom", revocation: "unconfirmed" });
    expect(requestPath(fetchMock.mock.calls[0][0])).toBe("/api/conference/zoom/disconnect");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  });

  it("POSTs /api/auth/microsoft/disconnect and returns the result", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ provider: "outlook", revocation: "not_offered" }));
    await expect(api.microsoftDisconnect()).resolves.toEqual({ provider: "outlook", revocation: "not_offered" });
    expect(requestPath(fetchMock.mock.calls[0][0])).toBe("/api/auth/microsoft/disconnect");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  });

  it("rejects an answer outside the contract instead of guessing", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ provider: "zoom", revocation: "maybe" }));
    await expect(api.zoomDisconnect()).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(jsonResponse({ provider: "zoom", revocation: "confirmed", extra: 1 }));
    await expect(api.zoomDisconnect()).rejects.toThrow();
  });

  it("surfaces the server's error on a failed disconnect", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "internal error" }, 500));
    await expect(api.microsoftDisconnect()).rejects.toMatchObject({ status: 500 });
  });

  it("answers in preview mode without a request", async () => {
    setMockMode(true);
    await expect(api.zoomDisconnect()).resolves.toEqual({ provider: "zoom", revocation: "confirmed" });
    await expect(api.microsoftDisconnect()).resolves.toEqual({ provider: "outlook", revocation: "not_offered" });
    expect(fetchMock).not.toHaveBeenCalled();
    setMockMode(false);
  });
});

describe("disconnectNotice", () => {
  it("never reports plain success when the revocation is not confirmed", () => {
    const n = disconnectNotice({ provider: "zoom", revocation: "unconfirmed" });
    expect(n.kind).toBe("info");
    expect(n.message).toMatch(/Zoom did not confirm/i);
    expect(n.message).toMatch(/remove Paceday/i);
  });

  it("tells an Outlook user where the grant can be removed", () => {
    const n = disconnectNotice({ provider: "outlook", revocation: "not_offered" });
    expect(n.kind).toBe("info");
    expect(n.message).toMatch(/Microsoft account/i);
  });

  it("is a success when Zoom confirmed, and says when nothing was connected", () => {
    expect(disconnectNotice({ provider: "zoom", revocation: "confirmed" })).toEqual({ kind: "success", message: "Disconnected Zoom" });
    expect(disconnectNotice({ provider: "outlook", revocation: "nothing_stored" })).toEqual({
      kind: "success",
      message: "Outlook was not connected",
    });
  });
});

describe("describeAuditEntry", () => {
  it("words the connection kinds from their details", () => {
    expect(describeAuditEntry("connection_lost", '{"provider":"google"}')).toEqual({
      title: "Google Calendar connection lost",
      detail: "Paceday could no longer use this connection. Reconnect it to keep using it.",
    });
    expect(describeAuditEntry("provider_disconnected", '{"provider":"zoom","revocation":"confirmed"}')).toEqual({
      title: "Zoom disconnected",
      detail: "Zoom confirmed that Paceday's access was removed.",
    });
    expect(describeAuditEntry("provider_disconnected", '{"provider":"outlook","revocation":"not_offered"}').detail).toMatch(
      /Microsoft account/,
    );
    expect(describeAuditEntry("provider_disconnected", '{"provider":"zoom","revocation":"unconfirmed"}').detail).toMatch(
      /did not confirm/,
    );
    expect(describeAuditEntry("revocation_unconfirmed", '{"provider":"zoom"}')).toEqual({
      title: "Zoom revocation not confirmed",
      detail: "Remove Paceday from the apps connected to your Zoom account.",
    });
  });

  it("leaves every other kind, and undecodable details, as they are", () => {
    expect(describeAuditEntry("focus_created", '{"blocks":2}')).toEqual({ title: "focus_created", detail: '{"blocks":2}' });
    expect(describeAuditEntry("connection_lost", "not json")).toEqual({ title: "connection_lost", detail: "not json" });
    expect(describeAuditEntry("connection_lost", '{"provider":"dropbox"}')).toEqual({
      title: "connection_lost",
      detail: '{"provider":"dropbox"}',
    });
  });
});
