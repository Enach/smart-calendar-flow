/**
 * Scheduling links + public booking API (T-28).
 *
 * Wraps the backend endpoints from T-27. When the backend is unreachable
 * (the typical case in the Lovable preview / demo mode), every call falls
 * back to an in-memory mock that mirrors the real surface so the UI stays
 * fully exercisable.
 */

import { requestApi, withFallback } from "./client";
import type {
  BookingConfirmation,
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
  hosts?: Array<{
    user_id?: string;
    email: string;
    name?: string;
    avatar_url?: string;
    is_owner?: boolean;
    status: string;
  }>;
};

type BackendUser = { id: string; email: string; name?: string };
type BackendPublicLink = {
  slug: string; title: string; durations?: number[]; duration_options?: number[];
  hosts?: Array<{ email: string; name?: string; avatar_url?: string }>;
  min_notice_minutes?: number; usage_type?: LinkUsageType;
  coverage?: { total: number; checked: number };
};
type BackendBooking = {
  id: string; link_slug?: string; title?: string; start: string; end: string;
  duration_minutes?: number; hosts?: Array<{ email: string; name?: string; avatar_url?: string }>;
  booker_name: string; booker_email: string; notes?: string;
};
type BackendHostInvite = { link_id: string; link_title: string; owner_name: string; owner_email: string; invited_at: string };

const WEEKDAY_BY_NUMBER: Record<number, Weekday> = { 0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };
const WEEKDAY_TO_NUMBER: Record<Weekday, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };

function ownerHost(user: BackendUser): SchedulingHost {
  return { user_id: user.id, email: user.email, name: user.name, is_owner: true, status: "accepted" };
}

