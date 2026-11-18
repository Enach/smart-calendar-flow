import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  analyticsRowsWithoutOwner,
  teamOwnerEmails,
  teamsApi,
  teamKeys,
  type FormalTeam,
  type TeamAnalyticsRow,
} from "@/api/teams";
import { managerApi, managerKeys } from "@/api/manager";
import { localISODate, mondayOf } from "@/lib/localDate";
import { UI_LOCALE } from "@/lib/locale";
import { ApiErrorText } from "@/components/ApiErrorNotice";
import {
  ADDED_PERSON_LABEL,
  ANALYTICS_AVAILABILITY_ONLY,
  ANALYTICS_NO_DATA,
  ANALYTICS_WITHHELD,
  TEAM_ANALYTICS_ADDED_HINT,
} from "@/components/team/teamTexts";

interface Props {
  activeTeam: FormalTeam | null;
  onCreateTeam: () => void;
}

type SubTab = "week" | "trends" | "members";

const SUBTABS: Array<{ key: SubTab; label: string }> = [
  { key: "week", label: "This week" },
  { key: "trends", label: "Trends" },
  { key: "members", label: "Members" },
];

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function fmtWeek(weekStart: string): string {
  return new Date(`${weekStart}T12:00:00`).toLocaleDateString(UI_LOCALE, { month: "short", day: "numeric", year: "numeric" });
}

const todayISO = () => localISODate();

/** A row with figures the view can draw: a measured Paceday member. */
function isMeasuredPaceday(r: TeamAnalyticsRow): boolean {
  return r.kind === "paceday" && r.figures === "measured";
}

export function AnalyticsTab({ activeTeam, onCreateTeam }: Props) {
  const [sub, setSub] = useState<SubTab>("week");
  const [date, setDate] = useState(todayISO());

  const teamAnalyticsQ = useQuery({
    queryKey: teamKeys.analytics(activeTeam?.id ?? "none", date),
    queryFn: () => teamsApi.remote.teamAnalytics(activeTeam!.id, date),
    enabled: !!activeTeam,
    // Keep the previous week's data visible while a refetch is in flight.
    placeholderData: (prev) => prev,
  });
  const view = activeTeam ? teamAnalyticsQ.data ?? null : null;
  // Without a team there is no real data to show. Never substitute generated
  // numbers: a manager would read them as facts about a real person. The
  // rows are the server's, each matched by its own email (SF-053); the owner
  // is left out of the per-person view.
  const rows = useMemo(
    () => (view && activeTeam ? analyticsRowsWithoutOwner(view.rows, teamOwnerEmails(activeTeam)) : []),
    [view, activeTeam],
  );

  const sourceLabel = activeTeam ? activeTeam.name : "your manager team";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl tracking-tight text-foreground">Analytics</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          How {sourceLabel} is spending their time.
        </p>
      </div>

      {activeTeam && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium text-foreground">
            Week of
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="ml-2 h-9 rounded-lg border border-input bg-background px-3 text-sm"
            />
          </label>
          {view && (
            // The week the server measured: the week asked for (SF-053).
            <span className="text-xs text-muted-foreground" data-testid="team-analytics-week">
              Showing the week of {fmtWeek(view.week_start)}
            </span>
          )}
          {teamAnalyticsQ.isFetching && <span className="text-[11px] text-muted-foreground">Refreshing…</span>}
        </div>
      )}

      {activeTeam && teamAnalyticsQ.isError && (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/8 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-foreground" role="alert">
            <ApiErrorText error={teamAnalyticsQ.error} effect="read" />
          </p>
          <Button size="sm" variant="outline" onClick={() => teamAnalyticsQ.refetch()} disabled={teamAnalyticsQ.isFetching}>
            Retry
          </Button>
        </div>
      )}

      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-border">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={
              "border-b-2 px-3 py-2 text-sm font-medium transition " +
              (sub === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTeam && teamAnalyticsQ.isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      )}

      {rows.length === 0 && !(activeTeam && teamAnalyticsQ.isLoading) && !(activeTeam && teamAnalyticsQ.isError) && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Users className="h-5 w-5" />
          </div>
          <p className="text-sm text-muted-foreground">No team data yet.</p>
          {!activeTeam && (
            <Button onClick={onCreateTeam} className="mt-3 bg-primary text-white hover:bg-primary/90">
              Create team
            </Button>
          )}
        </div>
      )}

      {view && rows.length > 0 && sub === "week" && (
        <ThisWeek rows={rows} avgFocus={view.avg_focus_minutes} avgMeetings={view.avg_meeting_minutes} />
      )}
      {view && rows.length > 0 && sub === "trends" && <Trends rows={rows} />}
      {activeTeam && rows.length > 0 && sub === "members" && (
        <MembersPanel teamId={activeTeam.id} week={mondayOf(date)} members={rows} />
      )}
    </div>
  );
}

// ============================================================================
// This week
// ============================================================================

