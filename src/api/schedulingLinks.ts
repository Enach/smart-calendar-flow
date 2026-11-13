/**
 * Scheduling links + public booking API (T-28).
 *
 * Wraps the backend endpoints from T-27. A failed call is the caller's error,
 * never invented data (PAC-83); the demo's links live in src/demo and answer
 * only in an explicit demo session of a non-production build.
 */

import { requestApi } from "./client";
import { demoOrReal } from "./demoGate";
import type { components, operations } from "./generated/types";
import {
  ArchivedSchedulingLinkDetail as ArchivedSchedulingLinkDetailSchema,
  ArchivedSchedulingLinkListResponse as ArchivedSchedulingLinkListResponseSchema,
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
};

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

/**
 * A co-host the server has not listed yet (its invite is still being sent):
 * shown by address only — never with a name from anywhere else.
 */
function pendingHost(email: string): SchedulingHost {
  return { email, is_owner: false, status: "pending" };
}

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

  createLink: (input: {
    title: string; slug: string; durations: number[]; days: Weekday[]; window_start: string; window_end: string;
    buffer_before: number; buffer_after: number; min_notice_minutes: number; usage_type: LinkUsageType;
    max_uses?: number; co_host_emails: string[];
    booking_horizon_days?: number; refusal_message?: BookingRefusalMessage;
  }) => {
    assertValidLinkBody(input);
    return demoOrReal<SchedulingLink>("schedulingLinksApi.createLink", [input], async () => {
        const raw = await requestApi<BackendSchedulingLink>("POST", "/scheduling-links/", backendLinkBody(input));

        await Promise.allSettled(input.co_host_emails.map((email) =>
          requestApi("POST", `/scheduling-links/${raw.id}/hosts`, { email }),
        ));
        const [user, detail] = await Promise.all([
          requestApi<BackendUser>("GET", "/auth/me").catch(() => undefined),
          requestApi<BackendSchedulingLink>("GET", `/scheduling-links/${raw.id}`),
        ]);
        const link = normalizeSchedulingLink(detail, user);
        const existing = new Set(link.hosts.map((host) => host.email.toLowerCase()));
        link.hosts.push(...input.co_host_emails.filter((email) => !existing.has(email.toLowerCase())).map((email) => pendingHost(email)));
        return link;
      });
  },


  updateLink: (id: string, input: Partial<{
    title: string; slug: string; durations: number[]; days: Weekday[]; window_start: string; window_end: string;
    buffer_before: number; buffer_after: number; min_notice_minutes: number; usage_type: LinkUsageType;
    max_uses: number | undefined; active: boolean; co_host_emails: string[];
    booking_horizon_days: number; refusal_message: BookingRefusalMessage;
  }>) =>
    demoOrReal<SchedulingLink>("schedulingLinksApi.updateLink", [id, input], async () => {
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
        const body = backendLinkBody({ ...merged, active: input.active });
        await requestApi<BackendSchedulingLink>("PATCH", `/scheduling-links/${id}`, body);

        if (input.co_host_emails) {
          // Invite only people who are not hosts yet. Re-inviting an existing
          // co-host used to reset an accepted one to pending, dropping their
          // calendar from the link's slots (PAC-61); the server no longer does
          // that, but there is no reason to send the request at all.
          const existing = new Set((current.hosts ?? []).map((h) => h.email.toLowerCase()));
          const added = input.co_host_emails.filter((email) => !existing.has(email.trim().toLowerCase()));
          await Promise.allSettled(added.map((email) =>
            requestApi("POST", `/scheduling-links/${id}/hosts`, { email }),
          ));
        }
        const [user, detail] = await Promise.all([
          requestApi<BackendUser>("GET", "/auth/me").catch(() => undefined),
          requestApi<BackendSchedulingLink>("GET", `/scheduling-links/${id}`),
        ]);
        const link = normalizeSchedulingLink(detail, user);
        for (const email of input.co_host_emails ?? []) {
          if (!link.hosts.some((host) => host.email.toLowerCase() === email.toLowerCase())) link.hosts.push(pendingHost(email));
        }
        return link;
      }),

  deleteLink: (id: string) =>
    demoOrReal<void>("schedulingLinksApi.deleteLink", [id], () => requestApi("DELETE", `/scheduling-links/${id}`)),

  leaveLink: (id: string) =>
    demoOrReal<void>("schedulingLinksApi.leaveLink", [id], () => requestApi("POST", `/scheduling-links/${id}/leave`)),

  /** GET /scheduling-links/:id/bookings — bookings already made on a link. */
  listBookings: (id: string) =>
    demoOrReal<BookingConfirmation[]>("schedulingLinksApi.listBookings", [id], async () => {
        const raw = await requestApi<BackendBooking[] | { bookings?: BackendBooking[] }>(
          "GET",
          `/scheduling-links/${id}/bookings`,
        );
        const items = Array.isArray(raw) ? raw : raw?.bookings ?? [];
        return items.map((b) => {
          const start = b.start_time ?? b.start ?? "";
          const end = b.end_time ?? b.end ?? "";
          return {
          id: b.id,
          link_slug: b.link_slug ?? "",
          title: b.title ?? "Booking",
          start,
          end,
          duration_minutes:
            b.duration_minutes ?? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000),
          hosts: b.hosts ?? [],
          booker_name: b.booker_name,
          booker_email: b.booker_email,
          notes: b.notes,
          };
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
  bookSlot: (
    slug: string,
    input: { start: string; duration_minutes: number; name: string; email: string; notes?: string },
  ) =>
    demoOrReal<BookingConfirmation>("schedulingLinksApi.bookSlot", [slug, input], async () => {
        const end = new Date(new Date(input.start).getTime() + input.duration_minutes * 60_000).toISOString();
        const raw = await requestApi<BackendBooking>("POST", `/book/${slug}`, {
          name: input.name, email: input.email, start: input.start, end, duration: input.duration_minutes, notes: input.notes,
        });
        const link = publicLinkCache.get(slug);
        return {
          id: raw.id, link_slug: raw.link_slug ?? slug, title: raw.title ?? link?.title ?? slug,
          start: raw.start, end: raw.end,
          duration_minutes: raw.duration_minutes ?? Math.round((new Date(raw.end).getTime() - new Date(raw.start).getTime()) / 60_000),
          hosts: raw.hosts ?? link?.hosts ?? [], booker_name: raw.booker_name, booker_email: raw.booker_email, notes: raw.notes,
        };
      }),
};
