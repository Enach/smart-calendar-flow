/**
 * PAC-41: the room picker books the room the user picks, claims nothing the
 * room list does not say, tells the user an earlier room stays booked, and
 * says why the room list could not be read.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { api, ApiGatewayError, ApiHttpError, ApiUnreachableError, ROOM_LIST_FAILURE_TEXT } from "@/api/client";
import type { CalendarRoom } from "@/api/types";
import { LocationPicker } from "./LocationPicker";

// Rooms exactly as GET /api/rooms answers them: an identifier and a name.
const HELSINKI: CalendarRoom = { id: "c_1888helsinki@resource.calendar.google.com", name: "Helsinki" };
const OSLO: CalendarRoom = { id: "c_1888oslo@resource.calendar.google.com", name: "Oslo" };

type Change = { location: string; room_resource_email?: string };

function renderPicker(props: { location?: string; roomEmail?: string } = {}) {
  const onChange = vi.fn<(next: Change) => void>();
  const view = render(<LocationPicker location={props.location ?? ""} roomEmail={props.roomEmail} onChange={onChange} />);
  return { onChange, ...view };
}

async function openRoomBooking() {
  fireEvent.click(screen.getByRole("button", { name: "Book a room" }));
}

// AC-12 and AC-13 wording: the two points, and that a held room stays booked.
const BOOKING_NOTICE = /Saving adds the chosen room to this event\. It does not release a room the event already holds: release a held room in your calendar itself\./;
const LEFT_NOTICE = /A room already booked on this event stays booked\. Release it in your calendar itself\./;

const EMPTY_LIST_TEXTS = ["No rooms matched.", "Start typing to search rooms."];

describe("LocationPicker rooms (PAC-41)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("AC-2: picking a room reports its identifier as the room address and its name as the location", async () => {
    vi.spyOn(api, "searchRooms").mockResolvedValue([HELSINKI, OSLO]);
    const { onChange } = renderPicker();
    await openRoomBooking();

    fireEvent.click(await screen.findByRole("button", { name: "Helsinki" }));

    expect(onChange).toHaveBeenLastCalledWith({ location: "Helsinki", room_resource_email: HELSINKI.id });
  });

  it("free text sends no room address (spec section 6)", () => {
    const { onChange } = renderPicker({ location: "Café" });
    fireEvent.change(screen.getByTestId("location-text-input"), { target: { value: "Café de Flore" } });
    expect(onChange).toHaveBeenLastCalledWith({ location: "Café de Flore", room_resource_email: undefined });
    expect(onChange.mock.lastCall?.[0].room_resource_email).toBeUndefined();
  });

  it("AC-3: no row shows an availability verdict, none is disabled, and neither rows nor the selected card has a detail line", async () => {
    vi.spyOn(api, "searchRooms").mockResolvedValue([HELSINKI, OSLO]);
    renderPicker();
    await openRoomBooking();

    const options = await screen.findAllByTestId("room-option");
    expect(options).toHaveLength(2);
    for (const option of options) {
      expect(option).not.toBeDisabled();
      expect(option.textContent).not.toMatch(/available|busy/i);
      // The row holds the room's name and nothing else: no secondary line.
      expect(option.querySelectorAll("p")).toHaveLength(0);
      expect(option.textContent?.trim()).toBe(option.getAttribute("data-room-id") === HELSINKI.id ? "Helsinki" : "Oslo");
    }

    fireEvent.click(options[0]);
    const card = await screen.findByTestId("room-selected");
    expect(card.textContent).toBe("Helsinki");
    expect(card.querySelectorAll("p")).toHaveLength(1);
    expect(card.textContent).not.toMatch(/available|busy|floor|seats/i);
  });

  it("AC-4: a room address the form already holds is shown as selected, matched on the room's identifier", async () => {
    const search = vi.spyOn(api, "searchRooms").mockResolvedValue([OSLO, HELSINKI]);
    renderPicker({ roomEmail: HELSINKI.id });

    expect(await screen.findByTestId("room-selected")).toHaveTextContent("Helsinki");
    expect(search).toHaveBeenCalledWith("c_1888helsinki");
  });

  it("AC-5: the search request carries the search text and nothing else", async () => {
    const search = vi.spyOn(api, "searchRooms").mockResolvedValue([]);
    renderPicker();
    await openRoomBooking();
    fireEvent.change(screen.getByTestId("room-search-input"), { target: { value: "hel" } });

    await waitFor(() => expect(search).toHaveBeenCalledWith("hel"));
    for (const call of search.mock.calls) expect(call).toHaveLength(1);
  });

  it("AC-12: while booking a room the form says saving adds the room and does not release a held one", async () => {
    vi.spyOn(api, "searchRooms").mockResolvedValue([HELSINKI]);
    renderPicker();
    expect(screen.queryByTestId("room-booking-notice")).toBeNull();

    await openRoomBooking();
    // Searching.
    expect(screen.getByTestId("room-booking-notice")).toHaveTextContent(BOOKING_NOTICE);

    // With a room selected.
    fireEvent.click(await screen.findByRole("button", { name: "Helsinki" }));
    await screen.findByTestId("room-selected");
    expect(screen.getByTestId("room-booking-notice")).toHaveTextContent(BOOKING_NOTICE);
  });

  it("AC-13: leaving room booking for free text says a room already booked stays booked", async () => {
    vi.spyOn(api, "searchRooms").mockResolvedValue([HELSINKI]);
    const { onChange } = renderPicker();
    await openRoomBooking();
    expect(screen.queryByTestId("room-left-notice")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Free text" }));
    expect(screen.getByTestId("room-left-notice")).toHaveTextContent(LEFT_NOTICE);
    expect(onChange).toHaveBeenLastCalledWith({ location: "", room_resource_email: undefined });
  });

  it("AC-13: clearing the selected room says a room already booked stays booked", async () => {
    vi.spyOn(api, "searchRooms").mockResolvedValue([HELSINKI]);
    const { onChange } = renderPicker();
    await openRoomBooking();
    fireEvent.click(await screen.findByRole("button", { name: "Helsinki" }));
    expect(screen.queryByTestId("room-left-notice")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear room" }));
    expect(screen.getByTestId("room-left-notice")).toHaveTextContent(LEFT_NOTICE);
    expect(onChange).toHaveBeenLastCalledWith({ location: "", room_resource_email: undefined });
  });

  it("a11y: the search and the selected room are described by the booking notice; the leave notice is a status", async () => {
    vi.spyOn(api, "searchRooms").mockResolvedValue([HELSINKI]);
    renderPicker();
    await openRoomBooking();

    const notice = screen.getByTestId("room-booking-notice");
    expect(notice.id).not.toBe("");
    const input = screen.getByTestId("room-search-input");
    expect(input).toHaveAttribute("aria-describedby", notice.id);
    expect(input).toHaveAccessibleDescription(BOOKING_NOTICE);

    fireEvent.click(await screen.findByRole("button", { name: "Helsinki" }));
    const card = await screen.findByRole("group", { name: "Selected room" });
    expect(card).toBe(screen.getByTestId("room-selected"));
    expect(card).toHaveAttribute("aria-describedby", screen.getByTestId("room-booking-notice").id);
    expect(card).toHaveAccessibleDescription(BOOKING_NOTICE);

    fireEvent.click(screen.getByRole("button", { name: "Free text" }));
    expect(screen.getByRole("status")).toHaveTextContent(LEFT_NOTICE);
    expect(screen.getByRole("status")).toBe(screen.getByTestId("room-left-notice"));
  });

  it("AC-13: a user who never entered room booking sees neither notice", () => {
    renderPicker({ location: "Café" });
    fireEvent.click(screen.getByRole("button", { name: "Free text" }));
    expect(screen.queryByTestId("room-left-notice")).toBeNull();
    expect(screen.queryByTestId("room-booking-notice")).toBeNull();
  });

  describe("AC-16: a room list that cannot be read says so", () => {
    const cases: Array<[string, unknown, string]> = [
      ["calendar not connected (401, by body)", new ApiHttpError(401, { error: "calendar not connected" }), ROOM_LIST_FAILURE_TEXT["calendar-not-connected"]],
      ["session ended (401 unauthorized)", new ApiHttpError(401, { error: "unauthorized" }), ROOM_LIST_FAILURE_TEXT["session-ended"]],
      ["server failure (500 internal error)", new ApiHttpError(500, { error: "internal error" }), ROOM_LIST_FAILURE_TEXT.unavailable],
      ["gateway error", new ApiGatewayError(502), ROOM_LIST_FAILURE_TEXT.unavailable],
      ["unreachable server", new ApiUnreachableError("network"), ROOM_LIST_FAILURE_TEXT.unavailable],
    ];

    it.each(cases)("%s", async (_label, error, text) => {
      vi.spyOn(api, "searchRooms").mockRejectedValue(error);
      const { onChange } = renderPicker();
      await openRoomBooking();
      onChange.mockClear();

      const alert = await screen.findByTestId("room-list-error");
      expect(alert).toHaveTextContent(text);
      for (const empty of EMPTY_LIST_TEXTS) expect(screen.queryByText(empty)).toBeNull();
      // A failure never changes the room address the form holds.
      expect(onChange).not.toHaveBeenCalled();
    });

    it("the session-ended message never says a Google calendar is needed, and the not-connected one does", () => {
      expect(ROOM_LIST_FAILURE_TEXT["session-ended"]).not.toMatch(/google/i);
      expect(ROOM_LIST_FAILURE_TEXT["session-ended"]).toMatch(/sign in again/i);
      expect(ROOM_LIST_FAILURE_TEXT["calendar-not-connected"]).toMatch(/needs a connected Google calendar/);
      expect(ROOM_LIST_FAILURE_TEXT.unavailable).toMatch(/could not be loaded/);
    });

    it("a failed lookup of the held room says so and leaves the address alone", async () => {
      // Only the held-room lookup fails; the debounced search never answers,
      // so the message can come from nothing but the lookup's own handler.
      const search = vi.spyOn(api, "searchRooms").mockImplementation((q: string) =>
        q === "c_1888helsinki" ? Promise.reject(new ApiHttpError(401, { error: "calendar not connected" })) : new Promise<CalendarRoom[]>(() => {}),
      );
      const { onChange } = renderPicker({ roomEmail: HELSINKI.id });
      await waitFor(() => expect(search).toHaveBeenCalledWith("c_1888helsinki"));

      expect(await screen.findByTestId("room-list-error")).toHaveTextContent(ROOM_LIST_FAILURE_TEXT["calendar-not-connected"]);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("'Try again' after an unreadable list searches again and shows the rooms", async () => {
      const search = vi
        .spyOn(api, "searchRooms")
        .mockRejectedValueOnce(new ApiHttpError(500, { error: "internal error" }))
        .mockResolvedValue([HELSINKI]);
      renderPicker();
      await openRoomBooking();

      const alert = await screen.findByTestId("room-list-error");
      const tryAgain = within(alert).getByRole("button", { name: "Try again" });
      tryAgain.focus(); // as a keyboard or pointer user leaves it
      expect(tryAgain).toHaveFocus();
      fireEvent.click(tryAgain);

      expect(await screen.findByRole("button", { name: "Helsinki" })).toBeInTheDocument();
      expect(screen.queryByTestId("room-list-error")).toBeNull();
      expect(search).toHaveBeenCalledTimes(2);
      // The "Try again" button is gone, so focus returns to the search.
      expect(screen.getByTestId("room-search-input")).toHaveFocus();
    });
  });
});
