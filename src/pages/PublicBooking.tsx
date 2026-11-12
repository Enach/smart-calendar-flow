import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, Globe, Loader2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HostAvatars } from "@/components/links/HostAvatars";
import { CoveragePill } from "@/components/CoveragePill";
import { apiErrorMessage, classifyApiFailure, isApiHttpError } from "@/api/client";
import { ApiErrorNotice } from "@/components/ApiErrorNotice";
import { StillWorking } from "@/components/StillWorking";
import { TimeZoneSwitcher } from "@/components/booking/TimeZoneSwitcher";
import { downloadIcs } from "@/components/booking/ics";
import { schedulingLinksApi, type PublicSlotsAnswer } from "@/api/schedulingLinks";
import type { BookingConfirmation, BookingSlot, PublicLinkInfo } from "@/api/types";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { formatTimeInZone } from "@/lib/timeFormat";
import {
  browserTimeZone,
  dateKeyInZone,
  formatDateKeyLong,
  formatDateLongInZone,
  hostDisplayZone,
  keyToLocalDate,
  localDateToKey,
  monthGrid,
  monthOfKey,
  zoneLabel,
  zoneNoonInstant,
  zoneOffsetLabel,
} from "@/lib/timeZone";

// NEW-booking-rate-limit: the server answers 429 when one client books or
// looks up times too often. The booker sees a plain wait-and-retry message, not
// the server's string. The exact wait (Retry-After) is not readable
// cross-origin and is not needed here.
const BOOKING_RATE_LIMITED_MESSAGE =
  "You've made too many attempts in a short time. Please wait a few minutes, then try again — your details are kept.";
const SLOTS_RATE_LIMITED_MESSAGE =
  "Too many requests for available times. Please wait a minute, then retry.";

/** PAC-88 (contract section 2.4): the server's 400 for a zone its tz database lacks. */
const DISPLAY_ZONE_REFUSED = "invalid display_time_zone, use an IANA time zone name";
/** PAC-88 (spec 3.8): the link's zone changed and re-reading it did not settle it. */
const ZONE_CHANGED_MESSAGE = "The host's time zone just changed. Try again to see the times.";

function httpStatus(e: unknown): number | undefined {
  return isApiHttpError(e) ? e.status : (e as { status?: number } | null)?.status;
}

function isDisplayZoneRefusal(e: unknown): boolean {
  return isApiHttpError(e) && e.status === 400 && (e.data as { error?: string } | undefined)?.error === DISPLAY_ZONE_REFUSED;
}

/**
 * PAC-88 (contract sections 3.2 and 5): an answer is rendered only when it is
 * in the zone the page asked for and was computed in the link zone the page
 * holds. "legacy": the server did not echo `display_time_zone` (a server
 * without PAC-88): link-zone mode for the rest of the visit. "stale-zone": the
 * host changed zone since link info was read: re-read it (AC-26).
 */
type AnswerCheck = "ok" | "legacy" | "stale-zone";
function checkAnswer(
  answer: PublicSlotsAnswer | undefined,
  sentZone: string,
  linkZone: string | undefined,
  legacy: boolean,
): AnswerCheck | undefined {
  if (!answer) return undefined;
  if (legacy) return "ok";
  if (answer.display_time_zone !== sentZone) return "legacy";
  if (linkZone !== undefined && answer.time_zone !== linkZone) return "stale-zone";
  return "ok";
}

