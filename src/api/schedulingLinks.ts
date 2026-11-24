/**
 * Scheduling links + public booking API (T-28).
 *
 * Wraps the backend endpoints from T-27. A failed call is the caller's error,
 * never invented data (PAC-83); the demo's links live in src/demo and answer
 * only in an explicit demo session of a non-production build.
 */

import { z } from "zod";

import { isApiHttpError, requestApi } from "./client";
import { demoOrReal } from "./demoGate";
import type { components, operations } from "./generated/types";
import {
  ArchivedSchedulingLinkDetail as ArchivedSchedulingLinkDetailSchema,
  ArchivedSchedulingLinkListResponse as ArchivedSchedulingLinkListResponseSchema,
  PublicBookingConfirmation as PublicBookingConfirmationSchema,
  SchedulingLinkCoHostChanges as SchedulingLinkCoHostChangesSchema,
  SchedulingLinkBookingRecord as SchedulingLinkBookingRecordSchema,
  SchedulingLinkCreateConflict as SchedulingLinkCreateConflictSchema,
} from "./generated/schemas";
import type { ArchivedSchedulingLinkDetail, ArchivedSchedulingLinkListResponse } from "./types";
import {
  BOOKING_HORIZON_DEFAULT_DAYS,
  BOOKING_HORIZON_MAX_DAYS,
  BOOKING_HORIZON_MIN_DAYS,
} from "./types";
import type {
  BookingConfirmation,
  BookingRefusalMessage,
  BookingSlot,
  CoHostInvite,
  LinkUsageType,
  PublicLinkInfo,
  SchedulingHost,
  SchedulingLink,
  Weekday,
} from "./types";

type BackendSchedulingLink = {
  id: string;
  owner_id?: string;
  owner_user_id?: string;
  slug: string;
  title: string;
  durations?: number[];
  duration_options?: number[];
  days?: string[];
  days_of_week?: number[];
  window_start?: string;
  window_start_time?: string;
  window_end?: string;
  window_end_time?: string;
  buffer_before?: number;
  buffer_after?: number;
  min_notice_minutes?: number;
  usage_type?: LinkUsageType;
  max_uses?: number;
  uses_count?: number;
  active?: boolean;
  created_at?: string;
  is_owner?: boolean;
  my_status?: "accepted" | "pending" | "declined";
  booking_horizon_days?: number;
  refusal_message?: BookingRefusalMessage;
  time_zone?: string;
  hosts?: Array<{
    user_id?: string;
    email: string;
    name?: string;
    avatar_url?: string;
    is_owner?: boolean;
    status: string;
  }>;
  /** PAC-112: present on a create/PATCH answer exactly when the request carried co_host_emails. */
  co_host_changes?: unknown;
};

/** PAC-112 (contract §2.1): what a save did to each listed address, and who it removed. */
export type SchedulingLinkCoHostChanges = components["schemas"]["SchedulingLinkCoHostChanges"];

/**
 * PAC-112: the answer to a create or update. `link` is the server's answer
 * (its roster is built non-strictly, so it is never a co-host baseline, contract
 * §5.1). `co_host_changes` is the server's report, absent when no list was sent,
 * or when a server without PAC-112 answered a save that sent one (§5.3 fallback).
 */
export interface SchedulingLinkSaveResult {
  link: SchedulingLink;
  co_host_changes?: SchedulingLinkCoHostChanges;
  /** True when the request carried `co_host_emails`. */
  co_host_list_sent: boolean;
}

/**
 * The report from a save's answer, parsed strictly with the generated schema.
 * A report that does not parse is treated as absent: the editor then says it
 * could not confirm the co-hosts (contract §5.3 fallback) rather than inventing
 * outcomes, and the save itself, which succeeded, is never reported as failed.
 */
function coHostChangesOf(raw: BackendSchedulingLink): SchedulingLinkCoHostChanges | undefined {
  if (raw.co_host_changes === undefined || raw.co_host_changes === null) return undefined;
  const parsed = SchedulingLinkCoHostChangesSchema.safeParse(raw.co_host_changes);
  return parsed.success ? parsed.data : undefined;
}

/** The current-user read (CurrentUserResponse); the picture is `avatarUrl` there (PAC-35). */
type BackendUser = { id: string; email: string; name?: string; avatarUrl?: string };
type BackendPublicLink = {
  slug: string; title: string; durations?: number[]; duration_options?: number[];
  hosts?: Array<{ email: string; name?: string; avatar_url?: string }>;
  min_notice_minutes?: number; usage_type?: LinkUsageType;
  coverage?: { total: number; checked: number };
  time_zone?: string; booking_horizon_days?: number;
};

