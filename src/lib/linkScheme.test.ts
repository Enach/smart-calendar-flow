import { describe, expect, it } from "vitest";

import { safeLinkUrl } from "./linkScheme";

// Read-only security audit, 2026-11-22, finding 1: hrefs built out of invite
// data are allowlisted by scheme, here, before a link node exists.

describe("safeLinkUrl", () => {
  it("admits the five schemes a calendar invite legitimately uses", () => {
    for (const url of [
      "http://example.com/standup",
      "https://meet.google.com/abc-defg-hij?authuser=0",
      "mailto:someone@example.com?subject=Re%3A%20standup",
      "tel:+33123456789",
      "webcal://calendar.example.com/feed.ics",
    ]) {
      expect(safeLinkUrl(url)).toBe(url);
    }
  });

  it("refuses javascript:, data: and vbscript:", () => {
    expect(safeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(safeLinkUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeLinkUrl("vbscript:MsgBox(1)")).toBeNull();
  });

  it("refuses the usual spellings of javascript:", () => {
    // Case, surrounding whitespace, embedded tabs and newlines: all of these
    // reach the browser's URL parser as `javascript:`, so they must reach ours
    // that way too.
    for (const url of [
      "JavaScript:alert(1)",
      "  JavaScript:alert(1)\t",
      "\u0000javascript:alert(1)",
      "java\nscript:alert(1)",
      "java\tscript:alert(1)",
      "jav\ra\nscript:alert(1)",
      "JAVASCRIPT:alert(document.domain)",
    ]) {
      expect(safeLinkUrl(url)).toBeNull();
    }
  });

  it("refuses a href with no scheme of its own, protocol-relative included", () => {
    // With a base, `//evil.example` would resolve to the page's own scheme and
    // `/settings` to in-app navigation. Invite data gets neither.
    expect(safeLinkUrl("//evil.example/drop")).toBeNull();
    expect(safeLinkUrl("/settings/integrations")).toBeNull();
    expect(safeLinkUrl("example.com")).toBeNull();
    expect(safeLinkUrl("")).toBeNull();
    expect(safeLinkUrl("   ")).toBeNull();
  });

  it("refuses schemes that are neither a web link nor a contact link", () => {
    for (const url of ["file:///etc/passwd", "blob:https://paceday.test/1-2-3", "chrome://settings", "ms-msdt:/id"]) {
      expect(safeLinkUrl(url)).toBeNull();
    }
  });

  it("returns an href the browser parses the same way it was checked", () => {
    // What comes back is the input minus exactly the characters URL parsing
    // ignores, so the scheme that was allowed is the scheme that navigates.
    expect(safeLinkUrl("  https://example.com/a\t\n")).toBe("https://example.com/a");
  });
});
