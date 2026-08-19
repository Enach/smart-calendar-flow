import { useEffect, useMemo, useState } from "react";
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
} from "@/api/schedulingLinks";
import { api, apiErrorMessage } from "@/api/client";

import { getFreebusy } from "@/api/coverageCache";
import type { LinkUsageType, ParticipantCoverage, SchedulingLink, Weekday } from "@/api/types";
import { CoverageBadge, type ChipState } from "@/components/links/CoverageBadge";
import { toast } from "@/hooks/useToast";

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
  const isEdit = !!link;

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
  const [coHostEmail, setCoHostEmail] = useState("");
  const [coHosts, setCoHosts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const initialEmails = useMemo(
    () => (link ? link.hosts.filter((h) => !h.is_owner).map((h) => h.email) : []),
    [link],
  );

  // Reset / hydrate when opening.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setCoHostEmail("");
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
      setCoHosts(link.hosts.filter((h) => !h.is_owner).map((h) => h.email));
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
      setCoHosts([]);
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
    const wasAlreadyHere = initialEmails.includes(email);
    // Co-hosts who already accepted in a prior session are full Paceday users.
    if (link && wasAlreadyHere) {
      const host = link.hosts.find((h) => h.email.toLowerCase() === email.toLowerCase());
      if (host?.status === "accepted" && host.user_id) return { kind: "paceday-accepted" };
      if (host?.status === "pending") return { kind: "paceday-pending" };
    }
    if (coverageQuery.isLoading) return { kind: "loading" };
    const cov = coverageByEmail.get(email.toLowerCase());
    if (!cov) return { kind: "loading" };
    if (cov.status === "paceday_user") return { kind: "paceday-accepted" };
    if (cov.status === "known") return { kind: "synced", provider: cov.provider };
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
    }),
    [title, durations, days, windowStart, windowEnd, bufferBefore, bufferAfter, minNotice, usageType, maxUses],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...formValues,
        title: title.trim(),
        slug: slug.trim(),
        co_host_emails: coHosts,
      };
      if (link) return schedulingLinksApi.updateLink(link.id, payload);
      return schedulingLinksApi.createLink(payload);
    },
    onSuccess: (saved) => {
      const newCount = coHosts.filter((e) => !initialEmails.includes(e)).length;
      setError(null);
      // Seed the cache with the link the server actually returned, so the saved
      // data stays visible even if the list refetch below fails.
      if (saved) {
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
      }
      qc.invalidateQueries({ queryKey: schedulingLinkKeys.links });
      qc.invalidateQueries({ queryKey: schedulingLinkKeys.invites });
      if (newCount > 0) {
        toast.success(`Invites sent to ${newCount} co-host${newCount === 1 ? "" : "s"}`);
      } else {
        toast.success(isEdit ? "Link updated" : "Link created");
      }
      onOpenChange(false);
    },

    onError: (e) => {
      // 409 / 422 and friends keep the drawer open with an actionable message.
      const message = apiErrorMessage(e);
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
    mutation.mutate();
  }

  function toggleDuration(d: number) {
    setDurations((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  }
  function toggleDay(d: Weekday) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function addCoHost() {
    const email = coHostEmail.trim().toLowerCase();
    setError(null);
    if (!email) return;
    if (!emailValid(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (coHosts.includes(email)) {
      setError("This co-host is already added.");
      return;
    }
    if (coHosts.length >= 5) {
      setError("You can invite up to 5 co-hosts.");
      return;
    }
    setCoHosts((prev) => [...prev, email]);
    setCoHostEmail("");
  }

  function removeCoHost(email: string) {
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
              <Button type="button" variant="outline" size="sm" onClick={addCoHost} className="shrink-0">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
            
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
