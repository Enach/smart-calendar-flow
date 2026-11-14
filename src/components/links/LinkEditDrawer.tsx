import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Plus, Loader2 } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  schedulingLinkKeys,
  schedulingLinksApi,
  publicBookingUrl,
  validateLinkForm,
  type LinkFormValues,
  type SchedulingLinkSaveResult,
} from "@/api/schedulingLinks";
import { apiErrorMessage } from "@/api/client";

import { getFreebusy } from "@/api/coverageCache";
import {
  BOOKING_HORIZON_DEFAULT_DAYS,
  BOOKING_HORIZON_MAX_DAYS,
  BOOKING_HORIZON_MIN_DAYS,
  type BookingRefusalMessage,
  type LinkUsageType,
  type ParticipantCoverage,
  type SchedulingLink,
  type Weekday,
} from "@/api/types";
import { CoverageBadge, type ChipState } from "@/components/links/CoverageBadge";
import { toast } from "@/hooks/useToast";
import { effectOf } from "@/api/effects";
import { AuthContext } from "@/contexts/auth-context";
import {
  CO_HOST_ADD_CAP,
  CO_HOST_TEXT,
  coHostsChanged,
  outcomeLines,
  saveSummary,
  staysOpenAfter,
} from "@/components/links/coHostSave";

interface LinkEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the drawer edits this link. Otherwise it creates a new one. */
  link?: SchedulingLink | null;
}

const ALL_WEEKDAYS: Array<{ value: Weekday; label: string }> = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const DURATIONS = [15, 30, 45, 60];
const BUFFERS = [0, 5, 10, 15];

/** Minimum-notice presets, expressed in minutes. */
const NOTICE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "No minimum" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 480, label: "8 hours" },
  { value: 1440, label: "1 day" },
  { value: 2880, label: "2 days" },
  { value: 10080, label: "1 week" },
];

const USAGE_OPTIONS: Array<{
  value: LinkUsageType;
  label: string;
  description: string;
}> = [
  {
    value: "reusable",
    label: "Reusable",
    description: "Anyone with the link can book — no limit.",
  },
  {
    value: "recurring",
    label: "Recurring",
    description: "Bookable a fixed number of times, then auto-disables.",
  },
  {
    value: "single_use",
    label: "Single use",
    description: "One booking only. Great for sharing with one person.",
  },
];

