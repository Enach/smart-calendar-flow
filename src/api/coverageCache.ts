/**
 * Free/busy + coverage cache (T-40 follow-up).
 *
 * The raw `api.freebusy` is fine for one-off lookups, but the link drawer,
 * public booking page, NLP suggestions, and event detail panel all hit it
 * repeatedly with overlapping email sets. This module:
 *
 *   1. Memoises responses for ~5 minutes (in-memory + sessionStorage so a
 *      reload doesn't re-spam the backend during onboarding).
 *   2. Exposes a stable "is this attendee actively blocking the slot?"
 *      helper that mimics Google Calendar's RSVP rules — see
 *      `attendeeCountsAsBusy` below.
 */

import { api } from "@/api/client";
import type {
  Attendee,
  CoverageStatus,
  CoverageProvider,
  FreeBusyResponse,
  ParticipantCoverage,
  RsvpStatus,
} from "@/api/types";

const TTL_MS = 5 * 60 * 1000;
const STORAGE_KEY = "paceday:freebusy-cache:v1";

interface CacheEntry {
  expires_at: number;
  response: FreeBusyResponse;
}

type CacheMap = Record<string, CacheEntry>;

let memCache: CacheMap | null = null;

function loadCache(): CacheMap {
  if (memCache) return memCache;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    memCache = raw ? (JSON.parse(raw) as CacheMap) : {};
  } catch {
    memCache = {};
  }
  // Drop expired
  const now = Date.now();
  for (const k of Object.keys(memCache!)) {
    if (memCache![k].expires_at < now) delete memCache![k];
  }
  return memCache!;
}

function saveCache() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memCache ?? {}));
  } catch {
    /* ignore */
  }
}

function cacheKey(emails: string[], start: string, end: string): string {
  const norm = emails.map((e) => e.trim().toLowerCase()).filter(Boolean).sort();
  // Bucket window to the nearest hour so successive lookups within the
  // same UI session reuse the same key.
  const hour = (iso: string) => iso.slice(0, 13);
  return `${hour(start)}|${hour(end)}|${norm.join(",")}`;
}

/**
 * Cached wrapper around `api.freebusy`. Same shape as the raw call.
 */
export async function getFreebusy(input: {
  emails: string[];
  start_time: string;
  end_time: string;
}): Promise<FreeBusyResponse> {
  const cache = loadCache();
  const key = cacheKey(input.emails, input.start_time, input.end_time);
  const hit = cache[key];
  if (hit && hit.expires_at > Date.now()) {
    return hit.response;
  }
  const response = await api.freebusy(input);
  cache[key] = { expires_at: Date.now() + TTL_MS, response };
  saveCache();
  return response;
}

/** Manually clear the cache — used when a user disconnects a calendar etc. */
export function clearFreebusyCache() {
  memCache = {};
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Convenience helper for components that just want the per-email coverage
 * status (drawer chips, member badges, etc).
 */
export async function getCoverageMap(
  emails: string[],
): Promise<Map<string, { status: CoverageStatus; provider?: CoverageProvider }>> {
  const map = new Map<string, { status: CoverageStatus; provider?: CoverageProvider }>();
  if (emails.length === 0) return map;
  const now = new Date();
  const in14d = new Date(now.getTime() + 14 * 86400000);
  const res = await getFreebusy({
    emails,
    start_time: now.toISOString(),
    end_time: in14d.toISOString(),
  });
  for (const p of res.participants) {
    map.set(p.email.toLowerCase(), { status: p.status, provider: p.provider });
  }
  return map;
}

// ---------- RSVP / "Google-style" busy logic ----------

/**
 * Decide whether this attendee should make a candidate slot count as busy.
 *
 * Mirrors Google Calendar's behavior:
 *   - "declined" attendees → treated as free (their decline removes the
 *     conflict). A meeting where everyone else declined still appears on
 *     the current user's calendar — but for *new* slot generation, we
 *     should not refuse a slot just because a declined attendee was on
 *     a clashing event.
 *   - "tentative" → still counts as busy (they might show up).
 *   - "pending" / "accepted" / undefined → counts as busy.
 *   - Coverage status "unknown" → can't be evaluated, treated as free
 *     (caller already surfaces "Availability unknown" in the UI).
 */
export function attendeeCountsAsBusy(
  attendee: Pick<Attendee, "rsvp"> & { coverage?: { status?: CoverageStatus } },
): boolean {
  if (attendee.rsvp === "declined") return false;
  if (attendee.coverage?.status === "unknown") return false;
  return true;
}

/** Same idea, but for a bare RSVP value. */
export function rsvpCountsAsBusy(rsvp?: RsvpStatus): boolean {
  return rsvp !== "declined";
}

/**
 * Filter a participant set to those whose calendar should actually exclude
 * candidate slots — strips declined invitees and unknown-coverage emails.
 */
export function activeParticipants(
  participants: ParticipantCoverage[],
  rsvps?: Map<string, RsvpStatus>,
): ParticipantCoverage[] {
  return participants.filter((p) => {
    if (p.status === "unknown") return false;
    const r = rsvps?.get(p.email.toLowerCase());
    if (r === "declined") return false;
    return true;
  });
}
