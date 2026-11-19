/**
 * PAC-149 AC-15 (web half; contract §1.1, §2.5): the PAC-149 shapes parse
 * with the web's reading code. A pending or declined entry carries no
 * `user_id`, name or picture; a removed pending or declined item is
 * `{email, status}`. The strict save report must parse (not fall back), and the
 * loose roster must keep pending entries by address.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { schedulingLinksApi } from "./schedulingLinks";

const fetchMock = vi.fn<typeof fetch>();
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const requestPath = (input: RequestInfo | URL) => new URL(String(input), window.location.origin).pathname;

const OWNER = { user_id: "11111111-1111-4111-8111-111111111111", email: "owner@co.com", is_owner: true, status: "accepted" };
const BACKEND_LINK = {
  id: "l1", owner_id: OWNER.user_id, slug: "intro", title: "Intro", duration_options: [30], days_of_week: [1],
  window_start_time: "09:00", window_end_time: "17:00", buffer_before: 0, buffer_after: 0, min_notice_minutes: 0,
  usage_type: "reusable", uses_count: 0, active: true, created_at: "2026-01-01T00:00:00Z", is_owner: true,
};

describe("PAC-149 AC-15: the web reads the address-invitation shapes", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  it("a save report removing pending and declined entries without user_id parses strictly (no fallback)", async () => {
    const report = {
      addresses: [
        { email: "someone@unknown.example", outcome: "invited" },
        { email: "not-an-address", outcome: "not_added" },
      ],
      removed: [
        { email: "Pending@x.example", status: "pending" },
        { email: "declined@x.example", status: "declined" },
        { user_id: "22222222-2222-4222-8222-222222222222", email: "acc@x.example", status: "accepted" },
      ],
      invited_count: 1,
      removed_count: 3,
      not_added_count: 1,
    };
    fetchMock.mockImplementation(async (input, init) => {
      if (requestPath(input) === "/api/scheduling-links/l1" && init?.method === "PATCH") {
        return jsonResponse({
          ...BACKEND_LINK,
          hosts: [OWNER, { email: "someone@unknown.example", is_owner: false, status: "pending" }],
          co_host_changes: report,
        });
      }
      if (requestPath(input) === "/api/scheduling-links/l1") return jsonResponse({ ...BACKEND_LINK, hosts: [OWNER] });
      return jsonResponse({ id: OWNER.user_id, email: OWNER.email });
    });
    const saved = await schedulingLinksApi.updateLink("l1", { co_host_emails: ["someone@unknown.example", "not-an-address"] });
    expect(saved.co_host_changes).toEqual(report);
    expect(saved.link.hosts).toEqual([
      expect.objectContaining({ email: "owner@co.com", is_owner: true }),
      { user_id: undefined, email: "someone@unknown.example", name: undefined, avatar_url: undefined, is_owner: false, status: "pending" },
    ]);
  });

  it("the strict single read keeps pending and declined entries by address, with no account id", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (requestPath(input) === "/api/scheduling-links/l1") {
        return jsonResponse({
          ...BACKEND_LINK,
          hosts: [
            OWNER,
            { email: "H@x.example", is_owner: false, status: "pending" },
            { email: "n@y.example", is_owner: false, status: "pending" },
            { email: "d@x.example", is_owner: false, status: "declined" },
          ],
        });
      }
      return jsonResponse({ id: OWNER.user_id, email: OWNER.email });
    });
    const link = await schedulingLinksApi.getLink("l1");
    expect(link.hosts.map((h) => [h.email, h.status, h.user_id ?? null, h.is_owner])).toEqual([
      ["owner@co.com", "accepted", OWNER.user_id, true],
      ["H@x.example", "pending", null, false],
      ["n@y.example", "pending", null, false],
      ["d@x.example", "declined", null, false],
    ]);
  });
});
