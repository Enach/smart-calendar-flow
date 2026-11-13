/**
 * PAC-40 wire fixtures: archive answers exactly as the contract (bundle A,
 * sha256 d5cf6be9...) shapes them. Shared by the API and page tests.
 */
export const LINK_ID = "5b0f7a52-8c1e-4d7a-9a51-3f0e2b6c4d10";
export const OTHER_LINK_ID = "6c1a8b63-9d2f-4e8b-8b62-4a1f3c7d5e21";
export const BOOKING_ID = "7d2b9c74-ae30-4f9c-9c73-5b2a4d8e6f32";
export const ERASED_BOOKING_ID = "8e3cad85-bf41-4aad-8d84-6c3b5e9f7a43";

export const POLICY_A = { enabled: false, retention_days: 90 };
export const POLICY_B = { enabled: true, retention_days: 90 };

/** A part-A archive entry: awaiting erasure, no due date (enabled is false). */
export const ARCHIVED_A = {
  id: LINK_ID,
  title: "Intro call",
  slug: "intro-call",
  deleted_at: "2026-11-10T09:00:00Z",
  bookings_count: 2,
  last_booking_end_at: "2026-12-01T10:30:00Z",
  erasure_state: "awaiting_erasure",
  erasure_due_at: null,
  erased_at: null,
} as const;

export const ARCHIVED_EMPTY = {
  id: OTHER_LINK_ID,
  title: "Old demo",
  slug: "old-demo",
  deleted_at: "2026-11-01T09:00:00Z",
  bookings_count: 0,
  last_booking_end_at: null,
  erasure_state: "no_bookings",
  erasure_due_at: null,
  erased_at: null,
} as const;

export const BOOKING = {
  id: BOOKING_ID,
  link_id: LINK_ID,
  booker_name: "Ada Lovelace",
  booker_email: "ada@example.com",
  booker_erased_at: null,
  start_time: "2026-12-01T10:00:00Z",
  end_time: "2026-12-01T10:30:00Z",
  status: "confirmed",
  notes: "About the roadmap",
  created_at: "2026-11-05T08:00:00Z",
};

/** An erased booking (contract section 2.2): null name and email, timestamp set. */
export const ERASED_BOOKING = {
  id: ERASED_BOOKING_ID,
  link_id: LINK_ID,
  booker_name: null,
  booker_email: null,
  booker_erased_at: "2027-03-01T03:00:00Z",
  start_time: "2026-11-20T10:00:00Z",
  end_time: "2026-11-20T10:30:00Z",
  status: "cancelled",
  notes: "",
  created_at: "2026-11-04T08:00:00Z",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function requestPath(input: RequestInfo | URL): string {
  const url = input instanceof Request ? input.url : String(input);
  return new URL(url, window.location.origin).pathname;
}
