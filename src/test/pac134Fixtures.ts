/** PAC-134: SchedulingLinkBookingRecord answers of GET /scheduling-links/{id}/bookings. */

/** A booking whose booker was not erased: unchanged by PAC-134. */
export const LIVE = {
  id: "7b0e7c1e-4a49-4d7e-9a43-2f4e0a6b5c11",
  link_id: "8c1f8d2f-5b5a-4e8f-8b54-3f5f1b7c6d22",
  booker_name: "Zoe",
  booker_email: "zoe@co.com",
  start_time: "2026-12-02T09:00:00Z",
  end_time: "2026-12-02T09:30:00Z",
  status: "confirmed",
  notes: "Agenda",
  created_at: "2026-11-30T12:00:00Z",
};

/** An erased live booking (contract md 1.1): booker_erased_at set, null name and email, blank notes. */
export const ERASED = {
  id: "9d2a9e3f-6c6b-4f9f-9c65-4a6a2c8d7e33",
  link_id: "8c1f8d2f-5b5a-4e8f-8b54-3f5f1b7c6d22",
  booker_name: null,
  booker_email: null,
  booker_erased_at: "2027-03-01T12:00:00Z",
  start_time: "2026-12-03T14:00:00Z",
  end_time: "2026-12-03T15:00:00Z",
  status: "confirmed",
  notes: "",
  created_at: "2026-11-29T12:00:00Z",
};