type PublicSlotsWire = components["schemas"]["PublicSlotsResponse"];
type PublicSlotsQuery = NonNullable<operations["getPublicBookingSlots"]["parameters"]["query"]>;

/**
 * PAC-88 (contract section 3.1): what the page needs from a slot listing. The
 * four PAC-88 keys are optional because a server without PAC-88 (or after its
 * rollback) omits them; the page detects that by the missing
 * `display_time_zone` echo (contract section 5). Parsed loosely, as before.
 */
export type PublicSlotsAnswer = {
  slots: BookingSlot[];
  available_dates: string[];
} & Partial<Pick<PublicSlotsWire, "time_zone" | "display_time_zone" | "range_from" | "range_to">>;

/**
 * One listing request: `date` (one day of the day zone) or the overview
 * `from`..`to` (at most 42 days). `displayTimeZone` is sent as
 * `display_time_zone` on every request the page makes.
 */
export type PublicSlotsParams = {
  date?: string;
  from?: string;
  to?: string;
  duration?: number;
  displayTimeZone?: string;
};
type BackendHostInvite = { link_id: string; link_title: string; owner_name: string; owner_email: string; invited_at: string };

const WEEKDAY_BY_NUMBER: Record<number, Weekday> = { 0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };
const WEEKDAY_TO_NUMBER: Record<Weekday, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };

function ownerHost(user: BackendUser): SchedulingHost {
  return { user_id: user.id, email: user.email, name: user.name, avatar_url: user.avatarUrl || undefined, is_owner: true, status: "accepted" };
}

function normalizeSchedulingLink(raw: BackendSchedulingLink, user?: BackendUser): SchedulingLink {
  const ownerID = raw.owner_id ?? raw.owner_user_id ?? "";
  const owner = user && ownerID === user.id ? ownerHost(user) : undefined;
  const hosts: SchedulingHost[] = (raw.hosts ?? []).map((host): SchedulingHost => ({
    user_id: host.user_id,
    email: host.email,
    name: host.name,
    // The signed-in user's own entry falls back to their picture from the
    // current-user read (PAC-35 AC-14).
    avatar_url: host.avatar_url || (user && host.user_id === user.id ? user.avatarUrl || undefined : undefined),
    is_owner: host.is_owner ?? host.user_id === ownerID,
    status: host.status === "accepted" ? "accepted" : host.status === "declined" ? "declined" : "pending",
  }));
  if (owner && !hosts.some((host) => host.user_id === user.id)) hosts.unshift(owner);
  const durations = raw.durations ?? raw.duration_options ?? [30];
  const days = raw.days ?? (raw.days_of_week ?? [1, 2, 3, 4, 5]).map((day) => WEEKDAY_BY_NUMBER[day]).filter(Boolean);
  return {
    id: raw.id, owner_id: ownerID, title: raw.title, slug: raw.slug,
    durations: durations.length ? durations : [30],
    days: days as Weekday[],
    window_start: raw.window_start ?? raw.window_start_time ?? "09:00",
    window_end: raw.window_end ?? raw.window_end_time ?? "17:00",
    buffer_before: raw.buffer_before ?? 0, buffer_after: raw.buffer_after ?? 0,
    min_notice_minutes: raw.min_notice_minutes ?? 0,
    usage_type: raw.usage_type ?? "reusable",
    max_uses: raw.max_uses,
    uses_count: raw.uses_count ?? 0,
    active: raw.active ?? true,
    hosts, created_at: raw.created_at || new Date(0).toISOString(),
    is_owner: raw.is_owner ?? owner != null,
    my_status: raw.my_status ?? (owner ? "accepted" : undefined),
    booking_horizon_days: raw.booking_horizon_days ?? BOOKING_HORIZON_DEFAULT_DAYS,
    refusal_message: raw.refusal_message ?? "generic",
    time_zone: raw.time_zone,
  };
}

function backendLinkBody(input: {
  title: string; durations: number[]; days: Weekday[]; window_start: string; window_end: string;
  buffer_before: number; buffer_after: number; min_notice_minutes?: number; usage_type?: LinkUsageType;
  max_uses?: number; active?: boolean;
  booking_horizon_days?: number; refusal_message?: BookingRefusalMessage;
}) {
  return {
    title: input.title, duration_options: input.durations, days_of_week: input.days.map((day) => WEEKDAY_TO_NUMBER[day]),
    window_start_time: input.window_start, window_end_time: input.window_end,
    buffer_before: input.buffer_before, buffer_after: input.buffer_after,
    min_notice_minutes: input.min_notice_minutes ?? 0,
    usage_type: input.usage_type ?? "reusable",
    max_uses: input.max_uses,
    ...(input.active === undefined ? {} : { active: input.active }),
    // PAC-72: sent only when known, so an update never resets them.
    ...(input.booking_horizon_days === undefined ? {} : { booking_horizon_days: input.booking_horizon_days }),
    ...(input.refusal_message === undefined ? {} : { refusal_message: input.refusal_message }),
  };
}


