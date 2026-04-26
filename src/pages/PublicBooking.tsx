import { useEffect, useMemo, useState } from "react";
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
import { schedulingLinksApi } from "@/api/schedulingLinks";
import type { BookingConfirmation, BookingSlot, PublicLinkInfo } from "@/api/types";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function dateOnlyStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function fmtDateLong(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function hostsLabel(hosts: PublicLinkInfo["hosts"]): string {
  if (hosts.length === 0) return "";
  const names = hosts.map((h) => h.name?.split(" ")[0] || h.email.split("@")[0]);
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names[0]} + ${names.length - 1} others`;
}

function buildIcs(conf: BookingConfirmation): string {
  const dt = (s: string) => new Date(s).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Paceday//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${conf.id}@paceday.com`,
    `DTSTAMP:${dt(new Date().toISOString())}`,
    `DTSTART:${dt(conf.start)}`,
    `DTEND:${dt(conf.end)}`,
    `SUMMARY:${conf.title}`,
    `DESCRIPTION:Booked via Paceday${conf.notes ? `\\n\\n${conf.notes.replace(/\n/g, "\\n")}` : ""}`,
    `ORGANIZER;CN=${conf.hosts[0]?.name || conf.hosts[0]?.email}:mailto:${conf.hosts[0]?.email || ""}`,
    ...conf.hosts.map(
      (h) =>
        `ATTENDEE;CN=${h.name || h.email};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:${h.email}`,
    ),
    `ATTENDEE;CN=${conf.booker_name};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:${conf.booker_email}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

function downloadIcs(conf: BookingConfirmation) {
  const blob = new Blob([buildIcs(conf)], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${conf.link_slug}-${dateOnlyStr(new Date(conf.start))}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PublicBooking() {
  const { slug = "" } = useParams<{ slug: string }>();
  const tz = useMemo(browserTimezone, []);

  const linkQuery = useQuery({
    queryKey: ["public-link", slug],
    queryFn: () => schedulingLinksApi.getPublicLink(slug),
    retry: false,
  });

  const link = linkQuery.data;
  const isCollective = (link?.hosts.length ?? 0) > 1;
  const [duration, setDuration] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  // Default duration once link loads.
  useEffect(() => {
    if (link && duration == null) {
      setDuration(link.durations[0] ?? 30);
    }
  }, [link, duration]);

  // Available dates (for greying the calendar).
  const availableDatesQuery = useQuery({
    queryKey: ["public-slots-summary", slug],
    queryFn: () => schedulingLinksApi.getPublicSlots(slug, {}),
    enabled: !!link,
  });
  const availableDates = useMemo(() => {
    const s = new Set<string>();
    (availableDatesQuery.data?.available_dates ?? []).forEach((d) => s.add(d));
    return s;
  }, [availableDatesQuery.data]);

  // Slots for the selected day.
  const dateStr = selectedDate ? dateOnlyStr(selectedDate) : undefined;
  const slotsQuery = useQuery({
    queryKey: ["public-slots", slug, dateStr, duration],
    queryFn: () => schedulingLinksApi.getPublicSlots(slug, { date: dateStr!, duration: duration! }),
    enabled: !!dateStr && !!duration,
  });
  const slots = slotsQuery.data?.slots ?? [];

  // Reset slot selection when date / duration change.
  useEffect(() => {
    setSelectedSlot(null);
    setSubmitError(null);
  }, [dateStr, duration]);

  const bookMutation = useMutation({
    mutationFn: () =>
      schedulingLinksApi.bookSlot(slug, {
        start: selectedSlot!.start,
        duration_minutes: duration!,
        name: name.trim(),
        email: email.trim(),
        notes: notes.trim() || undefined,
      }),
    onSuccess: (conf) => {
      setConfirmation(conf);
      setSubmitError(null);
    },
    onError: (e: unknown) => {
      const status = (e as { status?: number })?.status;
      if (status === 409) {
        setSubmitError("This slot was just taken — please pick another time.");
        setSelectedSlot(null);
        slotsQuery.refetch();
      } else if (status === 422) {
        setSubmitError("This time is too soon — the host requires more advance notice.");
        setSelectedSlot(null);
        slotsQuery.refetch();
      } else if (status === 410) {
        setSubmitError("This link is no longer accepting bookings.");
      } else {
        setSubmitError("Could not complete the booking. Please try again.");
        toast.error("Booking failed");
      }
    },
  });

  // ---------- Render: not found / no longer available ----------
  if (linkQuery.isError) {
    const status = (linkQuery.error as { status?: number } | null)?.status;
    const gone = status === 410;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="font-serif text-3xl text-foreground">
            {gone ? "Link no longer available" : "Link not found"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {gone
              ? "This booking link has been used up or paused. Reach out to the host for another time."
              : "This booking link doesn't exist or is no longer active."}
          </p>
          <Link to="/" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
            ← Back to Paceday
          </Link>
        </div>
      </div>
    );
  }

  // ---------- Render: confirmation ----------
  if (confirmation) {
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
                  <p className="text-sm font-medium text-foreground">{fmtDateLong(confirmation.start)}</p>
                  <p className="text-sm text-muted-foreground">
                    {fmtTime(confirmation.start)} – {fmtTime(confirmation.end)} · {confirmation.duration_minutes} min
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{tz}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col items-center gap-3">
              <Button onClick={() => downloadIcs(confirmation)}>
                <CalendarDays className="h-4 w-4" /> Add to calendar
              </Button>
              <button
                type="button"
                onClick={() => {
                  setConfirmation(null);
                  setSelectedSlot(null);
                  setSelectedDate(undefined);
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ---------- Render: main booking flow ----------
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
                        onClick={() => setDuration(d)}
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
                <Globe className="h-4 w-4" />
                <span>{tz}</span>
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
                <div className="rounded-md border border-[#9B7AE0]/30 bg-[#9B7AE0]/10 px-3 py-2 text-xs text-[#5C3DA1]">
                  This is a one-time link — only one booking is allowed.
                </div>
              )}
            </div>
          </aside>

          {/* RIGHT — 3-step flow */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
            {isCollective && link.coverage && (
              <div className="mb-4 flex">
                <CoveragePill coverage={link.coverage} compactPrivate />
              </div>
            )}
            {!selectedSlot ? (
              <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Pick a date
                  </p>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => {
                      if (date < today) return true;
                      return !availableDates.has(dateOnlyStr(date));
                    }}
                    className="pointer-events-auto rounded-md border border-border bg-background p-3"
                  />
                </div>

                {/* Step 2 — Slots */}
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {selectedDate ? fmtDateLong(selectedDate.toISOString()) : "Available times"}
                  </p>
                  {!selectedDate ? (
                    <p className="text-sm text-muted-foreground">Select a date to see available times.</p>
                  ) : slotsQuery.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Finding times…
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                      {isCollective
                        ? "No time available for all hosts on this day — try another date."
                        : "No time available on this day — try another date."}
                    </p>
                  ) : (
                    <div className="grid max-h-[360px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                      {slots.map((s) => (
                        <button
                          key={s.start}
                          type="button"
                          onClick={() => setSelectedSlot(s)}
                          className="min-h-[44px] rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:bg-primary-muted"
                        >
                          {fmtTime(s.start)}
                        </button>
                      ))}
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
                      {fmtDateLong(selectedSlot.start)} · {fmtTime(selectedSlot.start)} – {fmtTime(selectedSlot.end)}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedSlot(null)}>
                    Change
                  </Button>
                </div>

                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSubmitError(null);
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
                    <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      {submitError}
                    </p>
                  )}

                  <Button type="submit" disabled={bookMutation.isPending} className="w-full sm:w-auto">
                    {bookMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirm booking
                  </Button>
                </form>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