function normalizeSchedulingLink(raw: BackendSchedulingLink, user?: BackendUser): SchedulingLink {
  const ownerID = raw.owner_id ?? raw.owner_user_id ?? "";
  const owner = user && ownerID === user.id ? ownerHost(user) : undefined;
  const hosts: SchedulingHost[] = (raw.hosts ?? []).map((host): SchedulingHost => ({
    user_id: host.user_id,
    email: host.email,
    name: host.name,
    avatar_url: host.avatar_url,
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
  };
}

function backendLinkBody(input: {
  title: string; durations: number[]; days: Weekday[]; window_start: string; window_end: string;
  buffer_before: number; buffer_after: number; min_notice_minutes?: number; usage_type?: LinkUsageType;
  max_uses?: number; active?: boolean;
}) {
  return {
    title: input.title, duration_options: input.durations, days_of_week: input.days.map((day) => WEEKDAY_TO_NUMBER[day]),
    window_start_time: input.window_start, window_end_time: input.window_end,
    buffer_before: input.buffer_before, buffer_after: input.buffer_after,
    min_notice_minutes: input.min_notice_minutes ?? 0,
    usage_type: input.usage_type ?? "reusable",
    max_uses: input.max_uses,
    ...(input.active === undefined ? {} : { active: input.active }),
  };
}


const publicLinkCache = new Map<string, PublicLinkInfo>();

// ---------- Mock state ----------

const KNOWN_DIRECTORY: Record<string, { name: string; avatar_url?: string }> = {
  "alice@co.com": { name: "Alice Martin" },
  "bob@co.com": { name: "Bob Chen" },
  "carol@co.com": { name: "Carol Diaz" },
  "david@co.com": { name: "David Okonkwo" },
  "emma@co.com": { name: "Emma Laurent" },
  "felix@co.com": { name: "Felix Weber" },
  "sarah@co.com": { name: "Sarah Liu" },
  "nicolas@co.com": { name: "Nicolas Rey" },
};

const ME_USER = { id: "me", email: "alex@demo.paceday.com", name: "Alex Demo" };

function makeOwnerHost(): SchedulingHost {
  return {
    user_id: ME_USER.id,
    email: ME_USER.email,
    name: ME_USER.name,
    is_owner: true,
    status: "accepted",
  };
}

function buildHostFromEmail(email: string, status: SchedulingHost["status"] = "pending"): SchedulingHost {
  const known = KNOWN_DIRECTORY[email.toLowerCase()];
  return {
    user_id: known ? `u_${email}` : undefined,
    email,
    name: known?.name,
    avatar_url: known?.avatar_url,
    is_owner: false,
    status,
  };
}

const ALL_DAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri"];

interface MockState {
  links: SchedulingLink[];
  invites: CoHostInvite[];
  bookings: BookingConfirmation[];
  takenSlots: Set<string>; // key: `${slug}|${startIso}`
  nextId: number;
}

const mockState: MockState = {
  links: [],
  invites: [],
  bookings: [],
  takenSlots: new Set(),
  nextId: 1,
};

function seedMockLinks() {
  if (mockState.links.length) return;

  // Owned solo link.
  mockState.links.push({
    id: "lnk_1",
    owner_id: ME_USER.id,
    title: "Intro chat",
    slug: "intro-chat",
    durations: [15, 30],
    days: ALL_DAYS,
    window_start: "09:00",
    window_end: "18:00",
    buffer_before: 5,
    buffer_after: 5,
    min_notice_minutes: 60,
    usage_type: "reusable",
    uses_count: 0,
    active: true,
    hosts: [makeOwnerHost()],
    created_at: new Date(Date.now() - 7 * 86400_000).toISOString(),
    is_owner: true,
  });

  // Owned collective link with one accepted + one pending co-host.
  mockState.links.push({
    id: "lnk_2",
    owner_id: ME_USER.id,
    title: "Product deep-dive",
    slug: "product-deepdive",
    durations: [30, 60],
    days: ["mon", "tue", "wed", "thu"],
    window_start: "10:00",
    window_end: "17:00",
    buffer_before: 10,
    buffer_after: 5,
    min_notice_minutes: 240,
    usage_type: "recurring",
    max_uses: 5,
    uses_count: 1,
    active: true,
    hosts: [
      makeOwnerHost(),
      buildHostFromEmail("sarah@co.com", "accepted"),
      buildHostFromEmail("nicolas@co.com", "pending"),
    ],
    created_at: new Date(Date.now() - 2 * 86400_000).toISOString(),
    is_owner: true,
  });

  // Shared-with-me link (someone else owns it; I'm an accepted co-host).
  mockState.links.push({
    id: "lnk_3",
    owner_id: "u_owner",
    title: "Design review",
    slug: "design-review",
    durations: [45],
    days: ["tue", "wed", "thu"],
    window_start: "13:00",
    window_end: "17:00",
    buffer_before: 0,
    buffer_after: 10,
    min_notice_minutes: 1440,
    usage_type: "single_use",
    uses_count: 0,
    active: true,
    hosts: [
      { ...buildHostFromEmail("emma@co.com", "accepted"), is_owner: true },
      { ...makeOwnerHost(), is_owner: false, status: "accepted" },
    ],
    created_at: new Date(Date.now() - 14 * 86400_000).toISOString(),
    is_owner: false,
    my_status: "accepted",
  });

  // Pending invite from another user.
  mockState.invites.push({
    link_id: "lnk_invite_1",
    link_title: "Quarterly planning",
    owner_name: "Felix Weber",
    owner_email: "felix@co.com",
    invited_at: new Date(Date.now() - 3600_000).toISOString(),
  });
}
seedMockLinks();

const WEEKDAY_INDEX: Record<Weekday, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0,
};

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function dateOnly(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseHM(hm: string): [number, number] {
  const [h, m] = hm.split(":").map((x) => parseInt(x, 10));
  return [h || 0, m || 0];
}

function findLinkBySlug(slug: string): SchedulingLink | undefined {
  return mockState.links.find((l) => l.slug === slug);
}

function publicLinkBySlug(slug: string): SchedulingLink | undefined {
  // A demo "public" link people might land on without auth.
  const found = findLinkBySlug(slug);
  if (found) return found;
  if (slug === "intro-chat" || slug === "product-deepdive" || slug === "design-review") return findLinkBySlug(slug);
  return undefined;
}

/** Generate plausible slots for a given date based on link configuration. */
function generateSlotsForDate(link: SchedulingLink, dateStr: string, durationMin: number): BookingSlot[] {
  const target = new Date(`${dateStr}T00:00:00`);
  const dow = target.getDay();
  const allowed = link.days.some((d) => WEEKDAY_INDEX[d] === dow);
  if (!allowed) return [];

  const [sh, sm] = parseHM(link.window_start);
  const [eh, em] = parseHM(link.window_end);
  const dayStart = new Date(target);
  dayStart.setHours(sh, sm, 0, 0);
  const dayEnd = new Date(target);
  dayEnd.setHours(eh, em, 0, 0);

  const step = 30; // 30-min increments
  const out: BookingSlot[] = [];
  let cursor = new Date(dayStart);

  // Earliest bookable instant given the link's minimum-notice setting.
  const minNoticeMs = Math.max(0, link.min_notice_minutes ?? 0) * 60_000;
  const earliest = new Date(Date.now() + minNoticeMs);

  while (cursor.getTime() + durationMin * 60_000 <= dayEnd.getTime()) {
    const startIso = cursor.toISOString();
    const endIso = new Date(cursor.getTime() + durationMin * 60_000).toISOString();
    const taken = mockState.takenSlots.has(`${link.slug}|${startIso}`);
    const tooSoon = cursor.getTime() < earliest.getTime();

    // Simulate "all hosts must be free": chop a few slots out for collective links
    let collectiveBlocked = false;
    if (link.hosts.length > 1) {
      const hour = cursor.getHours();
      // Pretend lunch + early afternoon are usually crowded for everyone
      if (hour === 12 || hour === 14) collectiveBlocked = true;
    }

    if (!taken && !collectiveBlocked && !tooSoon) {
      out.push({ start: startIso, end: endIso });
    }
    cursor = new Date(cursor.getTime() + step * 60_000);
  }
  return out;
}

/** True when the link has used up its allowed bookings. */
function isLinkExhausted(link: SchedulingLink): boolean {
  if (link.usage_type === "single_use") return link.uses_count >= 1;
  if (link.usage_type === "recurring" && link.max_uses) return link.uses_count >= link.max_uses;
  return false;
}

/** Query keys shared by every scheduling-link consumer. */
export const schedulingLinkKeys = {
  links: ["scheduling-links"] as const,
  invites: ["scheduling-link-invites"] as const,
  bookings: (linkId: string) => ["scheduling-link-bookings", linkId] as const,
};


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
    withFallback<{ owned: SchedulingLink[]; shared: SchedulingLink[] }>(
      async () => {
        const [raw, user] = await Promise.all([
          requestApi<{ owned?: BackendSchedulingLink[]; shared?: BackendSchedulingLink[] }>("GET", "/scheduling-links/"),
          requestApi<BackendUser>("GET", "/auth/me").catch(() => undefined),
        ]);
        const links = [...(raw.owned ?? []), ...(raw.shared ?? [])].map((link) => normalizeSchedulingLink(link, user));
        return { owned: links.filter((link) => link.is_owner), shared: links.filter((link) => !link.is_owner) };
      },
      () => ({
        owned: mockState.links.filter((l) => l.is_owner).map((l) => ({ ...l, hosts: [...l.hosts] })),
        shared: mockState.links.filter((l) => !l.is_owner).map((l) => ({ ...l, hosts: [...l.hosts] })),
      }),
    ),

  listInvites: () =>
    withFallback<CoHostInvite[]>(
      async () => {
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
      },
      () => [...mockState.invites],
    ),

  acceptInvite: (linkId: string) =>
    withFallback<void>(
      () => requestApi("POST", `/scheduling-links/host-invites/${linkId}/accept`),
      () => {
        mockState.invites = mockState.invites.filter((i) => i.link_id !== linkId);
      },
    ),

  declineInvite: (linkId: string) =>
    withFallback<void>(
      () => requestApi("POST", `/scheduling-links/host-invites/${linkId}/decline`),
      () => {
        mockState.invites = mockState.invites.filter((i) => i.link_id !== linkId);
      },
    ),

  createLink: (input: {
    title: string; slug: string; durations: number[]; days: Weekday[]; window_start: string; window_end: string;
    buffer_before: number; buffer_after: number; min_notice_minutes: number; usage_type: LinkUsageType;
    max_uses?: number; co_host_emails: string[];
  }) =>
    withFallback<SchedulingLink>(
      async () => {
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
        link.hosts.push(...input.co_host_emails.filter((email) => !existing.has(email.toLowerCase())).map((email) => buildHostFromEmail(email)));
        return link;
      },
      () => {
        const link: SchedulingLink = {
          id: `lnk_${++mockState.nextId}`, owner_id: ME_USER.id, title: input.title, slug: input.slug,
          durations: input.durations, days: input.days, window_start: input.window_start, window_end: input.window_end,
          buffer_before: input.buffer_before, buffer_after: input.buffer_after, min_notice_minutes: input.min_notice_minutes,
          usage_type: input.usage_type, max_uses: input.usage_type === "recurring" ? input.max_uses : undefined, uses_count: 0,
          active: true, hosts: [makeOwnerHost(), ...input.co_host_emails.map((e) => buildHostFromEmail(e, "pending"))],
          created_at: new Date().toISOString(), is_owner: true,
        };
        mockState.links.unshift(link);
        return { ...link, hosts: [...link.hosts] };
      },
    ),

  updateLink: (id: string, input: Partial<{
    title: string; slug: string; durations: number[]; days: Weekday[]; window_start: string; window_end: string;
    buffer_before: number; buffer_after: number; min_notice_minutes: number; usage_type: LinkUsageType;
    max_uses: number | undefined; active: boolean; co_host_emails: string[];
  }>) =>
    withFallback<SchedulingLink>(
      async () => {
        const current = await requestApi<BackendSchedulingLink>("GET", `/scheduling-links/${id}`);
        const body = backendLinkBody({
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
          active: input.active,
        });
        await requestApi<BackendSchedulingLink>("PATCH", `/scheduling-links/${id}`, body);
        if (input.co_host_emails) {
          await Promise.allSettled(input.co_host_emails.map((email) =>
            requestApi("POST", `/scheduling-links/${id}/hosts`, { email }),
          ));
        }
        const [user, detail] = await Promise.all([
          requestApi<BackendUser>("GET", "/auth/me").catch(() => undefined),
          requestApi<BackendSchedulingLink>("GET", `/scheduling-links/${id}`),
        ]);
        const link = normalizeSchedulingLink(detail, user);
        for (const email of input.co_host_emails ?? []) {
          if (!link.hosts.some((host) => host.email.toLowerCase() === email.toLowerCase())) link.hosts.push(buildHostFromEmail(email));
        }
        return link;
      },
      () => {
        const idx = mockState.links.findIndex((l) => l.id === id);
        if (idx < 0) throw new Error("not found");
        const current = mockState.links[idx];
        const updated: SchedulingLink = { ...current, ...input } as SchedulingLink;
        if (input.usage_type && input.usage_type !== "recurring") updated.max_uses = undefined;
        if (input.co_host_emails) {
          const owner = current.hosts.find((h) => h.is_owner) ?? makeOwnerHost();
          const byEmail = new Map(current.hosts.filter((h) => !h.is_owner).map((h) => [h.email.toLowerCase(), h]));
          updated.hosts = [owner, ...input.co_host_emails.map((e) => byEmail.get(e.toLowerCase()) ?? buildHostFromEmail(e, "pending"))];
        }
        mockState.links[idx] = updated;
        return { ...updated, hosts: [...updated.hosts] };
      },
    ),

  deleteLink: (id: string) =>
    withFallback<void>(
      () => requestApi("DELETE", `/scheduling-links/${id}`),
      () => {
        mockState.links = mockState.links.filter((l) => l.id !== id);
      },
    ),

  leaveLink: (id: string) =>
    withFallback<void>(
      () => requestApi("POST", `/scheduling-links/${id}/leave`),
      () => {
        mockState.links = mockState.links.filter((l) => l.id !== id);
      },
    ),

  // ----- public: booking flow -----

  getPublicLink: (slug: string) =>
    withFallback<PublicLinkInfo>(
      async () => {
        const raw = await requestApi<BackendPublicLink>("GET", `/book/${slug}`);
        const info: PublicLinkInfo = {
          slug: raw.slug, title: raw.title,
          durations: (raw.durations ?? raw.duration_options ?? [30]).slice(),
          hosts: raw.hosts ?? [],
          min_notice_minutes: raw.min_notice_minutes,
          usage_type: raw.usage_type,
          coverage: raw.coverage,
        };
        publicLinkCache.set(slug, info);
        return info;
      },
      () => {
        const link = publicLinkBySlug(slug);
        if (!link) throw new Error("not_found");
        if (!link.active || isLinkExhausted(link)) {
          const err = new Error("gone") as Error & { status: number };
          err.status = 410;
          throw err;
        }
        const checked = link.hosts.filter((h) => {
          const d = h.email.toLowerCase().split("@")[1] ?? "";
          return /^(co\.com|paceday\.com|demo\.paceday\.com|acme\.com)$/.test(d) || d.endsWith(".com") && !/^(gmail|yahoo|hotmail|outlook|icloud|proton)/.test(d.split(".")[0]);
        }).length;
        const info: PublicLinkInfo = {
          slug: link.slug, title: link.title, durations: link.durations,
          hosts: link.hosts.map((h) => ({ email: h.email, name: h.name, avatar_url: h.avatar_url })),
          min_notice_minutes: link.min_notice_minutes, usage_type: link.usage_type,
          coverage: { total: link.hosts.length, checked },
        };
        publicLinkCache.set(slug, info);
        return info;
      },
    ),

  getPublicSlots: (slug: string, params: { date?: string; duration?: number }) => {
    // The backend requires a date and returns a bare [] of slots. The UI no
    // longer probes an unsupported summary endpoint; it asks per selected day.
    if (!params.date) return Promise.resolve({ available_dates: [] as string[], slots: [] as BookingSlot[] });
    return withFallback<{ available_dates: string[]; slots?: BookingSlot[] }>(
      async () => {
        const raw = await requestApi<{ slots?: BookingSlot[]; available_dates?: string[] }>("GET", `/book/${slug}/slots`, undefined, {
          date: params.date, duration: params.duration ? String(params.duration) : undefined,
        });
        return { slots: raw.slots ?? [], available_dates: raw.available_dates ?? [] };
      },
      () => {
        const link = publicLinkBySlug(slug);
        if (!link || !link.active || isLinkExhausted(link)) return { available_dates: [], slots: [] };
        return { available_dates: [], slots: generateSlotsForDate(link, params.date!, params.duration ?? link.durations[0] ?? 30) };
      },
    );
  },

  bookSlot: (
    slug: string,
    input: { start: string; duration_minutes: number; name: string; email: string; notes?: string },
  ) =>
    withFallback<BookingConfirmation>(
      async () => {
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
      },
      () => {
        const link = publicLinkBySlug(slug);
        if (!link) throw new Error("not_found");
        if (!link.active || isLinkExhausted(link)) {
          const err = new Error("gone") as Error & { status: number };
          err.status = 410;
          throw err;
        }
        // Enforce minimum notice on the booking attempt itself.
        const minNoticeMs = Math.max(0, link.min_notice_minutes ?? 0) * 60_000;
        if (new Date(input.start).getTime() < Date.now() + minNoticeMs) {
          const err = new Error("too_soon") as Error & { status: number };
          err.status = 422;
          throw err;
        }
        const key = `${slug}|${input.start}`;
        if (mockState.takenSlots.has(key)) {
          const err = new Error("conflict") as Error & { status: number };
          err.status = 409;
          throw err;
        }
        mockState.takenSlots.add(key);
        // Bump usage counter and auto-disable if needed.
        link.uses_count += 1;
        if (isLinkExhausted(link)) link.active = false;
        const end = new Date(new Date(input.start).getTime() + input.duration_minutes * 60_000).toISOString();
        const conf: BookingConfirmation = {
          id: `bk_${++mockState.nextId}`,
          link_slug: slug,
          title: link.title,
          start: input.start,
          end,
          duration_minutes: input.duration_minutes,
          hosts: link.hosts.map((h) => ({ email: h.email, name: h.name, avatar_url: h.avatar_url })),
          booker_name: input.name,
          booker_email: input.email,
          notes: input.notes,
        };
        mockState.bookings.push(conf);
        return conf;
      },
    ),
};