const publicLinkCache = new Map<string, PublicLinkInfo>();

/** Query keys shared by every scheduling-link consumer. */
export const schedulingLinkKeys = {
  links: ["scheduling-links"] as const,
  invites: ["scheduling-link-invites"] as const,
  bookings: (linkId: string) => ["scheduling-link-bookings", linkId] as const,
  /** PAC-40: the owner's archive of deleted links (list + erasure policy). */
  archive: ["scheduling-link-archive"] as const,
  archivedLink: (linkId: string) => ["scheduling-link-archive", linkId] as const,
};

interface LinkBookingBase {
  id: string;
  start: string;
  end: string;
  duration_minutes: number;
  notes?: string;
}

/**
 * PAC-122 SF-093: one booking of the owner's link, as the server sends it
 * (SchedulingLinkBookingRecord). Nothing is added: no invented title, slug or
 * hosts.
 *
 * PAC-134 (contract md 5): an operator may erase a booker's address on a live
 * link. The erased booking is an explicit state (`erased_at` set, name and
 * email null, no notes), never a blank or an old value.
 */
export type LinkBooking =
  | (LinkBookingBase & { booker_name: string; booker_email: string; erased_at?: undefined })
  | (LinkBookingBase & { booker_name: null; booker_email: null; erased_at: string; notes?: undefined });

/**
 * PAC-122 SF-093: the bookings answer is not the contract's array of
 * SchedulingLinkBookingRecord. Shown as the read's error, never as "no
 * bookings".
 */
export class BookingsUnreadableError extends Error {
  constructor() {
    super("The bookings list could not be read. Try again later.");
    this.name = "BookingsUnreadableError";
  }
}

const BookingRecordList = SchedulingLinkBookingRecordSchema.array();

/**
 * PAC-40 §2.2 and PAC-134 §1.1 share the identity rule: the erasure timestamp
 * is set exactly when both the name and email are null. Returns null for an
 * inconsistent identity. Each read applies its own contract's notes rule.
 */
export function bookerErasure(b: {
  booker_name?: string | null;
  booker_email?: string | null;
  booker_erased_at?: string | null;
}): { erased_at: string } | { booker_name: string; booker_email: string } | null {
  // The marker is absent on a live record and null on an archived one, and the
  // two reads' generated types differ accordingly, so each field is read as
  // "has a value or not" rather than against one of the two spellings.
  if (b.booker_erased_at != null) {
    return b.booker_name == null && b.booker_email == null
      ? { erased_at: b.booker_erased_at }
      : null;
  }
  return b.booker_name != null && b.booker_email != null
    ? { booker_name: b.booker_name, booker_email: b.booker_email }
    : null;
}

/**
 * PAC-40 (contract section 7, challenge K4-7): the archive answered 200 but its
 * body does not match the generated schema (for example a field added by a
 * later server). The archive is then unavailable: nothing is shown from it and
 * no erasure is promised. Never a reason to fall back to other data.
 */
export class ArchiveUnavailableError extends Error {
  constructor() {
    super("archive unavailable");
    this.name = "ArchiveUnavailableError";
  }
}

/**
 * 2026-11-22 audit follow-up: the 201 of `POST /book/{slug}` could not be read
 * as the contract's PublicBookingConfirmation.
 *
 * Unlike every other …Unreadable / …Unavailable error here, this one does NOT
 * mean the operation failed. The POST answered 201: the booking exists in the
 * backend. Only the echo of it is unreadable. So the message says the booking
 * was made, and the page renders it as a booking that was made with no retry
 * (src/pages/PublicBooking.tsx). Telling a visitor "something went wrong"
 * after their slot was booked is worse than showing them no details: it
 * invites them to book a second time.
 */
export class BookingConfirmationUnreadableError extends Error {
  constructor() {
    super("Your booking was made, but Paceday could not read the confirmation back.");
    this.name = "BookingConfirmationUnreadableError";
  }
}

