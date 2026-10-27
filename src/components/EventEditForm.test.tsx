import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// PAC-29, AC-9 (D-8, API-043): saving an all-day event never converts it to a
// timed one unless the user changed a time. The zone is set here, in the
// process, before any Date is built (setting TZ in the shell is not applied on
// every host, challenger R3-N2), and it is west of UTC so that a bare date
// parsed as UTC midnight would show the previous day (R3-N1).
const zone = vi.hoisted(() => {
  const previous = process.env.TZ;
  process.env.TZ = "America/New_York";
  return { previous };
});

const updateEvent = vi.fn();
const toastError = vi.fn();
vi.mock("@/api/client", () => ({
  api: { updateEvent: (...args: unknown[]) => updateEvent(...args), deleteEvent: vi.fn() },
  apiErrorMessage: () => "error",
}));
vi.mock("@/hooks/useToast", () => ({
  toast: { success: vi.fn(), error: (...args: unknown[]) => toastError(...args), info: vi.fn() },
}));
vi.mock("@/components/LocationPicker", () => ({ LocationPicker: () => null }));
vi.mock("@/components/ParticipantPicker", () => ({ ParticipantPicker: () => null }));
vi.mock("@/components/MeetingLinkRow", () => ({ MeetingLinkRow: () => null }));

import { EventEditForm } from "./EventEditForm";
import type { CalendarEvent } from "@/api/types";

function renderForm(event: CalendarEvent) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <EventEditForm event={event} onBack={() => {}} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

function dateInput(container: HTMLElement) {
  return container.querySelector('input[type="date"]') as HTMLInputElement;
}
function timeInputs(container: HTMLElement) {
  return Array.from(container.querySelectorAll('input[type="time"]')) as HTMLInputElement[];
}

async function save() {
  fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
  await waitFor(() => expect(updateEvent).toHaveBeenCalledTimes(1));
  return updateEvent.mock.calls[0][1] as Record<string, unknown>;
}

const ALL_DAY: CalendarEvent = { id: "evt-allday", title: "Offsite", start: "2026-05-04", end: "2026-05-05" };
const THREE_DAYS: CalendarEvent = { id: "evt-3d", title: "Conference", start: "2026-05-04", end: "2026-05-07" };
const TIMED: CalendarEvent = { id: "evt-timed", title: "Sync", start: "2026-05-04T14:00:00Z", end: "2026-05-04T14:30:00Z" };

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

describe("EventEditForm saving an all-day event (PAC-29, AC-9)", () => {
  beforeEach(() => {
    updateEvent.mockReset();
    updateEvent.mockResolvedValue({ id: "x", title: "x", start: "", end: "" });
    toastError.mockReset();
  });

  afterAll(() => {
    if (zone.previous === undefined) delete process.env.TZ;
    else process.env.TZ = zone.previous;
  });

  it("runs west of UTC", () => {
    expect(new Date("2026-05-04T00:00:00Z").getDate()).toBe(3);
  });

  it("shows the event's own date, not the previous day", () => {
    const { container } = renderForm(ALL_DAY);
    expect(dateInput(container).value).toBe("2026-05-04");
  });

  it("(i) a title-only change saves and sends no start or end", async () => {
    const { container } = renderForm(ALL_DAY);
    fireEvent.change(container.querySelector('input[type="text"]') as HTMLInputElement, { target: { value: "Offsite 2" } });
    const patch = await save();
    expect(toastError).not.toHaveBeenCalled();
    expect(patch.title).toBe("Offsite 2");
    expect(patch).not.toHaveProperty("start");
    expect(patch).not.toHaveProperty("end");
  });

  it("(ii) a date-only change sends bare dates, keeping a one-day span", async () => {
    const { container } = renderForm(ALL_DAY);
    fireEvent.change(dateInput(container), { target: { value: "2026-05-06" } });
    const patch = await save();
    expect(patch.start).toBe("2026-05-06");
    expect(patch.end).toBe("2026-05-07");
  });

  it("(ii) a date-only change keeps a three-day span", async () => {
    const { container } = renderForm(THREE_DAYS);
    fireEvent.change(dateInput(container), { target: { value: "2026-05-06" } });
    const patch = await save();
    expect(patch.start).toBe("2026-05-06");
    expect(patch.end).toBe("2026-05-09");
  });

  it("(ii) an all-day event with no end moves as a one-day event", async () => {
    const { container } = renderForm({ ...ALL_DAY, end: "" });
    fireEvent.change(dateInput(container), { target: { value: "2026-05-06" } });
    const patch = await save();
    expect(patch.start).toBe("2026-05-06");
    expect(patch.end).toBe("2026-05-07");
  });

  it("(iii) a time change sends two RFC3339 date-times", async () => {
    const { container } = renderForm(ALL_DAY);
    const [startInput, endInput] = timeInputs(container);
    fireEvent.change(startInput, { target: { value: "10:00" } });
    fireEvent.change(endInput, { target: { value: "11:00" } });
    const patch = await save();
    expect(patch.start).toMatch(RFC3339);
    expect(patch.end).toMatch(RFC3339);
    expect(new Date(patch.start as string).getTime()).toBe(new Date("2026-05-04T14:00:00Z").getTime());
    expect(new Date(patch.end as string).getTime()).toBe(new Date("2026-05-04T15:00:00Z").getTime());
  });

  it("a timed event keeps sending date-times", async () => {
    const { container } = renderForm(TIMED);
    expect(dateInput(container).value).toBe("2026-05-04");
    const patch = await save();
    expect(patch.start).toBe("2026-05-04T14:00:00.000Z");
    expect(patch.end).toBe("2026-05-04T14:30:00.000Z");
  });
});
