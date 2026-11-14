import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LinkEditDrawer } from "./LinkEditDrawer";
import { api } from "@/api/client";
import { clearFreebusyCache } from "@/api/coverageCache";
import type { CoverageStatus, SchedulingLink } from "@/api/types";

// PAC-41: the co-host chip reads free/busy's two statuses, names no calendar
// provider (AC-8), and "On Paceday" comes only from the link's host record (AC-9).

const PROVIDER_NAMES = /google|microsoft|outlook|gmail|office|exchange|icloud|apple/i;

const link: SchedulingLink = {
  id: "l1",
  owner_id: "u1",
  title: "Intro",
  slug: "intro",
  durations: [30],
  days: ["mon", "tue"],
  window_start: "09:00",
  window_end: "17:00",
  buffer_before: 0,
  buffer_after: 0,
  min_notice_minutes: 0,
  usage_type: "reusable",
  uses_count: 0,
  active: true,
  hosts: [
    { user_id: "u1", email: "owner@co.com", is_owner: true, status: "accepted" },
    { user_id: "u2", email: "bob@co.com", is_owner: false, status: "accepted" },
  ],
  created_at: "2026-01-01T00:00:00Z",
  is_owner: true,
  booking_horizon_days: 60,
  refusal_message: "generic",
  time_zone: "Europe/Paris",
};

function freebusyAnswers(statuses: Record<string, CoverageStatus>) {
  return vi.spyOn(api, "freebusy").mockImplementation(async (input) => ({
    start_time: input.start_time,
    end_time: input.end_time,
    participants: input.emails.map((email) => ({ email, status: statuses[email] ?? "unknown", busy: [] })),
  }));
}

function renderDrawer(edit?: SchedulingLink) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LinkEditDrawer open onOpenChange={() => {}} link={edit} />
    </QueryClientProvider>,
  );
}

function addCoHost(email: string) {
  fireEvent.change(screen.getByPlaceholderText("teammate@example.com"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /add/i }));
}

/** The chip's list item: the address, its badge and its remove button. */
function chipFor(email: string): HTMLElement {
  return screen.getByText(email).closest("li") as HTMLElement;
}

/** Every text a person or assistive technology can get from an element and its descendants. */
function everyName(root: HTMLElement): string[] {
  const out = [root.textContent ?? ""];
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attr of ["aria-label", "title", "aria-description", "alt"]) {
      const v = el.getAttribute(attr);
      if (v) out.push(v);
    }
    for (const attr of ["aria-labelledby", "aria-describedby"]) {
      for (const id of (el.getAttribute(attr) ?? "").split(/\s+/).filter(Boolean)) {
        out.push(document.getElementById(id)?.textContent ?? "");
      }
    }
  }
  return out;
}

describe("LinkEditDrawer co-host chips (PAC-41)", () => {
  beforeEach(() => clearFreebusyCache());
  afterEach(() => vi.restoreAllMocks());

  it("AC-8: a co-host whose status is known reads 'Availability synced' and nothing in the chip names a provider", async () => {
    freebusyAnswers({ "dana@co.com": "known" });
    renderDrawer();
    addCoHost("dana@co.com");

    const chip = await screen.findByText("Availability synced");
    // Open the tooltip, as a keyboard user does.
    fireEvent.focus(chip);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("We can read this person's calendar.");

    const li = chipFor("dana@co.com");
    const names = [...everyName(li), tooltip.textContent ?? ""];
    for (const name of names) expect(name).not.toMatch(PROVIDER_NAMES);
    // No provider mark either: the badge holds an icon and its label only.
    expect(within(li).queryByText(/^[GM]$/)).toBeNull();
  });

  it("AC-8: a co-host whose status is unknown shows the unknown state", async () => {
    freebusyAnswers({ "eve@co.com": "unknown" });
    renderDrawer();
    addCoHost("eve@co.com");

    expect(await within(chipFor("eve@co.com")).findByText("Availability unknown")).toBeInTheDocument();
    expect(within(chipFor("eve@co.com")).queryByText("Availability synced")).toBeNull();
  });

  it("AC-9: an accepted co-host with a Paceday account on the saved link reads 'On Paceday' whatever free/busy says", async () => {
    for (const status of ["known", "unknown"] as const) {
      clearFreebusyCache();
      const freebusy = freebusyAnswers({ "bob@co.com": status });
      const view = renderDrawer(link);
      // Let the free/busy answer arrive before reading the chip.
      await waitFor(() => expect(freebusy).toHaveBeenCalled());
      await freebusy.mock.results[0].value;
      const li = await waitFor(() => chipFor("bob@co.com"));
      expect(within(li).getByText("On Paceday")).toBeInTheDocument();
      expect(within(li).queryByText(/Availability/)).toBeNull();
      view.unmount();
      freebusy.mockRestore();
    }
  });
});
