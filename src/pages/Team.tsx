import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  ChevronsUpDown,
  Mail,
  UserPlus,
  Shield,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/hooks/useToast";
import {
  managerApi,
  managerKeys,
  cadenceLabel,
  computeDaysOverdue,
  validateMemberInput,
  type Cadence,
  type MemberAnalytics,
  type OneOnOneGap,
  type TeamMember,
} from "@/api/manager";
import { teamsApi, validateTeamName } from "@/api/teams";
import { apiErrorMessage } from "@/api/client";
import { ProtectedHoursTab } from "@/components/team/ProtectedHoursTab";
import { FindATimeTab } from "@/components/team/FindATimeTab";
import { AnalyticsTab } from "@/components/team/AnalyticsTab";

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-[#5B7FFF] focus:outline-none focus:ring-2 focus:ring-[#5B7FFF]/20";

const CADENCE_OPTIONS: Array<{ value: Cadence; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" },
  { value: "none", label: "None" },
];

type TabKey = "team" | "protected" | "find" | "analytics";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "team", label: "Team" },
  { key: "protected", label: "Protected hours" },
  { key: "find", label: "Find a time" },
  { key: "analytics", label: "Analytics" },
];

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
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
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ============================================================================
// Page
// ============================================================================

export default function Team() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [profile, setProfile] = useState(() => managerApi.getProfile());

  const tab = (params.get("tab") as TabKey) || "team";
  const setTab = (t: TabKey) => {
    const np = new URLSearchParams(params);
    np.set("tab", t);
    setParams(np, { replace: true });
  };

  // Formal teams
  // Formal teams — every team the user belongs to stays visible; a failed
  // refetch keeps the cached list and surfaces a retryable error.
  const teamsQ = useQuery({
    queryKey: ["formal-teams"],
    queryFn: () => teamsApi.remote.list(),
    placeholderData: (prev) => prev,
  });
  const teams = useMemo(() => teamsQ.data ?? [], [teamsQ.data]);
  const [activeTeamId, setActiveTeamIdState] = useState<string | null>(() => teamsApi.activeTeamId());
  useEffect(() => {
    if (activeTeamId && teams.some((t) => t.id === activeTeamId)) return;
    const id = teamsApi.activeTeamId();
    setActiveTeamIdState(id ?? teams[0]?.id ?? null);
  }, [teams, activeTeamId]);

  const activeTeam = activeTeamId ? teams.find((t) => t.id === activeTeamId) ?? null : null;
  const switchTeam = (id: string) => {
    // Switching only changes the active team; the full list is untouched.
    teamsApi.setActiveTeam(id);
    setActiveTeamIdState(id);
  };
  const teamsError = teamsQ.error;


  const [createTeamOpen, setCreateTeamOpen] = useState(false);

  // Render manager-mode-off state on Tab 1 only
  if (!profile.is_manager && tab === "team") {
    return (
      <div className="min-h-screen bg-[#F7F8F4]">
        <Navbar />
        <PageHeader
          tab={tab}
          setTab={setTab}
          teams={teams}
          activeTeam={activeTeam}
          onSwitchTeam={switchTeam}
          onCreateTeam={() => setCreateTeamOpen(true)}
        />
        <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#9B7AE0]/10 text-[#9B7AE0]">
              <Users className="h-6 w-6" />
            </div>
            <h1 className="font-serif text-2xl tracking-tight text-foreground">
              Manager mode is off
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Enable Manager mode to track 1:1 cadence and per-member focus.
              You can still use Protected Hours, Find a Time, and Analytics with a Paceday team.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Button
                onClick={() => {
                  void managerApi.remote.setProfile({ is_manager: true, onboarding_profile_selected: true });
                  setProfile(managerApi.getProfile());
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
        <CreateTeamDialog
          open={createTeamOpen}
          onOpenChange={setCreateTeamOpen}
          onCreated={(t) => {
            qc.invalidateQueries({ queryKey: ["formal-teams"] });
            setActiveTeamIdState(t.id);
            setTab("protected");
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8F4]">
      <Navbar />
      <PageHeader
        tab={tab}
        setTab={setTab}
        teams={teams}
        activeTeam={activeTeam}
        onSwitchTeam={switchTeam}
        onCreateTeam={() => setCreateTeamOpen(true)}
      />

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {tab === "team" && (
          <TeamTab
            onCreateTeam={() => setCreateTeamOpen(true)}
            activeTeam={activeTeam}
          />
        )}
        {tab === "protected" && (
          <RequireFormalTeam team={activeTeam} onCreateTeam={() => setCreateTeamOpen(true)}>
            {(t) => <ProtectedHoursTab team={t} onChanged={() => qc.invalidateQueries({ queryKey: ["formal-teams"] })} />}
          </RequireFormalTeam>
        )}
        {tab === "find" && (
          <RequireFormalTeam team={activeTeam} onCreateTeam={() => setCreateTeamOpen(true)}>
            {(t) => <FindATimeTab team={t} />}
          </RequireFormalTeam>
        )}
        {tab === "analytics" && (
          <AnalyticsTab activeTeam={activeTeam} onCreateTeam={() => setCreateTeamOpen(true)} />
        )}
      </main>

      <CreateTeamDialog
        open={createTeamOpen}
        onOpenChange={setCreateTeamOpen}
        onCreated={(t) => {
          qc.invalidateQueries({ queryKey: ["formal-teams"] });
          setActiveTeamIdState(t.id);
          setTab("protected");
        }}
      />
    </div>
  );
}

function ErrorBanner({ message, onRetry, busy }: { message: string; onRetry: () => void; busy?: boolean }) {
  return (
    <div className="mb-4 flex flex-wrap items-start gap-3 rounded-xl border border-[#E35D5D]/40 bg-[#E35D5D]/8 px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B91C1C]" />
      <p className="min-w-0 flex-1 text-sm text-foreground">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry} disabled={busy} className="gap-1.5">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Retry
      </Button>
    </div>
  );
}

// ============================================================================
// Header + Tab bar
// ============================================================================

function PageHeader({
  tab,
  setTab,
  teams,
  activeTeam,
  onSwitchTeam,
  onCreateTeam,
}: {
  tab: TabKey;
  setTab: (t: TabKey) => void;
  teams: ReturnType<typeof teamsApi.list>;
  activeTeam: ReturnType<typeof teamsApi.list>[number] | null;
  onSwitchTeam: (id: string) => void;
  onCreateTeam: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border bg-[#F7F8F4]">
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6 sm:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-3xl tracking-tight text-foreground">My Team</h1>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted">
                <span className="font-medium">
                  {activeTeam ? activeTeam.name : "No team selected"}
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-1">
              {teams.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No Paceday teams yet.
                </div>
              )}
              {teams.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onSwitchTeam(t.id);
                    setOpen(false);
                  }}
                  className={
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted " +
                    (t.id === activeTeam?.id ? "bg-muted/60 text-foreground" : "text-foreground")
                  }
                >
                  <span className="truncate">{t.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {t.members.filter((m) => m.status === "active").length} active
                  </span>
                </button>
              ))}
              <div className="my-1 border-t border-border" />
              <button
                onClick={() => {
                  setOpen(false);
                  onCreateTeam();
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[#5B7FFF] hover:bg-[#5B7FFF]/10"
              >
                <Plus className="h-3.5 w-3.5" />
                New team
              </button>
            </PopoverContent>
          </Popover>
        </div>

        {/* Tab bar */}
        <div className="mt-4 -mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition " +
                (tab === t.key
                  ? "border-[#5B7FFF] text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RequireFormalTeam({
  team,
  onCreateTeam,
  children,
}: {
  team: ReturnType<typeof teamsApi.list>[number] | null;
  onCreateTeam: () => void;
  children: (t: NonNullable<typeof team>) => ReactElement;
}) {
  if (!team) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#9B7AE0]/10 text-[#9B7AE0]">
          <Users className="h-6 w-6" />
        </div>
        <h3 className="font-serif text-lg text-foreground">Create a team to access this feature</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Paceday teams unlock Protected Hours, Find a Time, and team-wide analytics.
        </p>
        <Button
          onClick={onCreateTeam}
          className="mt-5 bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90"
        >
          Create team
        </Button>
      </div>
    );
  }
  return children(team);
}

// ============================================================================
// Tab 1 — Team (T-44 content)
// ============================================================================

function TeamTab({
  onCreateTeam,
  activeTeam,
}: {
  onCreateTeam: () => void;
  activeTeam: ReturnType<typeof teamsApi.list>[number] | null;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [weekOffset, setWeekOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [autoBannerDismissed, setAutoBannerDismissed] = useState(false);

  const teamQ = useQuery({
    queryKey: managerKeys.team,
    queryFn: () => managerApi.remote.listTeam(),
    placeholderData: (prev) => prev,
  });
  const team = useMemo(() => teamQ.data ?? [], [teamQ.data]);

  const week = useMemo(() => weekStart(weekOffset).toISOString().slice(0, 10), [weekOffset]);

  const gapsQ = useQuery({
    queryKey: managerKeys.gaps,
    queryFn: () => managerApi.remote.gaps(),
    placeholderData: (prev) => prev,
  });

  const analyticsQ = useQuery({
    queryKey: managerKeys.analytics(week),
    queryFn: () => managerApi.remote.analytics(week),
    placeholderData: (prev) => prev,
  });
  const analyticsByEmail = useMemo(() => {
    const map = new Map<string, MemberAnalytics>();
    for (const a of analyticsQ.data ?? []) map.set(a.email.toLowerCase(), a);
    return map;
  }, [analyticsQ.data]);

  const scheduleMut = useMutation({
    mutationFn: (email: string) => managerApi.remote.schedulePrefillUrl(email),
    onSuccess: (url) => {
      if (/^https?:\/\//i.test(url)) window.location.assign(url);
      else navigate(url);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const detectMut = useMutation({
    mutationFn: () => managerApi.remote.detect(),
    onError: (e) => toast.error(apiErrorMessage(e)),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: managerKeys.team });
      qc.invalidateQueries({ queryKey: managerKeys.gaps });
      toast.success(r.added > 0 ? `${r.added} new team member${r.added === 1 ? "" : "s"} found.` : "No new members found.");
    },
  });

  const removeMut = useMutation({
    mutationFn: (email: string) => managerApi.remote.removeMember(email),
    onError: (e) => toast.error(apiErrorMessage(e)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: managerKeys.team });
      qc.invalidateQueries({ queryKey: managerKeys.gaps });
    },
  });

  const updateMut = useMutation({
    mutationFn: (input: { email: string; patch: Partial<TeamMember> }) =>
      managerApi.remote.updateMember(input.email, input.patch),
    onError: (e) => toast.error(apiErrorMessage(e)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: managerKeys.team });
      qc.invalidateQueries({ queryKey: managerKeys.gaps });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return team;
    return team.filter((m) => m.display_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  }, [team, search]);

  const allAuto = team.length > 0 && team.every((m) => m.source === "auto");

  const goSchedule = (email: string) => scheduleMut.mutate(email);

  return (
    <>
      {teamQ.isError && (
        <ErrorBanner
          message={apiErrorMessage(teamQ.error)}
          onRetry={() => teamQ.refetch()}
          busy={teamQ.isFetching}
        />
      )}

      {teamQ.isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      )}

      {!teamQ.isLoading && team.length === 0 && (
        <DetectionPrompt
          isDetecting={detectMut.isPending}
          onScan={() => detectMut.mutate()}
          onAddManually={() => setAddOpen(true)}
        />
      )}

      {team.length > 0 && allAuto && !autoBannerDismissed && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#5FC9A6]/40 bg-[#5FC9A6]/10 px-4 py-3 text-sm text-foreground">
          <Info className="mt-0.5 h-4 w-4 text-[#2F8B70]" />
          <p className="flex-1">Team auto-detected from your recurring 1:1s. You can add or remove people below.</p>
          <button onClick={() => setAutoBannerDismissed(true)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {team.length > 0 && (
        <GapsSection
          gaps={gapsQ.data ?? []}
          isLoading={gapsQ.isLoading}
          error={gapsQ.isError ? apiErrorMessage(gapsQ.error) : null}
          onRetry={() => gapsQ.refetch()}
          busy={gapsQ.isFetching}
          schedulingEmail={scheduleMut.isPending ? (scheduleMut.variables as string) : null}
          onSchedule={goSchedule}
        />
      )}

      {team.length > 0 && (
        <section className="mt-6 rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-foreground">Your team</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{team.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-1 rounded-full border border-border bg-background px-1 py-1 sm:flex">
                <button onClick={() => setWeekOffset((w) => w - 1)} className="rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Previous week">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 text-xs font-medium text-foreground">
                  Week of {fmtDateShort(weekStart(weekOffset).toISOString())}
                </span>
                <button onClick={() => setWeekOffset((w) => w + 1)} className="rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Next week">
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
              <Button variant="outline" size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add person
              </Button>
            </div>
          </div>

          <ul className="divide-y divide-border">
            {filtered.map((m) => (
              <MemberRow
                key={m.email}
                member={m}
                analytics={analyticsByEmail.get(m.email.toLowerCase()) ?? null}
                analyticsLoading={analyticsQ.isLoading}
                expanded={expanded === m.email}
                onToggle={() => setExpanded(expanded === m.email ? null : m.email)}
                onCadenceChange={(cadence, custom) =>
                  updateMut.mutate({ email: m.email, patch: { cadence, custom_cadence_days: custom } })
                }
                onRemove={() => setRemoveTarget(m)}
                onSchedule={() => goSchedule(m.email)}
              />
            ))}
            {filtered.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-muted-foreground">No members match your search.</li>
            )}
          </ul>

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
              {detectMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Re-scan calendar for team members
            </button>
          </div>
        </section>
      )}

      {/* Sync with a Paceday team callout */}
      <section className="mt-6 rounded-2xl border border-dashed border-border bg-card/60 p-5">
        {activeTeam ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Also a member of {activeTeam.name}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                View team coordination in Protected Hours, Find a Time, and Analytics.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                const np = new URLSearchParams();
                np.set("tab", "protected");
                navigate(`/app/team?${np.toString()}`);
              }}
            >
              Open team coordination
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Sync with a Paceday team
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Create a team with Paceday users to set protected hours and find meeting times.
              </p>
            </div>
            <Button onClick={onCreateTeam} className="bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90">
              Create team
            </Button>
          </div>
        )}
      </section>

      <AddPersonDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => {
          qc.invalidateQueries({ queryKey: managerKeys.team });
          qc.invalidateQueries({ queryKey: managerKeys.gaps });
        }}
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
    </>
  );
}

