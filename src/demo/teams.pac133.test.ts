/**
 * PAC-133 blocking rule (spec §3.1, D-11) in the demo team finder: a member
 * whose calendar could not be read is unknown, never counted free. Windows
 * reported for a member still block. A failed lookup counts nobody free.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const fb = vi.hoisted(() => ({ answer: null as unknown, fail: false }));
vi.mock("@/api/coverageCache", () => ({
  getFreebusy: async () => {
    if (fb.fail) throw new Error("unreachable");
    return fb.answer;
  },
}));

import { teamsApi, type FormalTeam } from "@/api/teams";
import { demoTeamsOps } from "./teams";

const DATE = "2030-03-04"; // a Monday
const member = (email: string) => ({
  email,
  display_name: email,
  role: "member" as const,
  status: "active" as const,
  is_paceday_user: true,
});
const TEAM = {
  id: "t1",
  name: "Platform",
  created_at: "2030-01-01T00:00:00Z",
  owner_email: "ana@co.com",
  members: [member("ana@co.com"), member("bo@gmail.com")],
  no_meeting_zones: [],
} as unknown as FormalTeam;

describe("PAC-133: the demo team finder never counts an unknown member as free", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fb.fail = false;
  });

  it("an unknown member with no windows is not free; a readable free member is", async () => {
    vi.spyOn(teamsApi, "get").mockReturnValue(TEAM);
    fb.answer = {
      start_time: "",
      end_time: "",
      participants: [
        { email: "ana@co.com", status: "known", busy: [] },
        { email: "bo@gmail.com", status: "unknown", busy: [] },
      ],
      busy: {},
    };
    const slots = await demoTeamsOps.findSlots("t1", DATE, 30);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.total_count).toBe(2);
      expect(s.free_count).toBe(1);
    }
  });

  it("every member unknown: no slot is offered as free", async () => {
    vi.spyOn(teamsApi, "get").mockReturnValue(TEAM);
    fb.answer = {
      start_time: "",
      end_time: "",
      participants: [
        { email: "ana@co.com", status: "unknown", busy: [] },
        { email: "bo@gmail.com", status: "unknown", busy: [] },
      ],
      busy: {},
    };
    expect(await demoTeamsOps.findSlots("t1", DATE, 30)).toEqual([]);
  });

  it("a failed lookup counts nobody free", async () => {
    vi.spyOn(teamsApi, "get").mockReturnValue(TEAM);
    fb.fail = true;
    expect(await demoTeamsOps.findSlots("t1", DATE, 30)).toEqual([]);
  });
});