/**
 * 2026-11-22 audit follow-up: the public booking 201, parsed rather than cast.
 *
 * The archive and the owner's bookings list parse their whole body against the
 * generated schema and refuse everything on any mismatch (K4-7). This boundary
 * cannot do that, for two reasons:
 *
 *  - A refusal here is a user-visible failure on a booking that SUCCEEDED (see
 *    BookingConfirmationUnreadableError). The blast radius of all-or-nothing is
 *    "every booking looks broken", which is not a trade the archive had to make.
 *  - `hosts` is required by the contract today, but the api repo's in-flight
 *    spec proposes removing host addresses from the public DTOs. A whole-body
 *    strictObject parse would turn the window between the server deploying that
 *    and this repo regenerating its types into an outage. Degrading `hosts` to
 *    an empty list makes that window harmless instead — and emits no address,
 *    which is the point of the removal.
 *
 * So the 201 is parsed field by field, with the generated field schemas (never
 * a shape invented here), split by what a fallback would cost:
 *
 *  - FACTS: the fields the confirmation screen states as the server's own and
 *    for which there is no honest local substitute. Unreadable means there is
 *    nothing truthful to show, so the whole answer is refused.
 *  - `hosts`: required by contract, so a compliant server always sends it.
 *    Unreadable means an EMPTY list — never another answer's hosts. This is the
 *    defect the follow-up closes: it used to fall back to
 *    `publicLinkCache.get(slug)`, whose addresses the ICS builder writes into
 *    ORGANIZER and ATTENDEE, so a one-sided removal of `hosts` from the DTO
 *    would have looked like it worked while still emitting addresses.
 *  - COSMETIC (`link_slug`, `title`, `duration_minutes`): a fallback is both
 *    local and harmless — the slug the visitor is on, the title the page is
 *    already showing, and the length of the slot they booked. None of them is
 *    another party's data and none of them can be wrong about the booking.
 */
const ConfirmationField = PublicBookingConfirmationSchema.shape;
const ConfirmationFacts = z.object({
  id: ConfirmationField.id,
  start: ConfirmationField.start,
  end: ConfirmationField.end,
  booker_name: ConfirmationField.booker_name,
  booker_email: ConfirmationField.booker_email,
});
/** `raw.<field>` against its generated schema, or `fallback` when it does not parse. */
function readField<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

/**
 * A public slug the server could not be holding: the contract stores a slug
 * normalised to lowercase alphanumerics and dashes (`createSchedulingLink`
 * request, `slug`), so anything else names no link.
 *
 * It matters because a slug arrives from the route (`useParams`, already
 * URL-decoded) and is interpolated into a request path. `requestApi` builds
 * its URL with `new URL()`, which resolves `..`, so a slug such as
 * `../../admin/sso/providers` would silently aim a request — the booking POST
 * included — at another endpoint. The three public calls refuse such a slug
 * before any request leaves the browser, and encode what they do send.
 *
 * `message` is the demo's `not_found` wording so the booking page shows its
 * existing "Link not found", which is the truth, rather than a 404 from a
 * request it should never have made (src/pages/PublicBooking.tsx).
 */
export class InvalidLinkSlugError extends Error {
  constructor() {
    super("not_found");
    this.name = "InvalidLinkSlugError";
  }
}

/** True when `slug` is a slug the backend could hold. */
function isPublicSlug(slug: string): boolean {
  return /^[a-z0-9-]{1,80}$/.test(slug);
}


export interface LinkFormValues {
  title: string;
  durations: number[];
  days: Weekday[];
  window_start: string;
  window_end: string;
  buffer_before: number;
  buffer_after: number;
  min_notice_minutes: number;
  usage_type: LinkUsageType;
  max_uses?: number;
  /** PAC-72 D-1: 1..365 days. Absent: the server's default (60) on create, unchanged on update. */
  booking_horizon_days?: number;
  /** PAC-72 D-2/D-5. Absent: generic on create, unchanged on update. */
  refusal_message?: BookingRefusalMessage;
}

/**
 * Client-side validation mirroring the frozen backend constraints.
 * Returns a human-readable message, or null when the payload is acceptable.
 */
export function validateLinkForm(v: LinkFormValues): string | null {
  if (!v.title.trim()) return "Give the link a title.";
  if (!v.durations.length) return "Pick at least one duration.";
  if (v.durations.some((d) => !Number.isFinite(d) || d <= 0)) return "Durations must be positive.";
  if (!v.days.length) return "Pick at least one available day.";
  const [sh, sm] = v.window_start.split(":").map(Number);
  const [eh, em] = v.window_end.split(":").map(Number);
  if (!Number.isFinite(sh) || !Number.isFinite(eh)) return "Enter a valid time window.";
  if (sh * 60 + (sm || 0) >= eh * 60 + (em || 0)) return "The start time must be before the end time.";
  if (v.buffer_before < 0 || v.buffer_after < 0) return "Buffers can't be negative.";
  if (v.min_notice_minutes < 0) return "Minimum notice can't be negative.";
  if (
    v.booking_horizon_days !== undefined &&
    (!Number.isInteger(v.booking_horizon_days) ||
      v.booking_horizon_days < BOOKING_HORIZON_MIN_DAYS ||
      v.booking_horizon_days > BOOKING_HORIZON_MAX_DAYS)
  ) {
    return `Visitors can book between ${BOOKING_HORIZON_MIN_DAYS} and ${BOOKING_HORIZON_MAX_DAYS} days ahead.`;
  }
  if (v.refusal_message !== undefined && v.refusal_message !== "generic" && v.refusal_message !== "specific") {
    return "Pick how refused bookings are explained.";
  }
  if (v.usage_type === "recurring" && (!v.max_uses || v.max_uses < 1)) {
    return "Recurring links need a maximum number of bookings (1 or more).";
  }
  const shortest = Math.min(...v.durations);
  const windowMinutes = eh * 60 + (em || 0) - (sh * 60 + (sm || 0));
  if (shortest > windowMinutes) return "The shortest duration doesn't fit inside the availability window.";
  return null;
}