function weekStart(offset: number) {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ============================================================================
// Sub-components: detection, gaps, member row, analytics panel
// ============================================================================

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
        <Button onClick={onScan} disabled={isDetecting} className="bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90">
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

function GapsSection({
  gaps,
  isLoading,
  error,
  onRetry,
  busy,
  schedulingEmail,
  onSchedule,
}: {
  gaps: OneOnOneGap[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  busy: boolean;
  schedulingEmail: string | null;
  onSchedule: (email: string) => void;
}) {
  const overdue = gaps.filter((g) => g.days_overdue > 0);
  const [open, setOpen] = useState(overdue.length > 0);

  if (error && gaps.length === 0) {
    return <ErrorBanner message={error} onRetry={onRetry} busy={busy} />;
  }

  if (isLoading && gaps.length === 0) {
    return <div className="mb-4 h-14 animate-pulse rounded-xl border border-border bg-card" />;
  }

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
        (overdue.length > 0 ? "border-[#E9B949]/40 bg-[#E9B949]/8" : "border-border bg-card")
      }
    >
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <AlertTriangle className="h-4 w-4 text-[#8A6A14]" />
          Upcoming 1:1 gaps
          <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] text-foreground">{gaps.length}</span>
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
                <div className="truncate text-sm font-medium text-foreground">{g.display_name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  Last 1:1: {g.last_one_on_one ? fmtDateShort(g.last_one_on_one) : "no 1:1 recorded"}
                </div>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">{cadenceLabel(g.cadence)}</span>
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
                disabled={schedulingEmail === g.email}
                className="bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90"
              >
                {schedulingEmail === g.email ? "Opening…" : "Schedule"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MemberRow({
  member,
  analytics,
  analyticsLoading,
  expanded,
  onToggle,
  onCadenceChange,
  onRemove,
  onSchedule,
}: {
  member: TeamMember;
  analytics: MemberAnalytics | null;
  analyticsLoading: boolean;
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
        <div className="flex min-w-0 items-center gap-3 md:w-[30%]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
            {initials(member.display_name)}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-foreground">{member.display_name}</span>
              {member.is_paceday_user && (
                <span className="rounded bg-[#5B7FFF]/12 px-1.5 py-0.5 text-[9px] font-semibold text-[#5B7FFF]">On Paceday</span>
              )}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">{member.email}</div>
            <div className="mt-0.5">
              <span
                className={
                  "inline-block rounded px-1.5 py-0.5 text-[9px] font-medium " +
                  (member.source === "auto" ? "bg-muted text-muted-foreground" : "border border-[#5B7FFF]/40 text-[#5B7FFF]")
                }
              >
                {member.source === "auto" ? "Auto-detected" : "Added manually"}
              </span>
            </div>
          </div>
        </div>

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

        <div className="flex items-center justify-between gap-3 md:w-[35%] md:justify-end">
          <div className="text-right">
            {analyticsLoading && !analytics ? (
              <div className="h-7 w-20 animate-pulse rounded bg-muted" />
            ) : member.data_available && analytics ? (
              <>
                <div className="flex items-baseline justify-end gap-1.5">
                  <span className="text-2xl font-semibold text-[#5B7FFF]">{fmtMin(focusMin)}</span>
                  <TrendArrow pct={trendPct} />
                </div>
                <div className="text-[10px] text-muted-foreground">focus this week</div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground">Data unavailable</div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button onClick={onSchedule} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Schedule 1:1">
              <CalendarDays className="h-3.5 w-3.5" />
            </button>
            <button onClick={onRemove} className="rounded-full p-1.5 text-muted-foreground hover:bg-[#EF4444]/10 hover:text-[#EF4444]" title="Remove">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={onToggle} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={expanded ? "Collapse" : "Expand"}>
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {expanded && analytics && <InlineAnalytics data={analytics} />}
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

function InlineAnalytics({ data }: { data: MemberAnalytics }) {
  if (data.weeks.length === 0) return null;
  const maxMin = Math.max(...data.weeks.map((w) => w.meeting_minutes + w.focus_minutes + w.free_minutes), 1);

  return (
    <div className="mt-4 rounded-xl border border-border bg-background/60 p-4">
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
    </div>
  );
}

// ============================================================================
// Add member + Create team dialogs
// ============================================================================

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
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setName("");
    setCadence("biweekly");
    setCustomDays(14);
    setNote(null);
    setError(null);
  };

  const addMut = useMutation({
    mutationFn: () =>
      managerApi.remote.addMember({
        email: email.trim(),
        display_name: name.trim() || undefined,
        cadence,
        custom_cadence_days: cadence === "custom" ? customDays : undefined,
      }),
    // Form values are intentionally preserved on error.
    onError: (e) => setError(apiErrorMessage(e)),
    onSuccess: ({ alreadyAuto }) => {
      onAdded();
      if (alreadyAuto) {
        setNote("This person is already in your team (auto-detected). Settings have been updated.");
        return;
      }
      toast.success(`${name || email} added to your team.`);
      reset();
      onOpenChange(false);
    },
  });

  const submit = () => {
    const invalid = validateMemberInput({
      email,
      cadence,
      custom_cadence_days: cadence === "custom" ? customDays : undefined,
    });
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    addMut.mutate();
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
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls + " mt-1"} placeholder="alex@team.com" />
          </label>
          <label className="block text-xs font-medium text-foreground">
            Display name <span className="text-muted-foreground">(optional)</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls + " mt-1"} placeholder="Alex Carter" />
          </label>
          <label className="block text-xs font-medium text-foreground">
            1:1 cadence
            <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)} className={inputCls + " mt-1"}>
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
              <input type="number" min={1} value={customDays} onChange={(e) => setCustomDays(Number(e.target.value))} className={inputCls + " mt-1"} />
            </label>
          )}
          {note && <div className="rounded-lg bg-[#E9B949]/10 px-3 py-2 text-xs text-[#8A6A14]">{note}</div>}
          {error && (
            <div className="rounded-lg bg-[#E35D5D]/10 px-3 py-2 text-xs text-[#B91C1C]" role="alert">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={addMut.isPending} className="bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90">
            {addMut.isPending ? "Adding…" : "Add to team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateTeamDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (t: ReturnType<typeof teamsApi.list>[number]) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => teamsApi.remote.createTeam(name),
    // Keep the typed name on error.
    onError: (e) => setError(apiErrorMessage(e)),
    onSuccess: (t) => {
      toast.success(`Team "${t.name}" created.`);
      setName("");
      setError(null);
      onOpenChange(false);
      onCreated(t);
    },
  });

  const submit = () => {
    const invalid = validateTeamName(name);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    createMut.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setName("");
          setError(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Create a Paceday team</DialogTitle>
          <DialogDescription>
            Coordinate protected hours, find meeting times, and see team analytics together.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-foreground">
            Team name <span className="text-[#EF4444]">*</span>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className={inputCls + " mt-1"}
              placeholder="Platform team"
            />
          </label>
          {error && (
            <div className="rounded-lg bg-[#E35D5D]/10 px-3 py-2 text-xs text-[#B91C1C]" role="alert">
              {error}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            You will be the team owner. Invite teammates after creation.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={createMut.isPending} className="bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90">
            {createMut.isPending ? "Creating…" : "Create team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