/** PAC-72 D-2/D-5: what a visitor reads when a booking is refused. */
const REFUSAL_OPTIONS: Array<{
  value: BookingRefusalMessage;
  label: string;
  description: string;
}> = [
  {
    value: "generic",
    label: "Same message every time",
    description: "Visitors read “slot is no longer available”. It says nothing about your calendar.",
  },
  {
    value: "specific",
    label: "Say why",
    description:
      "Too soon, outside your hours, too far ahead, already booked, or a host is busy. Can reveal that you or a co-host is busy then.",
  },
];

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function emailValid(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function LinkEditDrawer({ open, onOpenChange, link }: LinkEditDrawerProps) {
  const qc = useQueryClient();
  // The signed-in user, when the drawer is inside the auth provider: the
  // owner's own address is refused as a chip (PAC-112 AC-14).
  const signedInEmail = useContext(AuthContext)?.user?.email;
  // PAC-112 (contract §5.4): the link this editor saves to. It starts as the
  // link it was opened on; after a create that keeps the editor open it is the
  // created link, so a further save edits it and never creates another.
  const [editingId, setEditingId] = useState<string | null>(link?.id ?? null);
  const isEdit = !!editingId;
  // A fresh value on every open and after every save that keeps the editor
  // open: each value is one strict baseline read (contract §5.1), so reopening
  // retries it. 0 while closed, so no read starts before the opening effect.
  const [baselineRead, setBaselineRead] = useState(0);
  const readCounter = useRef(0);
  const nextBaselineRead = () => setBaselineRead(++readCounter.current);
  const [outcomes, setOutcomes] = useState<string[]>([]);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [durations, setDurations] = useState<number[]>([30]);
  const [days, setDays] = useState<Weekday[]>(["mon", "tue", "wed", "thu", "fri"]);
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("18:00");
  const [bufferBefore, setBufferBefore] = useState(5);
  const [bufferAfter, setBufferAfter] = useState(5);
  const [minNotice, setMinNotice] = useState<number>(60);
  const [usageType, setUsageType] = useState<LinkUsageType>("reusable");
  const [maxUses, setMaxUses] = useState<number>(5);
  const [horizonDays, setHorizonDays] = useState<number>(BOOKING_HORIZON_DEFAULT_DAYS);
  const [refusalMessage, setRefusalMessage] = useState<BookingRefusalMessage>("generic");
  const [coHostEmail, setCoHostEmail] = useState("");
  const [coHosts, setCoHosts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // PAC-112 (contract §5.1): the co-host baseline comes only from the strict
  // single-link read, never from the links list or a save's answer.
  const baselineQuery = useQuery({
    queryKey: ["scheduling-link-baseline", editingId, baselineRead],
    queryFn: () => schedulingLinksApi.getLink(editingId as string),
    enabled: open && !!editingId && baselineRead > 0,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const baselineLink = editingId ? baselineQuery.data : undefined;
  const baselineHosts = useMemo(() => (baselineLink ? baselineLink.hosts.filter((h) => !h.is_owner) : []), [baselineLink]);
  const baseline = useMemo(() => baselineHosts.map((h) => h.email), [baselineHosts]);
  // A new link's baseline is empty; an existing one's is the read, once it answered.
  const coHostsEditable = !editingId || baselineQuery.isSuccess;
  const coHostsBlockedReason = coHostsEditable
    ? null
    : baselineQuery.isError
      ? CO_HOST_TEXT.baselineFailed
      : CO_HOST_TEXT.baselinePending;
  const ownerEmails = useMemo(() => {
    const out = new Set<string>();
    if (signedInEmail) out.add(signedInEmail.trim().toLowerCase());
    for (const h of [...(baselineLink?.hosts ?? []), ...(link?.hosts ?? [])]) {
      if (h.is_owner && h.email) out.add(h.email.trim().toLowerCase());
    }
    return out;
  }, [signedInEmail, baselineLink, link]);

  // The chips are the baseline read's roster as soon as it answers.
  useEffect(() => {
    if (baselineLink) setCoHosts(baselineLink.hosts.filter((h) => !h.is_owner).map((h) => h.email));
  }, [baselineLink]);

  // Reset / hydrate when opening.
  useEffect(() => {
    if (!open) {
      setBaselineRead(0);
      return;
    }
    setError(null);
    setOutcomes([]);
    setCoHostEmail("");
    setEditingId(link?.id ?? null);
    nextBaselineRead();
    // Never the links list's roster (AC-6): the chips wait for the strict read.
    setCoHosts([]);
    if (link) {
      setTitle(link.title);
      setSlug(link.slug);
      setSlugDirty(true);
      setDurations(link.durations);
      setDays(link.days);
      setWindowStart(link.window_start);
      setWindowEnd(link.window_end);
      setBufferBefore(link.buffer_before);
      setBufferAfter(link.buffer_after);
      setMinNotice(link.min_notice_minutes ?? 0);
      setUsageType(link.usage_type ?? "reusable");
      setMaxUses(link.max_uses ?? 5);
      setHorizonDays(link.booking_horizon_days ?? BOOKING_HORIZON_DEFAULT_DAYS);
      setRefusalMessage(link.refusal_message ?? "generic");
    } else {
      setTitle("");
      setSlug("");
      setSlugDirty(false);
      setDurations([30]);
      setDays(["mon", "tue", "wed", "thu", "fri"]);
      setWindowStart("09:00");
      setWindowEnd("18:00");
      setBufferBefore(5);
      setBufferAfter(5);
      setMinNotice(60);
      setUsageType("reusable");
      setMaxUses(5);
      setHorizonDays(BOOKING_HORIZON_DEFAULT_DAYS);
      setRefusalMessage("generic");
    }
  }, [open, link]);

  // Auto-derive slug from title until user manually edits it.
  useEffect(() => {
    if (!slugDirty) setSlug(slugify(title));
  }, [title, slugDirty]);

  // ---------- Real-time availability coverage for co-host chips (T-40) ----------
  // We hit /api/freebusy for the next 14 days whenever the chip set changes,
  // then map the response back onto each email so we can render the right badge.
  const coverageRange = useMemo(() => {
    const start = new Date();
    const end = new Date(Date.now() + 14 * 86_400_000);
    return { start: start.toISOString(), end: end.toISOString() };
  }, []);
  const sortedCoHostsKey = useMemo(() => [...coHosts].sort().join(","), [coHosts]);
  const coverageQuery = useQuery({
    queryKey: ["link-edit-freebusy", sortedCoHostsKey],
    queryFn: () =>
      getFreebusy({
        emails: coHosts,
        start_time: coverageRange.start,
        end_time: coverageRange.end,
      }),
    enabled: coHosts.length > 0 && open,
    staleTime: 60_000,
  });
  const coverageByEmail = useMemo(() => {
    const m = new Map<string, ParticipantCoverage>();
    (coverageQuery.data?.participants ?? []).forEach((p) => m.set(p.email.toLowerCase(), p));
    return m;
  }, [coverageQuery.data]);

  function chipStateFor(email: string): ChipState {
    // The host record comes from the strict baseline read (PAC-112), never the list.
    const host = baselineHosts.find((h) => h.email.toLowerCase() === email.toLowerCase());
    if (host) {
      // Co-hosts who already accepted in a prior session are full Paceday users.
      if (host.status === "accepted" && host.user_id) return { kind: "paceday-accepted" };
      if (host.status === "pending") return { kind: "paceday-pending" };
    }
    if (coverageQuery.isLoading) return { kind: "loading" };
    const cov = coverageByEmail.get(email.toLowerCase());
    if (!cov) return { kind: "loading" };
    // Free/busy has two statuses and no provider (PAC-41): "On Paceday" is
    // decided above, from the link's host record, never from free/busy (D-2).
    if (cov.status === "known") return { kind: "synced" };
    return { kind: "unknown" };
  }

  const formValues = useMemo<LinkFormValues>(
    () => ({
      title,
      durations,
      days,
      window_start: windowStart,
      window_end: windowEnd,
      buffer_before: bufferBefore,
      buffer_after: bufferAfter,
      min_notice_minutes: minNotice,
      usage_type: usageType,
      max_uses: usageType === "recurring" ? maxUses : undefined,
      booking_horizon_days: horizonDays,
      refusal_message: refusalMessage,
    }),
    [title, durations, days, windowStart, windowEnd, bufferBefore, bufferAfter, minNotice, usageType, maxUses, horizonDays, refusalMessage],
  );

  const mutation = useMutation({
    mutationFn: async (): Promise<SchedulingLinkSaveResult> => {
      // PAC-112 (contract §5.1): the complete list only when it changed from the
      // baseline, `[]` included; never while the baseline is unavailable.
      const sendList = coHostsEditable && coHostsChanged(coHosts, baseline);
      const payload = {
        ...formValues,
        title: title.trim(),
        slug: slug.trim(),
        ...(sendList ? { co_host_emails: [...coHosts] } : {}),
      };
      if (editingId) return schedulingLinksApi.updateLink(editingId, payload);
      return schedulingLinksApi.createLink(payload);
    },
    onSuccess: (result) => {
      const created = !editingId;
      const saved = result.link;
      const summary = saveSummary(result, created);
      setError(null);
      // Seed the cache with the link the server actually returned (no host is
      // added to it), so the saved data stays visible even if the list refetch
      // below fails.
      qc.setQueryData<{ owned: SchedulingLink[]; shared: SchedulingLink[] }>(
        schedulingLinkKeys.links,
        (prev) => {
          const base = prev ?? { owned: [], shared: [] };
          const owned = base.owned.some((l) => l.id === saved.id)
            ? base.owned.map((l) => (l.id === saved.id ? saved : l))
            : [saved, ...base.owned];
          return { owned, shared: base.shared };
        },
      );
      qc.invalidateQueries({ queryKey: schedulingLinkKeys.links });
      qc.invalidateQueries({ queryKey: schedulingLinkKeys.invites });
      if (staysOpenAfter(result)) {
        // Contract §5.4: name the addresses, re-read the baseline, and edit the
        // saved link from now on (a create becomes an edit, never a second POST).
        // The "Save results" live region announces the summary there; no toast,
        // so it is not announced twice.
        setOutcomes([...summary, ...outcomeLines(result.co_host_changes)]);
        setEditingId(saved.id);
        setSlug(saved.slug);
        setSlugDirty(true);
        setCoHosts([]);
        setCoHostEmail("");
        nextBaselineRead();
        return;
      }
      toast.success(summary.join(" "));
      onOpenChange(false);
    },

    onError: (e) => {
      // 409 / 422 and friends keep the drawer open with an actionable message.
      const message = apiErrorMessage(e, effectOf("schedulingLinksApi.updateLink"));
      setError(message);
      toast.error(message);
    },
  });

  function submit() {
    const problem = validateLinkForm(formValues);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    // A previous save's results never stay on screen beside this save's outcome.
    setOutcomes([]);
    mutation.mutate();
  }

  function toggleDuration(d: number) {
    setDurations((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  }
  function toggleDay(d: Weekday) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function addCoHost() {
    if (!coHostsEditable) return;
    const email = coHostEmail.trim().toLowerCase();
    setError(null);
    if (!email) return;
    if (!emailValid(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (ownerEmails.has(email)) {
      setError(CO_HOST_TEXT.ownAddressRefused);
      return;
    }
    if (coHosts.some((e) => e.toLowerCase() === email)) {
      setError(CO_HOST_TEXT.duplicate);
      return;
    }
    if (coHosts.length >= CO_HOST_ADD_CAP) {
      setError(CO_HOST_TEXT.cap);
      return;
    }
    setCoHosts((prev) => [...prev, email]);
    setCoHostEmail("");
  }

  function removeCoHost(email: string) {
    if (!coHostsEditable) return;
    setCoHosts((prev) => prev.filter((e) => e !== email));
  }

  const canSave = validateLinkForm(formValues) === null;


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="text-left">
          <SheetTitle className="font-serif text-2xl">{isEdit ? "Edit link" : "New scheduling link"}</SheetTitle>
          <SheetDescription>Set when you (and your co-hosts) are bookable.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="link-title">Title</Label>
            <Input
              id="link-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Intro chat"
              maxLength={80}
            />
          </div>

          {/* Durations */}
          <div className="space-y-2">
            <Label>Durations</Label>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => {
                const on = durations.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDuration(d)}
                    aria-pressed={on}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/40"
                    }`}
                  >
                    {d} min
                  </button>
                );
              })}
            </div>
          </div>

          {/* Days */}
          <div className="space-y-2">
            <Label>Available days</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_WEEKDAYS.map((d) => {
                const on = days.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    aria-pressed={on}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/40"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time window */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="window-start">Start</Label>
              <Input id="window-start" type="time" step="900" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="window-end">End</Label>
              <Input id="window-end" type="time" step="900" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
            </div>
          </div>

          {/* Buffers */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="buffer-before">Buffer before</Label>
              <select
                id="buffer-before"
                value={bufferBefore}
                onChange={(e) => setBufferBefore(parseInt(e.target.value, 10))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {BUFFERS.map((b) => (
                  <option key={b} value={b}>{b} min</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="buffer-after">Buffer after</Label>
              <select
                id="buffer-after"
                value={bufferAfter}
                onChange={(e) => setBufferAfter(parseInt(e.target.value, 10))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {BUFFERS.map((b) => (
                  <option key={b} value={b}>{b} min</option>
                ))}
              </select>
            </div>
          </div>

          {/* Minimum notice */}
          <div className="space-y-2">
            <Label htmlFor="min-notice">Minimum notice before a meeting</Label>
            <select
              id="min-notice"
              value={minNotice}
              onChange={(e) => setMinNotice(parseInt(e.target.value, 10))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {NOTICE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Bookings can't start sooner than this. Useful to give yourself prep time.
            </p>
          </div>

          {/* Booking horizon (PAC-72 D-1) */}
          <div className="space-y-2">
            <Label htmlFor="booking-horizon">How far ahead visitors can book</Label>
            <div className="flex items-center gap-2">
              <Input
                id="booking-horizon"
                type="number"
                inputMode="numeric"
                min={BOOKING_HORIZON_MIN_DAYS}
                max={BOOKING_HORIZON_MAX_DAYS}
                step={1}
                value={Number.isNaN(horizonDays) ? "" : horizonDays}
                onChange={(e) => setHorizonDays(parseInt(e.target.value, 10))}
                className="h-10 w-24"
                aria-describedby="booking-horizon-help"
              />
              <span className="text-sm text-muted-foreground">days, counting today</span>
            </div>
            <p id="booking-horizon-help" className="text-xs text-muted-foreground">
              Between {BOOKING_HORIZON_MIN_DAYS} and {BOOKING_HORIZON_MAX_DAYS}. Days and hours follow your
              profile time zone{link?.time_zone ? ` (${link.time_zone})` : ""}.
            </p>
          </div>

          {/* Refusal message (PAC-72 D-2/D-5) */}
          <div className="space-y-2">
            <Label id="refusal-message-label">When a time can't be booked</Label>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby="refusal-message-label">
              {REFUSAL_OPTIONS.map((opt) => {
                const on = refusalMessage === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setRefusalMessage(opt.value)}
                    className={`rounded-lg border p-3 text-left transition ${
                      on
                        ? "border-primary bg-primary-muted"
                        : "border-border bg-background hover:border-primary/40"
                    }`}
                  >
                    <p className={`text-sm font-semibold ${on ? "text-primary" : "text-foreground"}`}>
                      {opt.label}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{opt.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Usage type */}
          <div className="space-y-2">
            <Label>Link type</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {USAGE_OPTIONS.map((opt) => {
                const on = usageType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setUsageType(opt.value)}
                    aria-pressed={on}
                    className={`rounded-lg border p-3 text-left transition ${
                      on
                        ? "border-primary bg-primary-muted"
                        : "border-border bg-background hover:border-primary/40"
                    }`}
                  >
                    <p className={`text-sm font-semibold ${on ? "text-primary" : "text-foreground"}`}>
                      {opt.label}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{opt.description}</p>
                  </button>
                );
              })}
            </div>
            {usageType === "recurring" && (
              <div className="flex items-center gap-2 pt-1">
                <Label htmlFor="max-uses" className="text-xs text-muted-foreground">
                  Allow up to
                </Label>
                <Input
                  id="max-uses"
                  type="number"
                  min={1}
                  max={999}
                  value={maxUses}
                  onChange={(e) => setMaxUses(Math.max(1, parseInt(e.target.value || "1", 10)))}
                  className="h-9 w-24"
                />
                <span className="text-xs text-muted-foreground">bookings, then auto-disable.</span>
              </div>
            )}
            {isEdit && link && (link.uses_count ?? 0) > 0 && (
              <p className="pt-1 text-[11px] text-muted-foreground">
                Already booked {link.uses_count}
                {usageType === "recurring" && link.max_uses ? ` / ${link.max_uses}` : ""} time
                {link.uses_count === 1 ? "" : "s"}.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Public URL</Label>
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
              {publicBookingUrl(slug || "your-link")}
            </p>
            <p className="text-xs text-muted-foreground">
              {isEdit
                ? "The address is fixed once the link exists."
                : "The address is generated from the title when the link is created."}
            </p>
          </div>


          {/* Co-hosts */}
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
            <div>
              <Label>Add co-hosts</Label>
              <p className="text-xs text-muted-foreground">
                Slots will only show when everyone is free.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                type="email"
                aria-label="Co-host email"
                disabled={!coHostsEditable}
                aria-describedby={coHostsBlockedReason ? "co-hosts-blocked" : undefined}
                value={coHostEmail}
                onChange={(e) => setCoHostEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCoHost();
                  }
                }}
                placeholder="teammate@example.com"
              />
              <Button type="button" variant="outline" size="sm" onClick={addCoHost} disabled={!coHostsEditable} className="shrink-0">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
            {/* Always mounted, so screen readers announce the text when it is set. */}
            <p
              id="co-hosts-blocked"
              role="status"
              className={coHostsBlockedReason ? "text-xs text-muted-foreground" : "sr-only"}
            >
              {coHostsBlockedReason ?? ""}
            </p>

            {coHosts.length > 0 && (
              <ul className="flex flex-wrap gap-2 pt-1">
                {coHosts.map((email) => (
                  <li
                    key={email}
                    className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs"
                  >
                    <span className="font-medium text-foreground">{email}</span>
                    <CoverageBadge state={chipStateFor(email)} />
                    <button
                      type="button"
                      disabled={!coHostsEditable}
                      onClick={() => removeCoHost(email)}
                      className="rounded-full p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      aria-label={`Remove ${email}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="pt-1 text-[11px] text-muted-foreground">{coHosts.length}/5 co-hosts</p>
          </div>
        </div>

        {/* Always mounted (empty until a save keeps the editor open), so the
            results are announced when they appear. */}
        <div role="status" aria-label="Save results">
          {outcomes.length > 0 && (
            <div className="mt-4 space-y-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
              {outcomes.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="mt-8 flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSave || mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Create link"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
