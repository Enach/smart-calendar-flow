import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import mainSource from "../main.tsx?raw";

// PAC-81: the production CSP has no 'unsafe-eval', so Zod must never reach
// `Function` (its JIT probe or its compiled object parser). Function is
// replaced by a recorder that throws like a CSP-blocked eval would.
const RealFunction = globalThis.Function;
let calls: string[] = [];

beforeEach(() => {
  calls = [];
  globalThis.Function = new Proxy(RealFunction, {
    construct(_target, args: unknown[]) {
      calls.push(String(args[args.length - 1] ?? ""));
      throw new EvalError("blocked by test CSP");
    },
    apply(_target, _this, args: unknown[]) {
      calls.push(String(args[args.length - 1] ?? ""));
      throw new EvalError("blocked by test CSP");
    },
  });
});

afterEach(() => {
  globalThis.Function = RealFunction;
});

const week = {
  id: "7f1c2b8e-3d4a-4c5b-9e6f-0a1b2c3d4e5f",
  user_id: "8a2d3c9f-4e5b-4d6c-8f7a-1b2c3d4e5f60",
  week_start: "2026-10-26",
  total_working_minutes: 2400,
  meeting_minutes: 600,
  focus_minutes: 900,
  habit_minutes: 120,
  buffer_minutes: 60,
  personal_minutes: 120,
  free_minutes: 600,
  meeting_count: 12,
  focus_block_count: 6,
  habit_completion_rate: 80,
  largest_focus_block_minutes: 180,
  top_meeting_titles: [{ title: "Standup", duration_minutes: 15 }],
  focus_score: 72,
  estimated_meeting_cost_minutes: 1200,
  computed_at: "2026-10-28T09:00:00Z",
  breakdown: (["meeting", "focus", "habit", "personal", "free"] as const).map((category) => ({
    category,
    minutes: 60,
    percentage: 20,
    color: "#000000",
  })),
};

describe("Zod runs jitless (PAC-81)", () => {
  it("is configured jitless", () => {
    expect(z.config().jitless).toBe(true);
  });

  it("constructs and parses the generated object schemas without calling Function", async () => {
    // Imported here, after Function is patched, so schema construction is
    // covered too: Zod decides JIT-or-not when an object schema is built.
    const schemas = await import("@/api/generated/schemas");

    expect(schemas.AnalyticsWeekWithBreakdown.parse(week)).toEqual(week);
    expect(schemas.AnalyticsWeekWithBreakdown.safeParse({ ...week, extra: 1 }).success).toBe(false);
    expect(
      schemas.AddManagerMemberRequest.parse({ email: "a@example.com", cadence: "weekly", other: true }),
    ).toEqual({ email: "a@example.com", cadence: "weekly", other: true });

    expect(calls).toEqual([]);
  });

  it("would catch the JIT if jitless were off (the recorder works)", () => {
    const previous = z.config().jitless;
    z.config({ jitless: false });
    try {
      // A schema built now takes the JIT path: the probe or the compiled
      // parser hits the recorder, and Zod swallows the error.
      const schema = z.object({ a: z.string() });
      expect(schema.parse({ a: "x" })).toEqual({ a: "x" });
      expect(calls.length).toBeGreaterThan(0);
    } finally {
      z.config({ jitless: previous });
    }
  });

  it("is the first import of the app entry point", () => {
    const firstImport = mainSource.match(/^import\s+[^;]+;/m)?.[0];
    expect(firstImport).toBe('import "./lib/zodConfig";');
  });
});
