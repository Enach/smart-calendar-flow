import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  Info,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/useToast";
import {
  managerApi,
  cadenceLabel,
  cadenceDays,
  computeDaysOverdue,
  type Cadence,
  type TeamMember,
} from "@/api/manager";

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-[#5B7FFF] focus:outline-none focus:ring-2 focus:ring-[#5B7FFF]/20";

const CADENCE_OPTIONS: Array<{ value: Cadence; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" },
  { value: "none", label: "None" },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtDateShort(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtWeekLabel(d: Date) {
  return `Week of ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

// ---------- Page ----------

export default function Manager() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [profile, setProfile] = useState(() => managerApi.getProfile());

  const [weekOffset, setWeekOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [autoBannerDismissed, setAutoBannerDismissed] = useState(false);

  const teamQ = useQuery({
    queryKey: ["manager-team"],
    queryFn: () => managerApi.remote.listTeam(),
  });
  const team = teamQ.data ?? [];

  const detectMut = useMutation({
    mutationFn: () => managerApi.remote.detect(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["manager-team"] });
      toast.success(
        r.added > 0 ? `${r.added} new team member${r.added === 1 ? "" : "s"} found.` : "No new members found.",
      );
    },
  });

  const removeMut = useMutation({
    mutationFn: (email: string) => managerApi.remote.removeMember(email),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["manager-team"] }),
  });

  const updateMut = useMutation({
    mutationFn: (input: { email: string; patch: Partial<TeamMember> }) =>
      managerApi.remote.updateMember(input.email, input.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["manager-team"] }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return team;
    return team.filter(
      (m) =>
        m.display_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [team, search]);

  const gaps = useMemo(() => managerApi.gaps(), [team]);
  const overdueGaps = gaps.filter((g) => g.days_overdue > 0);
  const allAuto = team.length > 0 && team.every((m) => m.source === "auto");

  // Page-level analytics
  const teamStats = useMemo(() => {
    if (team.length === 0)
      return { avgFocusMin: 0, declining: 0, overdueCount: overdueGaps.length };
    let total = 0;
    let declining = 0;
    for (const m of team) {
      const a = managerApi.analytics(m.email);
      if (!a) continue;
      const last = a.weeks[a.weeks.length - 1]?.focus_minutes ?? 0;
      const prev = a.weeks[a.weeks.length - 3]?.focus_minutes ?? 0;
      total += last;
      if (prev > 0 && (last - prev) / prev < -0.05) declining += 1;
    }
    return {
      avgFocusMin: Math.round(total / team.length),
      declining,
      overdueCount: overdueGaps.length,
    };
  }, [team, overdueGaps.length]);

  const weekDate = useMemo(() => {
    const d = startOfWeek(new Date());
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const goSchedule = (email: string) => {
    navigate(managerApi.schedulePrefillUrl(email));
  };

  if (!profile.is_manager) {
    return (
      <div className="min-h-screen bg-[#F7F8F4]">
        <Navbar />
        <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-20">
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#9B7AE0]/10 text-[#9B7AE0]">
              <Users className="h-6 w-6" />
            </div>
            <h1 className="font-serif text-2xl tracking-tight text-foreground">
              Manager mode is off
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Enable Manager mode to see your team's 1:1 cadence, focus time, and upcoming gaps.
              You can switch back anytime in Settings.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Button
                onClick={() => {
                  void managerApi.remote.setProfile({ is_manager: true, onboarding_profile_selected: true });
                  setProfile(managerApi.getProfile());
                  // Seed team in the background so the page is useful right away.
                  void managerApi.remote.detect().then(() => {
                    qc.invalidateQueries({ queryKey: ["manager-team"] });
                    toast.success("Manager mode enabled. Detecting your team…");
                  });
                }}
                className="bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90"
              >
                Enable Manager mode
              </Button>
              <Button variant="outline" onClick={() => navigate("/settings")}>
                Open Settings
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8F4]">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl tracking-tight text-foreground">My Team</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Recurring 1:1s, focus time, and cadence health for the people you manage.
            </p>
          </div>
        </div>


        {/* Loading skeleton */}
        {teamQ.isLoading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-xl border border-border bg-card"
              />
            ))}
          </div>
        )}

        {/* Empty / detection prompt */}
        {!teamQ.isLoading && team.length === 0 && (
          <DetectionPrompt
            isDetecting={detectMut.isPending}
            onScan={() => detectMut.mutate()}
            onAddManually={() => setAddOpen(true)}
          />
        )}

        {/* Auto-detect info bar */}
        {team.length > 0 && allAuto && !autoBannerDismissed && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#5FC9A6]/40 bg-[#5FC9A6]/10 px-4 py-3 text-sm text-foreground">
            <Info className="mt-0.5 h-4 w-4 text-[#2F8B70]" />
            <p className="flex-1">
              Team auto-detected from your recurring 1:1s. You can add or remove people below.
            </p>
            <button
              onClick={() => setAutoBannerDismissed(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Gaps section */}
        {team.length > 0 && (
          <GapsSection
            gaps={gaps}
            onSchedule={goSchedule}
          />
        )}

        {/* Team list */}
        {team.length > 0 && (
          <section className="mt-6 rounded-2xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-foreground">Your team</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {team.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden items-center gap-1 rounded-full border border-border bg-background px-1 py-1 sm:flex">
                  <button
                    onClick={() => setWeekOffset((w) => w - 1)}
                    className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                    aria-label="Previous week"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-2 text-xs font-medium text-foreground">
                    {fmtWeekLabel(weekDate)}
                  </span>
                  <button
                    onClick={() => setWeekOffset((w) => w + 1)}
                    className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                    aria-label="Next week"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="relative hidden sm:block">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search"
                    className="h-9 w-44 rounded-full border border-border bg-background pl-7 pr-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-[#5B7FFF]/20"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddOpen(true)}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" /> Add person
                </Button>
              </div>
            </div>

            <ul className="divide-y divide-border">
              {filtered.map((m) => (
                <MemberRow
                  key={m.email}
                  member={m}
                  expanded={expanded === m.email}
                  onToggle={() => setExpanded(expanded === m.email ? null : m.email)}
                  onCadenceChange={(cadence, custom) =>
                    updateMut.mutate({
                      email: m.email,
                      patch: { cadence, custom_cadence_days: custom },
                    })
                  }
                  onRemove={() => setRemoveTarget(m)}
                  onSchedule={() => goSchedule(m.email)}
                />
              ))}
              {filtered.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No members match your search.
                </li>
              )}
            </ul>

            {/* Re-scan footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground">
              <span>
                {managerApi.lastScanAt()
                  ? `Last scan: ${new Date(managerApi.lastScanAt()!).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                  : "Calendar has not been scanned yet."}
              </span>
              <button
                onClick={() => detectMut.mutate()}
                disabled={detectMut.isPending}
                className="inline-flex items-center gap-1.5 text-[#5B7FFF] hover:underline disabled:opacity-60"
              >
                {detectMut.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Re-scan calendar for team members
              </button>
            </div>
          </section>
        )}

        {/* Page-level analytics */}
        {team.length > 0 && (
          <section className="mt-6 rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Team summary</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="Team avg focus this week"
                value={fmtMin(teamStats.avgFocusMin)}
                color="#5B7FFF"
              />
              <Stat
                label="Members with declining focus (2 weeks)"
                value={String(teamStats.declining)}
                color={teamStats.declining > 0 ? "#EF4444" : "#6B7366"}
              />
              <Stat
                label="Members with overdue 1:1s"
                value={String(teamStats.overdueCount)}
                color={teamStats.overdueCount > 0 ? "#E9B949" : "#6B7366"}
              />
            </div>
          </section>
        )}
      </main>

      <AddPersonDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => qc.invalidateQueries({ queryKey: ["manager-team"] })}
      />

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.display_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will be removed from your team list. Their 1:1 history stays in your calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeTarget) {
                  removeMut.mutate(removeTarget.email);
                  setRemoveTarget(null);
                }
              }}
              className="bg-[#EF4444] text-white hover:bg-[#EF4444]/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- Detection prompt ----------