/** The text shown in place of a figure the server did not measure or withheld (contract §9.7). */
function missingFigure(r: TeamAnalyticsRow): string {
  return r.figures === "withheld" ? ANALYTICS_WITHHELD : ANALYTICS_NO_DATA;
}

function ThisWeek({ rows, avgFocus, avgMeetings }: { rows: TeamAnalyticsRow[]; avgFocus: number; avgMeetings: number }) {
  const measured = rows.filter(isMeasuredPaceday);
  const insights: string[] = [];
  for (const r of rows) {
    if (r.figures === "measured" && (r.meeting_minutes ?? 0) > 25 * 60) {
      insights.push(`${r.display_name} had over 25 hours in meetings this week.`);
    }
  }
  if (measured.length > 0) {
    const avgScore = Math.round(measured.reduce((n, r) => n + (r.focus_score ?? 0), 0) / measured.length);
    if (avgScore < 40) insights.push("The team is spending more time in meetings than focused work.");
    if (measured.every((r) => (r.focus_score ?? 0) >= 60)) insights.push("Great week — the whole team had solid focus time.");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Avg team focus" value={fmtMin(avgFocus)} color="#5B7FFF" />
        <Stat label="Avg team meetings" value={fmtMin(avgMeetings)} color="#E9B949" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-right font-medium">Meetings</th>
              <th className="px-4 py-2 text-right font-medium">Focus</th>
              <th className="px-4 py-2 text-right font-medium">Focus score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const measuredRow = r.figures === "measured";
              const score = r.focus_score;
              return (
                <tr key={r.email} className="border-t border-border" data-testid={`team-analytics-row-${r.email}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                        {initials(r.display_name)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-foreground">{r.display_name}</div>
                        {r.kind === "added" && (
                          <div className="text-[10px] text-muted-foreground">
                            {ADDED_PERSON_LABEL}
                            {measuredRow && ` · ${ANALYTICS_AVAILABILITY_ONLY}`}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  {measuredRow ? (
                    <>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{fmtMin(r.meeting_minutes ?? 0)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                        {r.focus_minutes !== null ? fmtMin(r.focus_minutes) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {score !== null ? (
                          <span
                            className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{
                              color: score >= 60 ? "#15803D" : score >= 40 ? "#8A6A14" : "#B91C1C",
                              backgroundColor: score >= 60 ? "#22C55E20" : score >= 40 ? "#E9B94920" : "#EF444420",
                            }}
                          >
                            {score}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </>
                  ) : (
                    <td colSpan={3} className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                      {missingFigure(r)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {insights.length > 0 && (
        <div className="space-y-2">
          {insights.map((line, i) => (
            <div key={i} className="rounded-xl border border-border bg-primary/5 px-4 py-3 text-sm text-foreground">
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      {/* The colour is a key to the charts, not text: yellow and blue figures
          were unreadable (as low as 1.9:1), so the number stays in ink. */}
      <div className="text-2xl font-semibold tracking-tight text-foreground">{value}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
        {label}
      </div>
    </div>
  );
}

// ============================================================================
// Trends — the week's measured figures side by side. The formal analytics
// answer one week, so nothing here is extrapolated across weeks.
// ============================================================================

function Trends({ rows }: { rows: TeamAnalyticsRow[] }) {
  const [metric, setMetric] = useState<"focus" | "meetings">("focus");
  const palette = ["#5B7FFF", "#E9B949", "#9B7AE0", "#5FC9A6", "#EF4444", "#0EA5E9", "#F97316", "#6366F1"];
  const valueOf = (r: TeamAnalyticsRow) => (metric === "focus" ? r.focus_minutes : r.meeting_minutes);
  const drawn = rows.filter((r) => r.figures === "measured" && valueOf(r) !== null);
  const maxVal = Math.max(1, ...drawn.map((r) => valueOf(r) ?? 0));

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-border bg-card p-1 text-xs">
        {(["focus", "meetings"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={
              "rounded-md px-3 py-1.5 font-medium transition " +
              (metric === m ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground")
            }
          >
            {m === "focus" ? "Focus" : "Meetings"}
          </button>
        ))}
      </div>

      {drawn.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {ANALYTICS_NO_DATA}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card p-5">
          <div className="flex h-48 min-w-[320px] items-end gap-2">
            {drawn.map((r, idx) => {
              const v = valueOf(r) ?? 0;
              return (
                <div
                  key={r.email}
                  className="flex-1 rounded-t-sm transition hover:opacity-80"
                  style={{ height: `${(v / maxVal) * 100}%`, backgroundColor: palette[idx % palette.length] }}
                  title={`${r.display_name} · ${fmtMin(v)}`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex gap-2 text-[10px] text-muted-foreground">
            {drawn.map((r) => (
              <span key={r.email} className="flex-1 truncate text-center">
                {r.display_name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Members panel — per-member 12-week chart + history
// ============================================================================

function MembersPanel({ teamId, week, members }: { teamId: string; week: string; members: TeamAnalyticsRow[] }) {
  const analyticsQ = useQuery({
    queryKey: managerKeys.analytics(week, teamId),
    queryFn: () => managerApi.remote.analytics(week, teamId),
  });
  const [selectedEmail, setSelectedEmail] = useState<string>(members[0]?.email ?? "");
  const member = members.find((m) => m.email === selectedEmail) ?? members[0];

  if (!member) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Add team members in the Team tab to see per-member analytics.
      </div>
    );
  }

  const data = analyticsQ.data?.find((a) => a.email.toLowerCase() === member.email.toLowerCase());
  // Oldest week first, so the chart reads left to right.
  const weeks = (data?.weeks ?? []).slice().sort((a, b) => a.week_start.localeCompare(b.week_start));
  // Unmeasured buckets carry zeros that are not data, so they never set the scale.
  const maxMin = Math.max(
    ...weeks.filter((w) => w.data_available).map((w) => w.meeting_minutes + w.focus_minutes + w.free_minutes),
    1,
  );
  const weekLabel = (weekStart: string) =>
    new Date(weekStart).toLocaleDateString(UI_LOCALE, { month: "short", day: "numeric" });

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <ul className="space-y-1 rounded-2xl border border-border bg-card p-2">
        {members.map((m) => (
          <li key={m.email}>
            <button
              onClick={() => setSelectedEmail(m.email)}
              className={
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition " +
                (m.email === member.email ? "bg-primary/10 text-foreground" : "text-foreground hover:bg-muted")
              }
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                {initials(m.display_name)}
              </span>
              <span className="truncate">{m.display_name}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-1 text-sm font-semibold text-foreground">{member.display_name}</div>
        <div className="mb-4 text-xs text-muted-foreground">Weekly breakdown</div>

        {member.kind === "added" ? (
          // PAC-129: an added person has no Paceday figures; their availability is under This week.
          <p className="text-sm text-muted-foreground" data-testid="team-analytics-added-hint">
            {TEAM_ANALYTICS_ADDED_HINT}
          </p>
        ) : analyticsQ.isLoading ? (
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        ) : analyticsQ.isError ? (
          <div className="flex flex-wrap items-start gap-3">
            <p className="min-w-0 flex-1 text-sm text-foreground" role="alert">
              <ApiErrorText error={analyticsQ.error} effect="read" />
            </p>
            <Button size="sm" variant="outline" onClick={() => analyticsQ.refetch()} disabled={analyticsQ.isFetching}>
              Retry
            </Button>
          </div>
        ) : weeks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No analytics for this member yet.</p>
        ) : data && !data.data_available ? (
          <p data-testid="analytics-member-no-data" className="text-sm text-muted-foreground">
            No data for these 12 weeks. Their calendar could not be measured, so nothing is shown rather than zeros.
          </p>
        ) : (
          <>
            <div className="flex h-40 items-end gap-1.5">
              {weeks.map((w) => {
                if (!w.data_available) {
                  return (
                    <div
                      key={w.week_start}
                      data-testid="analytics-week-no-data"
                      className="h-full flex-1 rounded-sm border border-dashed border-border"
                      title={`Week of ${weekLabel(w.week_start)} — no data`}
                      aria-label={`Week of ${weekLabel(w.week_start)}: no data`}
                    />
                  );
                }
                const totalH = (w.meeting_minutes + w.focus_minutes + w.free_minutes) / maxMin;
                const mtgH = w.meeting_minutes / maxMin;
                const focH = w.focus_minutes / maxMin;
                const freH = w.free_minutes / maxMin;
                return (
                  <div
                    key={w.week_start}
                    className="relative flex flex-1 flex-col-reverse"
                    title={`Week of ${weekLabel(w.week_start)} — Focus ${fmtMin(w.focus_minutes)}, Meetings ${fmtMin(w.meeting_minutes)}`}
                    style={{ height: `${totalH * 100}%` }}
                  >
                    <div style={{ height: `${(mtgH / totalH) * 100}%`, backgroundColor: "#E9B949" }} />
                    <div style={{ height: `${(focH / totalH) * 100}%`, backgroundColor: "#5B7FFF" }} />
                    <div style={{ height: `${(freH / totalH) * 100}%`, backgroundColor: "#EDEEE9" }} />
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "#5B7FFF" }} /> Focus
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "#E9B949" }} /> Meetings
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "#EDEEE9" }} /> Free
              </span>
              {weeks.some((w) => !w.data_available) ? (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm border border-dashed border-muted-foreground" /> No data
                </span>
              ) : null}
            </div>
          </>
        )}

        {data && data.one_on_ones.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold text-foreground">1:1 history</div>
            <ul className="space-y-1.5">
              {data.one_on_ones.map((o, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-xs">
                  {/* A fixed label, never the event title: managers see aggregates, not titles. */}
                  <span className="text-foreground">1:1</span>
                  <span className="text-muted-foreground">
                    {new Date(o.date).toLocaleDateString(UI_LOCALE, { month: "short", day: "numeric" })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
