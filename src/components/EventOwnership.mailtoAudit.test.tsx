/**
 * Read-only security audit of 2026-11-22, follow-up item 1: the one href the
 * app builds out of an organizer value.
 *
 * `ParticipantNotice`'s "Ask to reschedule" button is a mailto URI built from
 * `organizer.email`, which is invite data — `attendee_details` is filled from
 * whatever the provider sent, and `normalizeAttendees` only asks for a string.
 * The address was interpolated raw, ahead of this URI's own `?subject=&body=`,
 * so an "address" carrying `?` or `&` added a header of its own: the mail the
 * user is about to send about their own meeting went out with a blind copy to
 * whoever wrote the invite.
 *
 * The scheme needs no `safeLinkUrl` here, unlike every href built from a
 * provider-supplied URL: it is the literal `mailto:` and no address can change
 * it. Percent-encoding the address is the whole fix.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ParticipantNotice } from "./EventOwnership";
import type { Attendee, CalendarEvent } from "@/api/types";

vi.mock("@/contexts/useAuth", () => ({
  useAuth: () => ({ user: { id: "1", email: "me@co.test", name: "Me" } }),
}));

const event = {
  id: "e1",
  title: "Weekly sync",
  start: "2026-05-04T09:00:00Z",
  end: "2026-05-04T09:30:00Z",
} as CalendarEvent;

function hrefFor(organizer: Attendee): string {
  const view = render(<ParticipantNotice event={event} organizer={organizer} />);
  const href = screen.getByRole("link", { name: /ask to reschedule/i }).getAttribute("href") ?? "";
  view.unmount();
  return href;
}

/**
 * A mailto URI's `to`, as the browser reads it. `mailto:` is not a special
 * scheme, so `URL` puts the whole addr-spec in `pathname` and the headers in
 * `search` — which is exactly the split that matters here.
 */
function recipientOf(href: string): string {
  const parsed = new URL(href);
  expect(parsed.protocol).toBe("mailto:");
  expect(parsed.hash).toBe("");
  return decodeURIComponent(parsed.pathname);
}

/** The headers the URI carries, by name. */
function headersOf(href: string): URLSearchParams {
  return new URL(href).searchParams;
}

describe("the organizer mailto cannot grow headers or recipients of its own", () => {
  it("keeps an ordinary address literal, @ included", () => {
    const href = hrefFor({ email: "host@co.test", name: "Hiro Tanaka", organizer: true });
    expect(href.startsWith("mailto:host@co.test?subject=")).toBe(true);
  });

  it.each([
    ["a blind copy", "host@co.test?bcc=harvest@evil.example&x="],
    ["a second recipient", "host@co.test,harvest@evil.example"],
    ["a fragment that truncates the message", "host@co.test#frag"],
    ["a reply-to", "host@co.test?reply-to=harvest@evil.example"],
  ])("refuses to let an address smuggle in %s", (_name, email) => {
    const href = hrefFor({ email, organizer: true });

    // Whatever the provider sent stays one opaque recipient: the `?`, `,`,
    // `#` or `&` inside it is encoded, so it names no header, no second
    // address and no fragment. A mail client will refuse this one address;
    // it will not quietly send to a second one.
    expect(recipientOf(href)).toBe(email);
    const to = new URL(href).pathname;
    for (const char of ["?", ",", "#", "&"]) expect(to).not.toContain(char);

    // The only headers on the URI are the two this component writes.
    const headers = headersOf(href);
    expect([...headers.keys()].sort()).toEqual(["body", "subject"]);
    expect(headers.get("subject")).toBe("Reschedule: Weekly sync");
  });

  it("shows the notice without a mail button when there is no organizer address", () => {
    render(<ParticipantNotice event={event} organizer={undefined} />);
    expect(screen.getByText(/you're a guest on this meeting/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /ask to reschedule/i })).toBeNull();
  });
});
