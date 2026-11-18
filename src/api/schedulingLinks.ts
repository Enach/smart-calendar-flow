/**
 * Scheduling links + public booking API (T-28).
 *
 * Wraps the backend endpoints from T-27. A failed call is the caller's error,
 * never invented data (PAC-83); the demo's links live in src/demo and answer
 * only in an explicit demo session of a non-production build.
 */

import { isApiHttpError, requestApi } from "./client";
import { demoOrReal } from "./demoGate";
import type { components, operations } from "./generated/types";
import {
  ArchivedSchedulingLinkDetail as ArchivedSchedulingLinkDetailSchema,
  ArchivedSchedulingLinkListResponse as ArchivedSchedulingLinkListResponseSchema,
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
/**
 * GET /scheduling-links/:id/bookings returns the contract's
 * SchedulingLinkBookingRecord: `start_time`/`end_time`, no title or slug.
 * `start`/`end` are kept for the mock and older payloads.
 */
/** The public booking answer (bookSlot). */
type BackendBooking = {
  id: string; link_slug?: string; title?: string; start?: string; end?: string;
  start_time?: string; end_time?: string;
  duration_minutes?: number; hosts?: Array<{ email: string; name?: string; avatar_url?: string }>;
  booker_name: string; booker_email: string; notes?: string;
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

/**
 * PAC-40 (contract section 7, challenge K4-7): the archive answered 200 but its
 * body does not match the generated schema (for example a field added by a
 * later server). The archive is then unavailable: nothing is shown from it and
 * no erasure is promised. Never a reason to fall back to other data.
 */
/**
 * PAC-122 SF-093: one booking of the owner's link, as the server sends it
 * (SchedulingLinkBookingRecord). Nothing is added: no invented title, slug or
 * hosts.
 */
export interface LinkBooking {
  id: string;
  start: string;
  end: string;
  duration_minutes: number;
  booker_name: string;
  booker_email: string;
  notes?: string;
}

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

export class ArchiveUnavailableError extends Error {
  constructor() {
    super("archive unavailable");
    this.name = "ArchiveUnavailableError";
  }
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
    demoOrReal<void>("schedulingLinksApi.acceptInvite", [linkId], () => requestApi("POST", `/scheduling-links/host-invites/${linkId}/accept`)),

  declineInvite: (linkId: string) =>
    demoOrReal<void>("schedulingLinksApi.declineInvite", [linkId], () => requestApi("POST", `/scheduling-links/host-invites/${linkId}/decline`)),

  /**
   * PAC-112 (contract §5.1): GET /scheduling-links/{id}, the strict single-link
   * read. It answers 500 rather than a degraded roster (PAC-25), so it is the
   * only read the link editor takes its co-host baseline from.
   */
  getLink: (id: string) =>
    demoOrReal<SchedulingLink>("schedulingLinksApi.getLink", [id], async () => {
        const [detail, user] = await Promise.all([
          requestApi<BackendSchedulingLink>("GET", `/scheduling-links/${id}`),
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
        const current = await requestApi<BackendSchedulingLink>("GET", `/scheduling-links/${id}`);
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
        const raw = await requestApi<BackendSchedulingLink>("PATCH", `/scheduling-links/${id}`, body);
        const user = await requestApi<BackendUser>("GET", "/auth/me").catch(() => undefined);
        return { link: normalizeSchedulingLink(raw, user), co_host_changes: coHostChangesOf(raw), co_host_list_sent: listSent };
      }),

  deleteLink: (id: string) =>
    demoOrReal<void>("schedulingLinksApi.deleteLink", [id], () => requestApi("DELETE", `/scheduling-links/${id}`)),

  leaveLink: (id: string) =>
    demoOrReal<void>("schedulingLinksApi.leaveLink", [id], () => requestApi("POST", `/scheduling-links/${id}/leave`)),

  /** GET /scheduling-links/:id/bookings — bookings already made on a link. */
  listBookings: (id: string) =>
    demoOrReal<LinkBooking[]>("schedulingLinksApi.listBookings", [id], async () => {
        const raw = await requestApi<unknown>("GET", `/scheduling-links/${id}/bookings`);
        const parsed = BookingRecordList.safeParse(raw);
        if (!parsed.success) throw new BookingsUnreadableError();
        return parsed.data.map((b) => ({
          id: b.id,
          start: b.start_time,
          end: b.end_time,
          duration_minutes: Math.round((new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 60_000),
          booker_name: b.booker_name,
          booker_email: b.booker_email,
          ...(b.notes ? { notes: b.notes } : {}),
        }));
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
   */
  getArchivedLink: (id: string) =>
    demoOrReal<ArchivedSchedulingLinkDetail>("schedulingLinksApi.getArchivedLink", [id], async () => {
        const raw = await requestApi<unknown>("GET", `/scheduling-links/archive/${encodeURIComponent(id)}`);
        const parsed = ArchivedSchedulingLinkDetailSchema.safeParse(raw);
        if (!parsed.success) throw new ArchiveUnavailableError();
        return parsed.data as ArchivedSchedulingLinkDetail;
      }),


  // ----- public: booking flow -----

  getPublicLink: (slug: string) =>
    demoOrReal<PublicLinkInfo>("schedulingLinksApi.getPublicLink", [slug], async () => {
        const raw = await requestApi<BackendPublicLink>("GET", `/book/${slug}`);
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
      }),

  getPublicSlots: (slug: string, params: PublicSlotsParams): Promise<PublicSlotsAnswer> => {
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
          `/book/${slug}/slots`,
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
  ) =>
    demoOrReal<BookingConfirmation>("schedulingLinksApi.bookSlot", [slug, input], async () => {
        const end = new Date(new Date(input.start).getTime() + input.duration_minutes * 60_000).toISOString();
        const raw = await requestApi<BackendBooking>(
          "POST",
          `/book/${slug}`,
          { name: input.name, email: input.email, start: input.start, end, duration: input.duration_minutes, notes: input.notes },
          undefined,
          undefined,
          idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
        );
        const link = publicLinkCache.get(slug);
        return {
          id: raw.id, link_slug: raw.link_slug ?? slug, title: raw.title ?? link?.title ?? slug,
          start: raw.start, end: raw.end,
          duration_minutes: raw.duration_minutes ?? Math.round((new Date(raw.end).getTime() - new Date(raw.start).getTime()) / 60_000),
          hosts: raw.hosts ?? link?.hosts ?? [], booker_name: raw.booker_name, booker_email: raw.booker_email, notes: raw.notes,
        };
      }),
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
