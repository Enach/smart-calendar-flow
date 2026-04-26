/**
 * Scheduling links + public booking API (T-28).
 *
 * Wraps the backend endpoints from T-27. When the backend is unreachable
 * (the typical case in the Lovable preview / demo mode), every call falls
 * back to an in-memory mock that mirrors the real surface so the UI stays
 * fully exercisable.
 */

import { isUsingMocks, setMockMode } from "./client";
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

const API_BASE = "/api";
const NETWORK_TIMEOUT_MS = 4000;

async function realFetch<T>(
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string | undefined>,
): Promise<T> {
  const url = new URL(API_BASE + path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== "") url.searchParams.set(k, v);
    }
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), NETWORK_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      method,
      signal: ctrl.signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
    if (res.status === 409) {
      const err = new Error("conflict") as Error & { status: number };
      err.status = 409;
      throw err;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (res.status === 204) return undefined as T;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) throw new Error("Non-JSON response");
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

async function withFallback<T>(real: () => Promise<T>, mock: () => T | Promise<T>): Promise<T> {
  if (isUsingMocks()) return mock();
  try {
    const v = await real();
    return v;
  } catch (e) {
    // Surface 409 (race condition) as a real error — never mask with mock.
    if ((e as { status?: number })?.status === 409) throw e;
    setMockMode(true);
    return mock();
  }
}

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

// ---------- Public API ----------

export const schedulingLinksApi = {
  // ----- authenticated: links management -----

  listLinks: () =>
    withFallback<{ owned: SchedulingLink[]; shared: SchedulingLink[] }>(
      () => realFetch("GET", "/scheduling-links"),
      () => ({
        owned: mockState.links.filter((l) => l.is_owner).map((l) => ({ ...l, hosts: [...l.hosts] })),
        shared: mockState.links.filter((l) => !l.is_owner).map((l) => ({ ...l, hosts: [...l.hosts] })),
      }),
    ),

  listInvites: () =>
    withFallback<CoHostInvite[]>(
      () => realFetch("GET", "/scheduling-links/invites"),
      () => [...mockState.invites],
    ),

  acceptInvite: (linkId: string) =>
    withFallback<void>(
      () => realFetch("POST", `/scheduling-links/${linkId}/accept`),
      () => {
        mockState.invites = mockState.invites.filter((i) => i.link_id !== linkId);
      },
    ),

  declineInvite: (linkId: string) =>
    withFallback<void>(
      () => realFetch("POST", `/scheduling-links/${linkId}/decline`),
      () => {
        mockState.invites = mockState.invites.filter((i) => i.link_id !== linkId);
      },
    ),

  createLink: (input: {
    title: string;
    slug: string;
    durations: number[];
    days: Weekday[];
    window_start: string;
    window_end: string;
    buffer_before: number;
    buffer_after: number;
    co_host_emails: string[];
  }) =>
    withFallback<SchedulingLink>(
      () => realFetch("POST", "/scheduling-links", input),
      () => {
        const link: SchedulingLink = {
          id: `lnk_${++mockState.nextId}`,
          owner_id: ME_USER.id,
          title: input.title,
          slug: input.slug,
          durations: input.durations,
          days: input.days,
          window_start: input.window_start,
          window_end: input.window_end,
          buffer_before: input.buffer_before,
          buffer_after: input.buffer_after,
          active: true,
          hosts: [
            makeOwnerHost(),
            ...input.co_host_emails.map((e) => buildHostFromEmail(e, "pending")),
          ],
          created_at: new Date().toISOString(),
          is_owner: true,
        };
        mockState.links.unshift(link);
        return { ...link, hosts: [...link.hosts] };
      },
    ),

  updateLink: (
    id: string,
    input: Partial<{
      title: string;
      slug: string;
      durations: number[];
      days: Weekday[];
      window_start: string;
      window_end: string;
      buffer_before: number;
      buffer_after: number;
      active: boolean;
      co_host_emails: string[];
    }>,
  ) =>
    withFallback<SchedulingLink>(
      () => realFetch("PATCH", `/scheduling-links/${id}`, input),
      () => {
        const idx = mockState.links.findIndex((l) => l.id === id);
        if (idx < 0) throw new Error("not found");
        const current = mockState.links[idx];
        const updated: SchedulingLink = { ...current, ...input } as SchedulingLink;
        if (input.co_host_emails) {
          // Preserve already-known hosts (keep statuses) and add new pending ones.
          const owner = current.hosts.find((h) => h.is_owner) ?? makeOwnerHost();
          const byEmail = new Map(current.hosts.filter((h) => !h.is_owner).map((h) => [h.email.toLowerCase(), h]));
          const nextHosts: SchedulingHost[] = [owner];
          for (const e of input.co_host_emails) {
            const existing = byEmail.get(e.toLowerCase());
            nextHosts.push(existing ?? buildHostFromEmail(e, "pending"));
          }
          updated.hosts = nextHosts;
        }
        mockState.links[idx] = updated;
        return { ...updated, hosts: [...updated.hosts] };
      },
    ),

  deleteLink: (id: string) =>
    withFallback<void>(
      () => realFetch("DELETE", `/scheduling-links/${id}`),
      () => {
        mockState.links = mockState.links.filter((l) => l.id !== id);
      },
    ),

  leaveLink: (id: string) =>
    withFallback<void>(
      () => realFetch("POST", `/scheduling-links/${id}/leave`),
      () => {
        mockState.links = mockState.links.filter((l) => l.id !== id);
      },
    ),

  // ----- public: booking flow -----

  getPublicLink: (slug: string) =>
    withFallback<PublicLinkInfo>(
      () => realFetch("GET", `/book/${slug}`),
      () => {
        const link = publicLinkBySlug(slug);
        if (!link) throw new Error("not_found");
        return {
          slug: link.slug,
          title: link.title,
          durations: link.durations,
          hosts: link.hosts.map((h) => ({ email: h.email, name: h.name, avatar_url: h.avatar_url })),
        };
      },
    ),

  getPublicSlots: (slug: string, params: { date?: string; duration?: number }) =>
    withFallback<{ available_dates?: string[]; slots?: BookingSlot[] }>(
      () =>
        realFetch("GET", `/book/${slug}/slots`, undefined, {
          date: params.date,
          duration: params.duration ? String(params.duration) : undefined,
        }),
      () => {
        const link = publicLinkBySlug(slug);
        if (!link) return { available_dates: [], slots: [] };

        if (params.date) {
          const duration = params.duration ?? link.durations[0] ?? 30;
          return { slots: generateSlotsForDate(link, params.date, duration) };
        }

        // Summary call: which days in the next 60 days have any availability?
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const days: string[] = [];
        const probeDuration = link.durations[0] ?? 30;
        for (let i = 0; i < 60; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() + i);
          const ds = dateOnly(d);
          const slots = generateSlotsForDate(link, ds, probeDuration);
          if (slots.length > 0) days.push(ds);
        }
        return { available_dates: days };
      },
    ),

  bookSlot: (
    slug: string,
    input: { start: string; duration_minutes: number; name: string; email: string; notes?: string },
  ) =>
    withFallback<BookingConfirmation>(
      () => realFetch("POST", `/book/${slug}`, input),
      () => {
        const link = publicLinkBySlug(slug);
        if (!link) throw new Error("not_found");
        const key = `${slug}|${input.start}`;
        if (mockState.takenSlots.has(key)) {
          const err = new Error("conflict") as Error & { status: number };
          err.status = 409;
          throw err;
        }
        mockState.takenSlots.add(key);
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