/** Deterministic public URL for a link slug returned by the backend. */
export function publicBookingUrl(slug: string, origin: string = window.location.origin): string {
  return `${origin.replace(/\/+$/, "")}/book/${slug}`;
}

/**
 * The same URL without its scheme, for display. Derived from publicBookingUrl
 * so what a card shows is always exactly what Copy puts on the clipboard.
 */
export function publicBookingDisplayUrl(slug: string, origin?: string): string {
  return publicBookingUrl(slug, origin).replace(/^https?:\/\//, "");
}

/**
 * Guard mirroring the backend's strict 422 validation. We never send a body the
 * backend would reject (empty arrays, inverted window, negative buffers/notice,
 * invalid usage_type, recurring without a positive max_uses).
 */
export class LinkValidationError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = "LinkValidationError";
  }
}

function assertValidLinkBody(v: LinkFormValues): void {
  const problem = validateLinkForm(v);
  if (problem) throw new LinkValidationError(problem);
  if (!["reusable", "recurring", "single_use"].includes(v.usage_type)) {
    throw new LinkValidationError("Pick a valid link type.");
  }
}

// ---------- Public API ----------

export const schedulingLinksApi = {
  // ----- authenticated: links management -----

  listLinks: () =>
    demoOrReal<{ owned: SchedulingLink[]; shared: SchedulingLink[] }>("schedulingLinksApi.listLinks", [], async () => {
        const [raw, user] = await Promise.all([
          requestApi<{ owned?: BackendSchedulingLink[]; shared?: BackendSchedulingLink[] }>("GET", "/scheduling-links/"),
          requestApi<BackendUser>("GET", "/auth/me").catch(() => undefined),
        ]);
        const links = [...(raw.owned ?? []), ...(raw.shared ?? [])].map((link) => normalizeSchedulingLink(link, user));
        return { owned: links.filter((link) => link.is_owner), shared: links.filter((link) => !link.is_owner) };
      }),

  listInvites: () =>
    demoOrReal<CoHostInvite[]>("schedulingLinksApi.listInvites", [], async () => {
        const [rawInvites] = await Promise.all([
          requestApi<BackendHostInvite[]>("GET", "/scheduling-links/host-invites"),
        ]);
        return (rawInvites ?? []).map((invite) => ({
          link_id: invite.link_id,
          link_title: invite.link_title,
          owner_name: invite.owner_name,
          owner_email: invite.owner_email,
          invited_at: invite.invited_at,
        }));
      }),

  acceptInvite: (linkId: string) =>
    demoOrReal<void>("schedulingLinksApi.acceptInvite", [linkId], () => requestApi("POST", `/scheduling-links/host-invites/${encodeURIComponent(linkId)}/accept`)),

  declineInvite: (linkId: string) =>
    demoOrReal<void>("schedulingLinksApi.declineInvite", [linkId], () => requestApi("POST", `/scheduling-links/host-invites/${encodeURIComponent(linkId)}/decline`)),

  /**
   * PAC-112 (contract §5.1): GET /scheduling-links/{id}, the strict single-link
   * read. It answers 500 rather than a degraded roster (PAC-25), so it is the
   * only read the link editor takes its co-host baseline from.
   */
  getLink: (id: string) =>
    demoOrReal<SchedulingLink>("schedulingLinksApi.getLink", [id], async () => {
        const [detail, user] = await Promise.all([
          requestApi<BackendSchedulingLink>("GET", `/scheduling-links/${encodeURIComponent(id)}`),
          requestApi<BackendUser>("GET", "/auth/me").catch(() => undefined),
        ]);
        return normalizeSchedulingLink(detail, user);
      }),

  /**
   * POST /scheduling-links/. PAC-112: `co_host_emails` is sent only when the
   * caller passes it (the editor passes it only when the list changed, `[]`
   * included), in the same request as the fields. The answer's
   * `co_host_changes` is returned as the server gave it; no host is padded in.
   *
   * PAC-119 (contract §7.1): `idempotencyKey` labels one logical create
   * (header Idempotency-Key), a separate argument as in bookSlot. The editor
   * makes it on its first Create link press and re-sends it on every further
   * press of that editor session, so a retry after a lost answer never
   * creates a second link. The demo receives `[input]` only and ignores it.
   */
  createLink: (input: {
    title: string; slug: string; durations: number[]; days: Weekday[]; window_start: string; window_end: string;
    buffer_before: number; buffer_after: number; min_notice_minutes: number; usage_type: LinkUsageType;
    max_uses?: number; co_host_emails?: string[];
    booking_horizon_days?: number; refusal_message?: BookingRefusalMessage;
  }, idempotencyKey?: string) => {
    assertValidLinkBody(input);
    return demoOrReal<SchedulingLinkSaveResult>("schedulingLinksApi.createLink", [input], async () => {
        const listSent = input.co_host_emails !== undefined;
        const raw = await requestApi<BackendSchedulingLink>(
          "POST",
          "/scheduling-links/",
          {
            ...backendLinkBody(input),
            ...(listSent ? { co_host_emails: input.co_host_emails } : {}),
          },
          undefined,
          undefined,
          idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
        );
        const user = await requestApi<BackendUser>("GET", "/auth/me").catch(() => undefined);
        return { link: normalizeSchedulingLink(raw, user), co_host_changes: coHostChangesOf(raw), co_host_list_sent: listSent };
      });
  },


  updateLink: (id: string, input: Partial<{
    title: string; slug: string; durations: number[]; days: Weekday[]; window_start: string; window_end: string;
    buffer_before: number; buffer_after: number; min_notice_minutes: number; usage_type: LinkUsageType;
    max_uses: number | undefined; active: boolean; co_host_emails: string[];
    booking_horizon_days: number; refusal_message: BookingRefusalMessage;
  }>) =>
    demoOrReal<SchedulingLinkSaveResult>("schedulingLinksApi.updateLink", [id, input], async () => {
        const current = await requestApi<BackendSchedulingLink>("GET", `/scheduling-links/${encodeURIComponent(id)}`);
        const merged: LinkFormValues = {
          title: input.title ?? current.title,
          durations: input.durations ?? current.durations ?? current.duration_options ?? [30],
          days: (input.days ?? current.days ?? current.days_of_week?.map((day) => WEEKDAY_BY_NUMBER[day]).filter(Boolean) ?? ["mon", "tue", "wed", "thu", "fri"]) as Weekday[],
          window_start: input.window_start ?? current.window_start ?? current.window_start_time ?? "09:00",
          window_end: input.window_end ?? current.window_end ?? current.window_end_time ?? "17:00",
          buffer_before: input.buffer_before ?? current.buffer_before ?? 0,
          buffer_after: input.buffer_after ?? current.buffer_after ?? 0,
          min_notice_minutes: input.min_notice_minutes ?? current.min_notice_minutes ?? 0,
          usage_type: input.usage_type ?? current.usage_type ?? "reusable",
          max_uses: input.max_uses ?? current.max_uses,
          // PAC-72: what the server holds unless the editor changed it; never
          // reset by an edit of another field.
          booking_horizon_days: input.booking_horizon_days ?? current.booking_horizon_days,
          refusal_message: input.refusal_message ?? current.refusal_message,
        };
        assertValidLinkBody(merged);
        // PAC-112: the co-host list travels in the PATCH itself (one request,
        // all or nothing, PAC-101); absent when the caller did not pass it.
        const listSent = input.co_host_emails !== undefined;
        const body = {
          ...backendLinkBody({ ...merged, active: input.active }),
          ...(listSent ? { co_host_emails: input.co_host_emails } : {}),
        };
        const raw = await requestApi<BackendSchedulingLink>("PATCH", `/scheduling-links/${encodeURIComponent(id)}`, body);
        const user = await requestApi<BackendUser>("GET", "/auth/me").catch(() => undefined);
        return { link: normalizeSchedulingLink(raw, user), co_host_changes: coHostChangesOf(raw), co_host_list_sent: listSent };
      }),

  deleteLink: (id: string) =>
    demoOrReal<void>("schedulingLinksApi.deleteLink", [id], () => requestApi("DELETE", `/scheduling-links/${encodeURIComponent(id)}`)),

  leaveLink: (id: string) =>
    demoOrReal<void>("schedulingLinksApi.leaveLink", [id], () => requestApi("POST", `/scheduling-links/${encodeURIComponent(id)}/leave`)),

  /** GET /scheduling-links/:id/bookings — bookings already made on a link. */
  listBookings: (id: string) =>
    demoOrReal<LinkBooking[]>("schedulingLinksApi.listBookings", [id], async () => {
        const raw = await requestApi<unknown>("GET", `/scheduling-links/${encodeURIComponent(id)}/bookings`);
        const parsed = BookingRecordList.safeParse(raw);
        if (!parsed.success) throw new BookingsUnreadableError();
        return parsed.data.map((b): LinkBooking => {
          const base = {
            id: b.id,
            start: b.start_time,
            end: b.end_time,
            duration_minutes: Math.round((new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 60_000),
          };
          const booker = bookerErasure(b);
          if (!booker) throw new BookingsUnreadableError();
          if ("erased_at" in booker) {
            // PAC-134 §1.1: operator erasure blanks live booking notes.
            if (b.notes !== "") throw new BookingsUnreadableError();
            return { ...base, booker_name: null, booker_email: null, erased_at: booker.erased_at };
          }
          return { ...base, ...booker, ...(b.notes ? { notes: b.notes } : {}) };
        });
      }),

  /**
   * PAC-40: GET /scheduling-links/archive, the caller's deleted links (most
   * recently deleted first) and the server's BookerErasurePolicy. Parsed
   * strictly with the generated schema; a body that fails it is
   * ArchiveUnavailableError (K4-7). An HTTP or transport failure is the
   * caller's error as for every other read (PAC-83).
   */
  listArchive: () =>
    demoOrReal<ArchivedSchedulingLinkListResponse>("schedulingLinksApi.listArchive", [], async () => {
        const raw = await requestApi<unknown>("GET", "/scheduling-links/archive");
        const parsed = ArchivedSchedulingLinkListResponseSchema.safeParse(raw);
        if (!parsed.success) throw new ArchiveUnavailableError();
        // Validated above; the cast only bridges zod's inferred type (nullable
        // fields) to the generated contract type it was generated from.
        return parsed.data as ArchivedSchedulingLinkListResponse;
      }),

  /**
   * PAC-40: GET /scheduling-links/archive/:id, one deleted link and every one
   * of its bookings. 404 (unknown, live, paused or not the caller's) reaches the
   * caller as an ApiHttpError; a body that fails the schema is
   * ArchiveUnavailableError.
   *
   * PAC-40 automatic erasure retains notes in the response. Strip them from
   * erased bookings before returning the detail to React Query and the UI.
   */
  getArchivedLink: (id: string) =>
    demoOrReal<ArchivedSchedulingLinkDetail>("schedulingLinksApi.getArchivedLink", [id], async () => {
        const raw = await requestApi<unknown>("GET", `/scheduling-links/archive/${encodeURIComponent(id)}`);
        const parsed = ArchivedSchedulingLinkDetailSchema.safeParse(raw);
        if (!parsed.success) throw new ArchiveUnavailableError();
        const bookings = parsed.data.bookings.map((b) => {
          const booker = bookerErasure(b);
          if (!booker) throw new ArchiveUnavailableError();
          return "erased_at" in booker ? { ...b, notes: "" } : b;
        });
        return { ...parsed.data, bookings } as ArchivedSchedulingLinkDetail;
      }),


  // ----- public: booking flow -----

  getPublicLink: (slug: string) => {
    if (!isPublicSlug(slug)) throw new InvalidLinkSlugError();
    return demoOrReal<PublicLinkInfo>("schedulingLinksApi.getPublicLink", [slug], async () => {
        const raw = await requestApi<BackendPublicLink>("GET", `/book/${encodeURIComponent(slug)}`);
        const info: PublicLinkInfo = {
          slug: raw.slug, title: raw.title,
          durations: (raw.durations ?? raw.duration_options ?? [30]).slice(),
          hosts: raw.hosts ?? [],
          min_notice_minutes: raw.min_notice_minutes,
          usage_type: raw.usage_type,
          coverage: raw.coverage,
          // PAC-88 (spec 2.2): the page shows times in this zone by default.
          time_zone: raw.time_zone,
          booking_horizon_days: raw.booking_horizon_days,
        };
        publicLinkCache.set(slug, info);
        return info;
      });
  },

  getPublicSlots: (slug: string, params: PublicSlotsParams): Promise<PublicSlotsAnswer> => {
    if (!isPublicSlug(slug)) return Promise.reject(new InvalidLinkSlugError());
    // PAC-88 (contract section 3.1): a request without `date` is the day
    // overview and needs `from` and `to`; the page never sends the date-less
    // overview without them (no whole-horizon read).
    if (!params.date && !(params.from && params.to)) {
      return Promise.reject(new Error("getPublicSlots needs a date, or from and to"));
    }
    return demoOrReal<PublicSlotsAnswer>("schedulingLinksApi.getPublicSlots", [slug, params], async () => {
        const query: { [K in keyof PublicSlotsQuery]?: string } = {
          display_time_zone: params.displayTimeZone,
          date: params.date,
          from: params.date ? undefined : params.from,
          to: params.date ? undefined : params.to,
          duration: params.duration ? String(params.duration) : undefined,
        };
        const raw = await requestApi<BookingSlot[] | Partial<PublicSlotsWire>>(
          "GET",
          `/book/${encodeURIComponent(slug)}/slots`,
          undefined,
          query,
        );
        if (Array.isArray(raw)) return { slots: raw, available_dates: [] };
        return {
          slots: raw.slots ?? [],
          available_dates: raw.available_dates ?? [],
          time_zone: raw.time_zone,
          display_time_zone: raw.display_time_zone,
          range_from: raw.range_from,
          range_to: raw.range_to,
        };
      });
  },


  // Booking is the one public action that must never be faked. If the backend
  // is unreachable, falling back would tell an external booker "You are
  // confirmed!" for a booking that does not exist. Preview data is used only
  // in an explicit demo session; otherwise the real call's error reaches the
  // page, which already says it can't reach the scheduling service.
  //
  // PAC-82: `idempotencyKey` labels one booking attempt (header
  // Idempotency-Key). The page makes a fresh key per attempt and re-sends the
  // same key, with the same input, only for that attempt's "Try again"; the
  // server then answers the booking that attempt saved, never a second one.
  bookSlot: (
    slug: string,
    input: { start: string; duration_minutes: number; name: string; email: string; notes?: string },
    idempotencyKey?: string,
  ) => {
    if (!isPublicSlug(slug)) throw new InvalidLinkSlugError();
    return demoOrReal<BookingConfirmation>("schedulingLinksApi.bookSlot", [slug, input], async () => {
        const end = new Date(new Date(input.start).getTime() + input.duration_minutes * 60_000).toISOString();
        const raw: unknown = await requestApi<unknown>(
          "POST",
          `/book/${encodeURIComponent(slug)}`,
          { name: input.name, email: input.email, start: input.start, end, duration: input.duration_minutes, notes: input.notes },
          undefined,
          undefined,
          idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
        );
        // See ConfirmationFacts for why this boundary parses by field rather
        // than refusing the whole body as the archive reads do.
        const facts = ConfirmationFacts.safeParse(raw);
        if (!facts.success) throw new BookingConfirmationUnreadableError();
        const body = (raw ?? {}) as Record<string, unknown>;
        const link = publicLinkCache.get(slug);
        return {
          ...facts.data,
          link_slug: readField(ConfirmationField.link_slug, body.link_slug, slug),
          title: readField(ConfirmationField.title, body.title, link?.title ?? slug),
          duration_minutes: readField(
            ConfirmationField.duration_minutes,
            body.duration_minutes,
            Math.round((new Date(facts.data.end).getTime() - new Date(facts.data.start).getTime()) / 60_000),
          ),
          // Never `link?.hosts`: the cached lookup's addresses are another
          // answer's data, and the ICS builder writes them into ORGANIZER and
          // ATTENDEE. An unreadable required field is an empty list.
          hosts: readField(ConfirmationField.hosts, body.hosts, []),
          notes: readField(ConfirmationField.notes, body.notes, undefined),
        };
      });
  },
};

/** PAC-119: the 409 of a link create, one of three variants told apart by `error` alone. */
export type SchedulingLinkCreateConflict = components["schemas"]["SchedulingLinkCreateConflict"];

/**
 * PAC-119 (contract §1.3, §7.4): the create 409's variant, parsed strictly
 * against the generated `oneOf`, or null when `e` is not such a 409. A body
 * that matches no variant is null too, so it keeps today's handling.
 */
export function linkCreateConflict(e: unknown): SchedulingLinkCreateConflict | null {
  if (!isApiHttpError(e) || e.status !== 409) return null;
  const parsed = SchedulingLinkCreateConflictSchema.safeParse(e.data);
  return parsed.success ? (parsed.data as SchedulingLinkCreateConflict) : null;
}

/**
 * PAC-82 (spec D-8): a fresh key for one booking attempt, a random UUID (v4
 * form) from the platform's cryptographic generator. It fits the contract's
 * Idempotency-Key format (16 to 255 of A-Z a-z 0-9 - _). getRandomValues,
 * unlike randomUUID, also exists outside a secure context. Kept in page
 * memory only: never stored. PAC-119 (contract §7.1) uses the same generator,
 * unchanged, for a link create's key.
 */
export function newBookingAttemptKey(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