function DetectionPrompt({
  isDetecting,
  onScan,
  onAddManually,
}: {
  isDetecting: boolean;
  onScan: () => void;
  onAddManually: () => void;
}) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#9B7AE0]/10 text-[#9B7AE0]">
        <Users className="h-6 w-6" />
      </div>
      <h3 className="font-serif text-lg text-foreground">No team members yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Paceday will auto-detect your team from recurring 1:1s. Trigger a scan or add people manually.
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button
          onClick={onScan}
          disabled={isDetecting}
          className="bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90"
        >
          {isDetecting ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Scanning your calendar for recurring 1:1s…
            </>
          ) : (
            "Scan calendar now"
          )}
        </Button>
        <Button variant="outline" onClick={onAddManually}>
          Add manually
        </Button>
      </div>
    </div>
  );
}

// ---------- Gaps ----------

function GapsSection({
  gaps,
  onSchedule,
}: {
  gaps: Array<ReturnType<typeof managerApi.gaps>[number]>;
  onSchedule: (email: string) => void;
}) {
  const overdue = gaps.filter((g) => g.days_overdue > 0);
  const [open, setOpen] = useState(overdue.length > 0);

  if (gaps.length === 0) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#5FC9A6]/30 bg-[#5FC9A6]/5 px-4 py-3 text-sm text-[#2F8B70]">
        <CheckCircle2 className="h-4 w-4" />
        All 1:1s on track
      </div>
    );
  }

  return (
    <section
      className={
        "mb-4 overflow-hidden rounded-xl border " +
        (overdue.length > 0
          ? "border-[#E9B949]/40 bg-[#E9B949]/8"
          : "border-border bg-card")
      }
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <AlertTriangle className="h-4 w-4 text-[#8A6A14]" />
          Upcoming 1:1 gaps
          <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] text-foreground">
            {gaps.length}
          </span>
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <ul className="divide-y divide-border bg-card/60">
          {gaps.map((g) => (
            <li key={g.email} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                {initials(g.display_name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {g.display_name}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  Last 1:1: {g.last_one_on_one ? fmtDateShort(g.last_one_on_one) : "no 1:1 recorded"}
                </div>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
                {cadenceLabel(g.cadence)}
              </span>
              <span
                className={
                  "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                  (g.days_overdue > 0
                    ? "bg-[#EF4444]/12 text-[#B91C1C]"
                    : g.days_overdue >= -7
                      ? "bg-[#E9B949]/15 text-[#8A6A14]"
                      : "bg-[#5FC9A6]/15 text-[#2F8B70]")
                }
              >
                {g.days_overdue > 0
                  ? `${g.days_overdue}d overdue`
                  : g.days_overdue === 0
                    ? "Due today"
                    : g.days_overdue >= -7
                      ? "Due this week"
                      : "On track"}
              </span>
              <Button
                size="sm"
                onClick={() => onSchedule(g.email)}
                className="bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90"
              >
                Schedule
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Member row + analytics ----------

function MemberRow({
  member,
  expanded,
  onToggle,
  onCadenceChange,
  onRemove,
  onSchedule,
}: {
  member: TeamMember;
  expanded: boolean;
  onToggle: () => void;
  onCadenceChange: (c: Cadence, custom?: number) => void;
  onRemove: () => void;
  onSchedule: () => void;
}) {
  const overdue = computeDaysOverdue(member);
  const status = (() => {
    if (overdue == null) return { kind: "none" as const, label: "No cadence set" };
    if (overdue > 0) return { kind: "over" as const, label: "Overdue" };
    if (overdue >= -7) return { kind: "due" as const, label: "Due soon" };
    return { kind: "ok" as const, label: "On track" };
  })();

  // Mock focus number for "this week" — derived from analytics
  const analytics = useMemo(() => managerApi.analytics(member.email), [member]);
  const lastWeek = analytics?.weeks[analytics.weeks.length - 1];
  const prevWeek = analytics?.weeks[analytics.weeks.length - 2];
  const focusMin = lastWeek?.focus_minutes ?? 0;
  const trendPct =
    prevWeek && prevWeek.focus_minutes > 0
      ? Math.round(((focusMin - prevWeek.focus_minutes) / prevWeek.focus_minutes) * 100)
      : 0;

  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        {/* Left */}
        <div className="flex min-w-0 items-center gap-3 md:w-[30%]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
            {initials(member.display_name)}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-foreground">
                {member.display_name}
              </span>
              {member.is_paceday_user && (
                <span className="rounded bg-[#5B7FFF]/12 px-1.5 py-0.5 text-[9px] font-semibold text-[#5B7FFF]">
                  On Paceday
                </span>
              )}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">{member.email}</div>
            <div className="mt-0.5">
              <span
                className={
                  "inline-block rounded px-1.5 py-0.5 text-[9px] font-medium " +
                  (member.source === "auto"
                    ? "bg-muted text-muted-foreground"
                    : "border border-[#5B7FFF]/40 text-[#5B7FFF]")
                }
              >
                {member.source === "auto" ? "Auto-detected" : "Added manually"}
              </span>
            </div>
          </div>
        </div>

        {/* Middle */}
        <div className="flex min-w-0 flex-col gap-1.5 md:w-[35%]">
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-muted-foreground">1:1 cadence:</label>
            <select
              value={member.cadence}
              onChange={(e) => onCadenceChange(e.target.value as Cadence, member.custom_cadence_days)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-[#5B7FFF]/20"
            >
              {CADENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {member.cadence === "custom" && (
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  value={member.custom_cadence_days ?? 7}
                  onChange={(e) => onCadenceChange("custom", Number(e.target.value))}
                  className="h-8 w-14 rounded-md border border-input bg-background px-2 text-xs"
                />
                <span className="text-[11px] text-muted-foreground">days</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-muted-foreground">
              Last 1:1: {member.last_one_on_one ? fmtDateShort(member.last_one_on_one) : "no 1:1 recorded"}
            </span>
            <span
              className={
                "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                (status.kind === "over"
                  ? "bg-[#EF4444]/12 text-[#B91C1C]"
                  : status.kind === "due"
                    ? "bg-[#E9B949]/15 text-[#8A6A14]"
                    : status.kind === "ok"
                      ? "bg-[#5FC9A6]/15 text-[#2F8B70]"
                      : "bg-muted text-muted-foreground")
              }
            >
              {status.label}
            </span>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center justify-between gap-3 md:w-[35%] md:justify-end">
          <div className="text-right">
            {member.data_available ? (
              <>
                <div className="flex items-baseline justify-end gap-1.5">
                  <span className="text-2xl font-semibold text-[#5B7FFF]">{fmtMin(focusMin)}</span>
                  <TrendArrow pct={trendPct} />
                </div>
                <div className="text-[10px] text-muted-foreground">focus this week</div>
                {!member.is_paceday_user && (
                  <div className="text-[10px] italic text-muted-foreground">
                    Estimated from calendar availability
                  </div>
                )}
              </>
            ) : (
              <div
                className="text-xs text-muted-foreground"
                title="This person is not in the same org calendar"
              >
                Data unavailable
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onSchedule}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Schedule 1:1"
            >
              <CalendarDays className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onRemove}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onToggle}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {expanded && analytics && <AnalyticsPanel member={member} />}
    </li>
  );
}

function TrendArrow({ pct }: { pct: number }) {
  if (pct > 5)
    return (
      <span className="inline-flex items-center text-[11px] font-medium text-[#22C55E]">
        <ArrowUpRight className="h-3.5 w-3.5" />
        {pct}%
      </span>
    );
  if (pct < -5)
    return (
      <span className="inline-flex items-center text-[11px] font-medium text-[#EF4444]">
        <ArrowDownRight className="h-3.5 w-3.5" />
        {pct}%
      </span>
    );
  return (
    <span className="inline-flex items-center text-[11px] text-muted-foreground">
      <Minus className="h-3 w-3" />
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tracking-tight" style={{ color }}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// ---------- Analytics panel (expanded) ----------

function AnalyticsPanel({ member }: { member: TeamMember }) {
  const [tab, setTab] = useState<"focus" | "history">("focus");
  const data = useMemo(() => managerApi.analytics(member.email), [member]);
  if (!data) return null;

  const maxMin = Math.max(...data.weeks.map((w) => w.meeting_minutes + w.focus_minutes + w.free_minutes), 1);

  const lastMonth = data.weeks.slice(-4);
  const prevMonth = data.weeks.slice(-8, -4);
  const sumFocus = (a: typeof data.weeks) => a.reduce((s, w) => s + w.focus_minutes, 0);
  const sumMtg = (a: typeof data.weeks) => a.reduce((s, w) => s + w.meeting_minutes, 0);
  const focusDelta = sumFocus(lastMonth) - sumFocus(prevMonth);

  return (
    <div className="mt-4 rounded-xl border border-border bg-background/60 p-4">
      <div className="mb-3 flex items-center gap-1 border-b border-border">
        {(["focus", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "border-b-2 px-3 py-1.5 text-xs font-medium transition " +
              (tab === t
                ? "border-[#5B7FFF] text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {t === "focus" ? "Focus time" : "1:1 history"}
          </button>
        ))}
      </div>

      {tab === "focus" ? (
        <>
          {!data.is_paceday_user && (
            <p className="mb-2 text-[11px] italic text-muted-foreground">
              Meeting time estimated; focus vs free time not available for non-Paceday users.
            </p>
          )}
          <div className="flex h-32 items-end gap-1.5">
            {data.weeks.map((w) => {
              const totalH = (w.meeting_minutes + w.focus_minutes + w.free_minutes) / maxMin;
              const mtgH = w.meeting_minutes / maxMin;
              const focH = w.focus_minutes / maxMin;
              const freH = w.free_minutes / maxMin;
              return (
                <div
                  key={w.week_start}
                  className="group relative flex flex-1 flex-col-reverse"
                  title={`Week of ${fmtDateShort(w.week_start)} — Focus: ${fmtMin(w.focus_minutes)}, Meetings: ${fmtMin(w.meeting_minutes)}`}
                  style={{ height: `${totalH * 100}%` }}
                >
                  <div style={{ height: `${(mtgH / totalH) * 100}%`, backgroundColor: "#E9B949" }} />
                  <div style={{ height: `${(focH / totalH) * 100}%`, backgroundColor: "#5B7FFF" }} />
                  <div style={{ height: `${(freH / totalH) * 100}%`, backgroundColor: "#EDEEE9" }} />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{fmtDateShort(data.weeks[0]?.week_start)}</span>
            <div className="flex items-center gap-3">
              <Legend color="#5B7FFF" label="Focus" />
              <Legend color="#E9B949" label="Meetings" />
              <Legend color="#EDEEE9" label="Free" />
            </div>
            <span>{fmtDateShort(data.weeks[data.weeks.length - 1]?.week_start)}</span>
          </div>
          <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-foreground">
            This month: {fmtMin(sumFocus(lastMonth))} focus, {fmtMin(sumMtg(lastMonth))} meetings ·{" "}
            <span className={focusDelta >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}>
              {focusDelta >= 0 ? "+" : ""}
              {fmtMin(Math.abs(focusDelta))} focus vs last month
            </span>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          {data.one_on_ones.length === 0 && (
            <p className="text-xs text-muted-foreground">No 1:1 history recorded in Paceday yet.</p>
          )}
          {data.one_on_ones.map((o, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-xs"
            >
              <span className="text-foreground">{o.title}</span>
              <span className="text-muted-foreground">{fmtDateShort(o.date)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

// ---------- Add person modal ----------

function AddPersonDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<Cadence>("biweekly");
  const [customDays, setCustomDays] = useState(14);
  const [note, setNote] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setName("");
    setCadence("biweekly");
    setCustomDays(14);
    setNote(null);
  };

  const submit = async () => {
    if (!email.trim() || !/.+@.+\..+/.test(email)) {
      toast.error("Please enter a valid email");
      return;
    }
    const { alreadyAuto } = await managerApi.remote.addMember({
      email: email.trim(),
      display_name: name.trim() || undefined,
      cadence,
      custom_cadence_days: cadence === "custom" ? customDays : undefined,
    });
    if (alreadyAuto) {
      setNote(
        "This person is already in your team (auto-detected). Settings have been updated.",
      );
      onAdded();
      return;
    }
    toast.success(`${name || email} added to your team.`);
    onAdded();
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Add a team member</DialogTitle>
          <DialogDescription>
            Add someone you have recurring 1:1s with. We will track their cadence and focus trends.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-foreground">
            Email <span className="text-[#EF4444]">*</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls + " mt-1"}
              placeholder="alex@team.com"
            />
          </label>
          <label className="block text-xs font-medium text-foreground">
            Display name <span className="text-muted-foreground">(optional)</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls + " mt-1"}
              placeholder="Alex Carter"
            />
          </label>
          <label className="block text-xs font-medium text-foreground">
            1:1 cadence
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as Cadence)}
              className={inputCls + " mt-1"}
            >
              {CADENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {cadence === "custom" && (
            <label className="block text-xs font-medium text-foreground">
              Every (days)
              <input
                type="number"
                min={1}
                value={customDays}
                onChange={(e) => setCustomDays(Number(e.target.value))}
                className={inputCls + " mt-1"}
              />
            </label>
          )}
          {note && (
            <div className="rounded-lg bg-[#E9B949]/10 px-3 py-2 text-xs text-[#8A6A14]">
              {note}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} className="bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90">
            Add to team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
