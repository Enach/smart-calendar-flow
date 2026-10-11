import { describe, expect, it } from "vitest";

import { eventChipColors } from "./eventChip";

describe("eventChipColors", () => {
  it("keeps the event colour on the bar and tint, and the title in ink", () => {
    for (const color of ["#3B82F6", "#6B7280", "#7C3AED", "#E9B949"]) {
      const c = eventChipColors(color);
      expect(c.borderColor).toBe(color);
      expect(c.backgroundColor).toBe(`${color}26`);
      expect(c.textColor).toBe("hsl(var(--foreground))");
    }
  });
});