function hostsLabel(hosts: PublicLinkInfo["hosts"]): string {
  if (hosts.length === 0) return "";
  const names = hosts.map((h) => h.name?.split(" ")[0] || h.email.split("@")[0]);
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names[0]} + ${names.length - 1} others`;
}

export default function PublicBooking() {
  const { slug = "" } = useParams<{ slug: string }>();
  const browserZone = useMemo(browserTimeZone, []);

  const linkQuery = useQuery({
    queryKey: ["public-link", slug],
    queryFn: () => schedulingLinksApi.getPublicLink(slug),
    retry: false,
  });

  const link = linkQuery.data;
  const isCollective = (link?.hosts.length ?? 0) > 1;
  const [duration, setDuration] = useState<number | null>(null);
  /** The selected day: a calendar date (YYYY-MM-DD) in the displayed zone. */
  const [selectedDay, setSelectedDay] = useState<string | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  /**
   * PAC-83 §3.5: a booking whose outcome Paceday could not confirm (lost
   * answer, any 5xx) or that the server refused for slowness (budget 503).
   * Shown with the booking wording; never re-sent by code.
   */
  const [submitFailure, setSubmitFailure] = useState<unknown>(null);
  /**
   * The time of a booking whose outcome is unknown. The booker is sent back
   * to the refreshed list and must pick a time again: nothing re-sends the
   * booking in one click (spec §3.5).
   */
  const [unconfirmedSlot, setUnconfirmedSlot] = useState<BookingSlot | null>(null);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  // ----- PAC-88: the displayed zone. Page state only, never stored (owner OQ-2). -----
  /** The host's zone the page opens in: the link's zone, UTC when none or unformattable. */
  const hostZone = hostDisplayZone(link?.time_zone);
  /** The visitor's choice; null = follow the host's zone. */
  const [chosenZone, setChosenZone] = useState<string | null>(null);
  /** The zone shown before the last switch, to return to after a 400 (contract 3.2). */
  const [previousZone, setPreviousZone] = useState<string | null>(null);
  /** Link-zone mode against a server without PAC-88 (contract section 5). */
  const [legacy, setLegacy] = useState(false);
  const displayZone = legacy || !chosenZone ? hostZone : chosenZone;
  const [unsupportedZone, setUnsupportedZone] = useState<string | null>(null);
  /** The polite live region's text: set only by a change the visitor caused. */
  const [announcement, setAnnouncement] = useState("");
  /** After a switch, the selected day is re-checked against the new overview. */
  const [dayCheckPending, setDayCheckPending] = useState(false);
  /** The zone the confirmed booking was made in (AC-21, AC-30). */
  const [bookedZone, setBookedZone] = useState<string | null>(null);
  const [month, setMonth] = useState<Date | undefined>(undefined);

  const todayKey = dateKeyInZone(Date.now(), displayZone);
  const shownMonth = month ?? monthOfKey(todayKey);
  const grid = monthGrid(shownMonth);

  // Default duration once link loads.
  useEffect(() => {
    if (link && duration == null) {
      setDuration(link.durations[0] ?? 30);
    }
  }, [link, duration]);

  // The day overview of the visible grid (at most 42 days, contract 3.2). The
  // zone, the grid, the duration and the link zone are in the key, and no
  // answer is kept as a placeholder, so another zone's days are never shown.
  const overviewQuery = useQuery({
    queryKey: ["public-slots-overview", slug, duration, displayZone, link?.time_zone, legacy, grid.from, grid.to],
    queryFn: () =>
      schedulingLinksApi.getPublicSlots(slug, {
        from: grid.from,
        to: grid.to,
        duration: duration!,
        displayTimeZone: displayZone,
      }),
    enabled: !!link && !!duration,
    retry: false,
  });

  // The selected day's times: one answer per displayed day (AC-16).
  const daySlotsQuery = useQuery({
    queryKey: ["public-slots", slug, selectedDay, duration, displayZone, link?.time_zone, legacy],
    queryFn: () =>
      schedulingLinksApi.getPublicSlots(slug, { date: selectedDay!, duration: duration!, displayTimeZone: displayZone }),
    enabled: !!link && !!selectedDay && !!duration,
    retry: false,
  });

  const overviewCheck = checkAnswer(overviewQuery.data, displayZone, link?.time_zone, legacy);
  const dayCheck = checkAnswer(daySlotsQuery.data, displayZone, link?.time_zone, legacy);

  const availableDates = useMemo(
    () => new Set(overviewCheck === "ok" ? overviewQuery.data?.available_dates ?? [] : []),
    [overviewCheck, overviewQuery.data],
  );
  const slots = useMemo(() => (dayCheck === "ok" ? daySlotsQuery.data?.slots ?? [] : []), [dayCheck, daySlotsQuery.data]);
  const isSelectable = (key: string) => key >= todayKey && availableDates.has(key);

  // Newer web, older server: link-zone mode for the rest of the visit.
  useEffect(() => {
    if (!legacy && (overviewCheck === "legacy" || dayCheck === "legacy")) {
      setLegacy(true);
      setChosenZone(null);
      setPreviousZone(null);
    }
  }, [legacy, overviewCheck, dayCheck]);

  // The host changed zone (AC-26): re-read link info once per mismatch; the
  // new zone is in the query keys, so the listing is asked again in it.
  const staleZone =
    overviewCheck === "stale-zone"
      ? overviewQuery.data?.time_zone
      : dayCheck === "stale-zone"
        ? daySlotsQuery.data?.time_zone
        : undefined;
  const rereadFor = useRef<string | null>(null);
  const staleKey = staleZone === undefined ? null : `${staleZone}|${link?.time_zone}`;
  const refetchLink = linkQuery.refetch;
  useEffect(() => {
    if (staleKey === null || rereadFor.current === staleKey) return;
    rereadFor.current = staleKey;
    void refetchLink();
  }, [staleKey, refetchLink]);
  const zoneStuck = staleKey !== null && rereadFor.current === staleKey && !linkQuery.isFetching;

  // A zone the server's tz database lacks: back to the zone shown before,
  // never times in the refused zone (contract 3.2).
  const zoneRefused =
    displayZone !== hostZone &&
    ((overviewQuery.isError && isDisplayZoneRefusal(overviewQuery.error)) ||
      (daySlotsQuery.isError && isDisplayZoneRefusal(daySlotsQuery.error)));
  useEffect(() => {
    if (!zoneRefused) return;
    const back = previousZone && previousZone !== displayZone ? previousZone : hostZone;
    setUnsupportedZone(displayZone);
    setChosenZone(back === hostZone ? null : back);
    setPreviousZone(null);
    if (selectedSlot) setSelectedDay(dateKeyInZone(selectedSlot.start, back));
    setAnnouncement(`Times can't be shown in ${displayZone}. Choose another time zone.`);
  }, [zoneRefused, previousZone, displayZone, hostZone, selectedSlot]);

  // After a switch, a selected day with no time in the new zone is dropped
  // and the visitor is told to pick a date (AC-14, spec 3.9). The visible
  // grid's overview decides only for a day inside that grid; a selected day
  // the visitor has paged away from is decided by its own answer in the new
  // zone (review of #144: the overview of another month knows nothing of it).
  const selectedInGrid = !!selectedDay && selectedDay >= grid.from && selectedDay <= grid.to;
  useEffect(() => {
    if (!dayCheckPending || !selectedDay) return;
    let hasTimes: boolean;
    if (selectedInGrid) {
      if (overviewCheck !== "ok" || overviewQuery.isFetching) return;
      hasTimes = availableDates.has(selectedDay);
    } else {
      if (dayCheck !== "ok" || daySlotsQuery.isFetching) return;
      hasTimes = slots.length > 0;
    }
    setDayCheckPending(false);
    if (!(selectedDay >= todayKey && hasTimes)) {
      const dropped = selectedDay;
      setSelectedDay(undefined);
      setAnnouncement((a) => `${a} ${formatDateKeyLong(dropped)} has no times in ${displayZone}. Pick a date.`.trim());
    }
  }, [
    dayCheckPending,
    selectedDay,
    selectedInGrid,
    overviewCheck,
    overviewQuery.isFetching,
    availableDates,
    dayCheck,
    daySlotsQuery.isFetching,
    slots,
    todayKey,
    displayZone,
  ]);

  const overviewFailed =
    overviewQuery.isError && classifyApiFailure(overviewQuery.error) !== "cancelled" && !zoneRefused;
  // PAC-83 AC-11: a failed listing is an error with a retry — never an empty
  // list and never "no time available" (and never the previous day's times).
  const slotsFailed = daySlotsQuery.isError && classifyApiFailure(daySlotsQuery.error) !== "cancelled" && !zoneRefused;

  function resetChoice() {
    setSelectedSlot(null);
    setSubmitError(null);
    setSubmitFailure(null);
    setUnconfirmedSlot(null);
  }

  function pickDay(date: Date | undefined) {
    setSelectedDay(date ? localDateToKey(date) : undefined);
    setDayCheckPending(false);
    resetChoice();
  }

  function pickDuration(d: number) {
    if (d === duration) return;
    setDuration(d);
    resetChoice();
  }

  function switchZone(zone: string) {
    if (legacy || zone === displayZone) return;
    setPreviousZone(displayZone);
    setChosenZone(zone === hostZone ? null : zone);
    setUnsupportedZone(null);
    if (selectedSlot) {
      // The chosen time stays chosen and is shown again in the new zone (AC-15).
      setSelectedDay(dateKeyInZone(selectedSlot.start, zone));
    } else if (selectedDay) {
      setDayCheckPending(true);
    }
    const at = selectedSlot ? selectedSlot.start : selectedDay ? zoneNoonInstant(selectedDay, zone) : new Date();
    setAnnouncement(`Times are now shown in ${zone}, ${zoneOffsetLabel(at, zone)}.`);
  }

  const bookMutation = useMutation({
    mutationFn: () =>
      schedulingLinksApi.bookSlot(slug, {
        start: selectedSlot!.start,
        duration_minutes: duration!,
        name: name.trim(),
        email: email.trim(),
        notes: notes.trim() || undefined,
      }),
    retry: false,
    onSuccess: (conf) => {
      setBookedZone(displayZone);
      setConfirmation(conf);
      setSubmitError(null);
      setSubmitFailure(null);
    },
    onError: (e: unknown) => {
      const status = httpStatus(e);
      const kind = classifyApiFailure(e);
      if (kind === "cancelled") return;
      const detail = isApiHttpError(e) ? apiErrorMessage(e) : null;
      if (status === 429) {
        // Keep the chosen slot and the typed details; no refetch, no alarm.
        setSubmitError(BOOKING_RATE_LIMITED_MESSAGE);
      } else if (status === 409) {
        setSubmitError(detail ?? "This slot was just taken — please pick another time.");
        setSelectedSlot(null);
        daySlotsQuery.refetch();
      } else if (status === 422) {
        setSubmitError(detail ?? "This time can't be booked — the host requires more advance notice.");
        daySlotsQuery.refetch();
      } else if (status === 400) {
        setSubmitError(detail ?? "Please check your details and try again.");
      } else if (status === 410) {
        setSubmitError(detail ?? "This link is no longer accepting bookings.");
      } else if (kind === "budget") {
        // The one answer that proves nothing was saved: the booker may press Book again.
        setSubmitFailure(e);
      } else if (kind === "lost" || (status !== undefined && status >= 500)) {
        // The booking may have been saved (contract §2.4). The chosen time and
        // the typed details stay; the day's times are re-read so the booker
        // can see whether the slot is gone. Nothing re-sends the booking.
        setSubmitFailure(e);
        setUnconfirmedSlot(selectedSlot);
        setSelectedSlot(null);
        void daySlotsQuery.refetch();
      } else {
        setSubmitError(apiErrorMessage(e));
        toast.error("Booking failed");
      }
    },
  });


  // ---------- Render: not found / no longer available ----------
  if (linkQuery.isError) {
    const err = linkQuery.error as unknown;
    const kind = classifyApiFailure(err);
    if (kind === "lost" || kind === "budget") {
      // PAC-83 AC-10: the link may well exist — never "Link not found".
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="w-full max-w-md text-center">
            <h1 className="font-serif text-3xl text-foreground">We couldn't load this link</h1>
            <ApiErrorNotice
              className="mt-4 text-left"
              error={err}
              effect="read"
              onRetry={() => void linkQuery.refetch()}
              retrying={linkQuery.isFetching}
            />
            <StillWorking active={linkQuery.isFetching} className="mt-3" />
            <Link to="/" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
              ← Back to Paceday
            </Link>
          </div>
        </div>
      );
    }
    const status = isApiHttpError(err) ? err.status : (err as { status?: number } | null)?.status;
    const gone = status === 410;
    const notFound = status === 404 || (err as Error | null)?.message === "not_found";
    const heading = gone ? "Link no longer available" : notFound ? "Link not found" : "We couldn't load this link";
    const body = gone
      ? "This booking link has been used up or paused. Reach out to the host for another time."
      : notFound
        ? "This booking link doesn't exist or is no longer active."
        : apiErrorMessage(err);
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="font-serif text-3xl text-foreground">{heading}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          {!gone && !notFound && (
            <div className="mt-5">
              <Button variant="outline" size="sm" onClick={() => linkQuery.refetch()} disabled={linkQuery.isFetching}>
                {linkQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin" />} Try again
              </Button>
            </div>
          )}
          <Link to="/" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
            ← Back to Paceday
          </Link>
        </div>
      </div>
    );
  }


  // ---------- Render: confirmation ----------
  if (confirmation) {
    // In the zone shown when the visitor booked (AC-21).
    const zone = bookedZone ?? displayZone;
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:py-20">
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-muted">
              <CheckCircle2 className="h-9 w-9 text-primary" strokeWidth={2.2} />
            </div>
            <h1 className="mt-6 font-serif text-3xl text-foreground sm:text-4xl">You are confirmed!</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a calendar invite to <span className="font-medium text-foreground">{confirmation.booker_email}</span>.
            </p>

            <div className="mt-6 flex items-center justify-center gap-3">
              <HostAvatars hosts={confirmation.hosts} size="md" overlap showPending={false} />
              <span className="text-sm font-medium text-foreground">{hostsLabel(confirmation.hosts)}</span>
            </div>

            <div className="mt-8 rounded-xl border border-border bg-background p-5 text-left">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">{formatDateLongInZone(confirmation.start, zone)}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatTimeInZone(confirmation.start, zone)} – {formatTimeInZone(confirmation.end, zone)} ·{" "}
                    {confirmation.duration_minutes} min
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{zoneLabel(zone, confirmation.start)}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col items-center gap-3">
              <Button onClick={() => downloadIcs(confirmation, zone)}>
                <CalendarDays className="h-4 w-4" /> Add to calendar
              </Button>
              <button
                type="button"
                onClick={() => {
                  // The chosen zone stays for the visit (AC-21, AC-25).
                  setConfirmation(null);
                  setBookedZone(null);
                  setSelectedSlot(null);
                  setSelectedDay(undefined);
                  setName("");
                  setEmail("");
                  setNotes("");
                }}
                className="text-sm font-medium text-primary hover:underline"
              >
                Book another time
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Render: loading ----------
  if (!link) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <StillWorking active={linkQuery.isFetching} />
      </div>
    );
  }

  // ---------- Render: main booking flow ----------
  const labelInstant = selectedSlot
    ? selectedSlot.start
    : selectedDay
      ? zoneNoonInstant(selectedDay, displayZone)
      : new Date();
  const dayPending =
    daySlotsQuery.isLoading ||
    (daySlotsQuery.isFetching && slots.length === 0) ||
    (!!daySlotsQuery.data && dayCheck !== "ok" && !zoneStuck);
  const slotOffsets = slots.map((s) => zoneOffsetLabel(s.start, displayZone));
  // A transition day: each time carries its own offset (spec 3.2, AC-17, AC-18).
  const mixedOffsets = new Set(slotOffsets).size > 1;
  const retryAfterZoneChange = () => {
    rereadFor.current = null;
    void linkQuery.refetch();
    void overviewQuery.refetch();
    if (selectedDay) void daySlotsQuery.refetch();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> paceday
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-12">
          {/* LEFT — host info */}
          <aside className="space-y-5">
            <div className="flex items-center gap-3">
              <HostAvatars hosts={link.hosts} size="lg" overlap showPending={false} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{hostsLabel(link.hosts)}</p>
              <h1 className="mt-1 font-serif text-3xl text-foreground sm:text-4xl">{link.title}</h1>
            </div>

            {link.durations.length > 1 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Duration</p>
                <div className="flex flex-wrap gap-2">
                  {link.durations.map((d) => {
                    const on = duration === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => pickDuration(d)}
                        className={cn(
                          "min-h-[44px] rounded-full border px-4 py-2 text-sm font-medium transition",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-foreground hover:border-primary/40",
                        )}
                      >
                        {d} min
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{duration ?? link.durations[0]} minutes</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4" aria-hidden="true" />
                <span data-testid="booking-tz-label">{zoneLabel(displayZone, labelInstant)}</span>
              </div>
              {isCollective && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>All hosts must be available</span>
                </div>
              )}
              {!!link.min_notice_minutes && link.min_notice_minutes > 0 && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>
                    {link.min_notice_minutes < 60
                      ? `${link.min_notice_minutes} min notice required`
                      : link.min_notice_minutes < 1440
                        ? `${Math.round(link.min_notice_minutes / 60)} hour${Math.round(link.min_notice_minutes / 60) === 1 ? "" : "s"} notice required`
                        : `${Math.round(link.min_notice_minutes / 1440)} day${Math.round(link.min_notice_minutes / 1440) === 1 ? "" : "s"} notice required`}
                  </span>
                </div>
              )}
              {link.usage_type === "single_use" && (
                <div className="rounded-md border border-ai/30 bg-ai/10 px-3 py-2 text-xs text-[#5C3DA1]">
                  This is a one-time link — only one booking is allowed.
                </div>
              )}
            </div>

            <TimeZoneSwitcher
              value={displayZone}
              linkZone={link.time_zone}
              hostZone={hostZone}
              browserZone={browserZone}
              disabled={legacy}
              onChange={switchZone}
            />
            {unsupportedZone && (
              <p data-testid="booking-tz-unsupported" className="text-sm text-destructive">
                Times can't be shown in {unsupportedZone}. Choose another time zone.
              </p>
            )}
            <div data-testid="booking-tz-announcer" role="status" aria-live="polite" className="sr-only">
              {announcement}
            </div>
          </aside>

          {/* RIGHT — 3-step flow */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
            {isCollective && link.coverage && (
              <div className="mb-4 flex">
                <CoveragePill coverage={link.coverage} compactPrivate />
              </div>
            )}
            {zoneStuck && (
              <ApiErrorNotice
                className="mb-3"
                error={new Error(ZONE_CHANGED_MESSAGE)}
                effect="read"
                message={ZONE_CHANGED_MESSAGE}
                onRetry={retryAfterZoneChange}
                retrying={linkQuery.isFetching}
              />
            )}
            {!selectedSlot ? (
              <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Pick a date
                  </p>
                  {/* AC-16a: a failed overview leaves no day selectable. */}
                  {overviewFailed && (
                    <ApiErrorNotice
                      className="mb-3"
                      error={overviewQuery.error}
                      effect="read"
                      message={httpStatus(overviewQuery.error) === 429 ? SLOTS_RATE_LIMITED_MESSAGE : undefined}
                      onRetry={() => void overviewQuery.refetch()}
                      retrying={overviewQuery.isFetching}
                    />
                  )}
                  <Calendar
                    mode="single"
                    fixedWeeks
                    month={shownMonth}
                    onMonthChange={setMonth}
                    today={keyToLocalDate(todayKey)}
                    selected={selectedDay ? keyToLocalDate(selectedDay) : undefined}
                    onSelect={pickDay}
                    // Days are days of the displayed zone; only a day the
                    // overview lists, from today (displayed zone), is selectable.
                    disabled={(date) => !isSelectable(localDateToKey(date))}
                    className="pointer-events-auto rounded-md border border-border bg-background p-3"
                  />
                </div>

                {/* Step 2 — Slots */}
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {selectedDay ? formatDateKeyLong(selectedDay) : "Available times"}
                  </p>
                  {/* A 409 (or 422) on submit clears the chosen slot and returns
                      here, so the reason must be shown here too: it used to live
                      only in the details step, and a visitor who lost the race
                      to a slot was sent back with no explanation. */}
                  {submitError && (
                    <p role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      {submitError}
                    </p>
                  )}
                  {submitFailure !== null && unconfirmedSlot && (
                    <div className="mb-3 space-y-2">
                      <ApiErrorNotice error={submitFailure} effect="booking" />
                      <p className="text-sm text-muted-foreground" data-testid="unconfirmed-booking-time">
                        You had chosen {formatDateLongInZone(unconfirmedSlot.start, displayZone)},{" "}
                        {formatTimeInZone(unconfirmedSlot.start, displayZone)}. If you still want a time, pick one again
                        below — your details are kept.
                      </p>
                    </div>
                  )}
                  {slotsFailed && (
                    <ApiErrorNotice
                      className="mb-3"
                      error={daySlotsQuery.error}
                      effect="read"
                      message={httpStatus(daySlotsQuery.error) === 429 ? SLOTS_RATE_LIMITED_MESSAGE : undefined}
                      onRetry={() => void daySlotsQuery.refetch()}
                      retrying={daySlotsQuery.isFetching}
                    />
                  )}
                  {!selectedDay ? (
                    <p className="text-sm text-muted-foreground">Select a date to see available times.</p>
                  ) : dayPending ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Finding times…
                      </div>
                      <StillWorking active={daySlotsQuery.isFetching} />
                    </div>
                  ) : slotsFailed || zoneStuck ? null : slots.length === 0 ? (
                    (
                      <p className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                        {isCollective
                          ? "No time available for all hosts on this day — try another date."
                          : "No time available on this day — try another date."}
                      </p>
                    )
                  ) : (
                    <div className="grid max-h-[360px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                      {slots.map((s, i) => {
                        const time = formatTimeInZone(s.start, displayZone);
                        return (
                          <div key={s.start} className="flex flex-col">
                            <button
                              type="button"
                              // Date, time and zone with its offset (spec 3.9, AC-27).
                              aria-label={`${formatDateLongInZone(s.start, displayZone)}, ${time}, ${displayZone} ${slotOffsets[i]}`}
                              onClick={() => {
                                setSelectedSlot(s);
                                setSubmitError(null);
                              }}
                              className="min-h-[44px] rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:bg-primary-muted"
                            >
                              {time}
                            </button>
                            {mixedOffsets && (
                              <span aria-hidden="true" className="mt-0.5 text-center text-xs text-muted-foreground">
                                {slotOffsets[i]}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            ) : (
              /* Step 3 — Booker details */
              <div className="space-y-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confirm</p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {formatDateLongInZone(selectedSlot.start, displayZone)} · {formatTimeInZone(selectedSlot.start, displayZone)} –{" "}
                      {formatTimeInZone(selectedSlot.end, displayZone)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{zoneLabel(displayZone, selectedSlot.start)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedSlot(null);
                      setSubmitFailure(null);
                    }}
                  >
                    Change
                  </Button>
                </div>

                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSubmitError(null);
                    setSubmitFailure(null);
                    setUnconfirmedSlot(null);
                    if (!name.trim() || !email.trim()) {
                      setSubmitError("Please enter your name and email.");
                      return;
                    }
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                      setSubmitError("Please enter a valid email address.");
                      return;
                    }
                    bookMutation.mutate();
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="booker-name">Name</Label>
                    <Input id="booker-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="booker-email">Email</Label>
                    <Input
                      id="booker-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      maxLength={255}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="booker-notes">Notes (optional)</Label>
                    <Textarea
                      id="booker-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      placeholder="Anything we should know before the meeting?"
                    />
                  </div>

                  {submitError && (
                    <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      {submitError}
                    </p>
                  )}
                  {submitFailure !== null && <ApiErrorNotice error={submitFailure} effect="booking" />}

                  <Button type="submit" disabled={bookMutation.isPending} className="w-full sm:w-auto">
                    {bookMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirm booking
                  </Button>
                  <StillWorking active={bookMutation.isPending} />
                </form>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
