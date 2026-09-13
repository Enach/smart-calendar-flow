import { describe, expect, it } from "vitest";

import { managerRosterSchema, scanConfirmationSchema, scanPreviewSchema } from "./managerTeam";

const teamID = "11111111-1111-4111-8111-111111111111";
const week = { focus_minutes: 0, meeting_minutes: 0, free_minutes: 0, data_available: false };
const member = {
  email: "external@example.com",
  display_name: "External Person",
  source: "auto" as const,
  cadence: "biweekly" as const,
  cadence_custom_days: null,
  last_one_on_one_at: null,
  is_paceday_user: false,
  this_week: week,
  last_week: week,
  focus_trend_pct: 0,
};

describe("manager-team wire contract", () => {
  it("requires team_id and a members array", () => {
    expect(managerRosterSchema.parse({ team_id: teamID, members: [member] }).members).toHaveLength(1);
    expect(() => managerRosterSchema.parse({ team_id: teamID })).toThrow();
    expect(() => managerRosterSchema.parse({ team_id: "not-a-uuid", members: [] })).toThrow();
    expect(() => managerRosterSchema.parse({ members: [] })).toThrow();
  });

  it("rejects unknown fields rather than silently normalizing protocol drift", () => {
    expect(() => managerRosterSchema.parse({ team_id: teamID, members: [], unexpected: true })).toThrow();
  });

  it("keeps preview and confirmation counts unambiguous", () => {
    const preview = scanPreviewSchema.parse({
      team_id: teamID, scanned_at: "2026-09-13T20:00:00Z", detected: 10, eligible: 8,
      assigned: 0, skipped: 2,
      candidates: [{ email: member.email, display_name: member.display_name, already_assigned: false }],
    });
    expect(preview.detected).toBe(10);
    expect(preview.assigned).toBe(0);
    expect(scanConfirmationSchema.parse({ team_id: teamID, assigned: 8, skipped: 0, total: 8 }).total).toBe(8);
    expect(() => scanPreviewSchema.parse({ ...preview, assigned: 1 })).toThrow();
  });
});
