import { describe, expect, it } from "vitest";

import { localISODate, mondayOf } from "./localDate";

describe("localISODate", () => {
  it("returns the local calendar day at local midnight", () => {
    // toISOString() would give the previous day here anywhere east of UTC.
    expect(localISODate(new Date(2026, 9, 10, 0, 0, 0))).toBe("2026-10-10");
    expect(localISODate(new Date(2026, 0, 1, 23, 59))).toBe("2026-01-01");
  });
});

describe("mondayOf", () => {
  it("returns the Monday of the week, treating Sunday as the end of the week", () => {
    expect(mondayOf("2026-10-10")).toBe("2026-10-05"); // Saturday
    expect(mondayOf("2026-10-11")).toBe("2026-10-05"); // Sunday
    expect(mondayOf("2026-10-05")).toBe("2026-10-05"); // Monday
    expect(mondayOf("2026-11-01")).toBe("2026-10-26"); // across a month boundary
  });
});
