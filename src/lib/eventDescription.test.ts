import { describe, expect, it } from "vitest";

import { parseDescription } from "./eventDescription";

/** Flatten the parse back to the nodes, line breaks removed, for assertions. */
function nodes(raw: string) {
  return parseDescription(raw).lines.flat();
}

describe("parseDescription links", () => {
  it("keeps an anchor whose scheme is allowed", () => {
    expect(nodes('<a href="https://meet.google.com/abc-defg-hij">Join</a>')).toEqual([
      { type: "link", url: "https://meet.google.com/abc-defg-hij", label: "Join" },
    ]);
  });

  it("keeps all five allowed schemes, with their labels", () => {
    for (const url of [
      "http://example.com/standup",
      "https://example.com/standup",
      "mailto:someone@example.com",
      "tel:+33123456789",
      "webcal://calendar.example.com/feed.ics",
    ]) {
      const out = parseDescription(`<a href="${url}">Open</a>`);
      expect(out.lines.flat()).toEqual([{ type: "link", url, label: "Open" }]);
      expect(out.links).toEqual([{ url, label: "Open" }]);
    }
  });

  it("degrades a javascript: anchor to plain text", () => {
    // Read-only security audit, 2026-11-22, finding 1: anyone who can send an
    // invite writes this description, and one click would otherwise run script
    // on Paceday's own origin.
    const out = parseDescription('<a href="javascript:alert(1)">Join the call</a>');
    expect(out.lines.flat()).toEqual([{ type: "text", value: "Join the call" }]);
    expect(out.links).toEqual([]);
  });

  it("degrades javascript: in mixed case, with leading whitespace, to plain text", () => {
    const out = parseDescription('<a href="   JavaScript:alert(1)">Join the call</a>');
    expect(out.lines.flat()).toEqual([{ type: "text", value: "Join the call" }]);
    expect(out.links).toEqual([]);
  });

  it("degrades a javascript: scheme split by a newline to plain text", () => {
    const out = parseDescription('<a href="java\nscript:alert(1)">Join the call</a>');
    expect(out.lines.flat()).toEqual([{ type: "text", value: "Join the call" }]);
    expect(out.links).toEqual([]);
  });

  it("degrades a data: anchor to plain text", () => {
    const out = parseDescription('<a href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;">Agenda</a>');
    expect(out.lines.flat()).toEqual([{ type: "text", value: "Agenda" }]);
    expect(out.links).toEqual([]);
  });

  it("degrades a vbscript: anchor to plain text", () => {
    const out = parseDescription('<a href="vbscript:MsgBox(1)">Dial in</a>');
    expect(out.lines.flat()).toEqual([{ type: "text", value: "Dial in" }]);
    expect(out.links).toEqual([]);
  });

  it("degrades a protocol-relative anchor to plain text", () => {
    const out = parseDescription('<a href="//evil.example/drop">Agenda</a>');
    expect(out.lines.flat()).toEqual([{ type: "text", value: "Agenda" }]);
    expect(out.links).toEqual([]);
  });

  it("shows the refused href itself when the anchor has no text", () => {
    expect(nodes('<a href="javascript:alert(1)"></a>')).toEqual([
      { type: "text", value: "javascript:alert(1)" },
    ]);
  });

  it("keeps the rest of the description around a refused anchor", () => {
    const out = parseDescription(
      'Agenda<br>1. <a href="javascript:alert(1)">this one</a><br>2. <a href="https://example.com/doc">that one</a>',
    );
    expect(out.lines).toEqual([
      [{ type: "text", value: "Agenda" }],
      [
        { type: "text", value: "1. " },
        { type: "text", value: "this one" },
      ],
      [
        { type: "text", value: "2. " },
        { type: "link", url: "https://example.com/doc", label: "that one" },
      ],
    ]);
    expect(out.links).toEqual([{ url: "https://example.com/doc", label: "that one" }]);
  });

  it("still linkifies bare https URLs and still drops the conference block", () => {
    const out = parseDescription(
      "Video conference link: https://meet.google.com/abc-defg-hij\nSee https://example.com/doc",
      "https://meet.google.com/abc-defg-hij",
    );
    expect(out.links).toEqual([{ url: "https://example.com/doc", label: "https://example.com/doc" }]);
  });
});
