import { useMemo, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Minus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { teamsApi, type FormalTeam } from "@/api/teams";
import { managerApi, type TeamMember } from "@/api/manager";

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

export function AnalyticsTab({ activeTeam, onCreateTeam }: Props) {
  const [sub, setSub] = useState<SubTab>("week");

  // Data source preference: formal team if available, else manager team
  const teamData = useMemo(() => {
    if (activeTeam) return teamsApi.teamAnalytics(activeTeam.id);
    return managerApi.listTeam().map((m) => {
      const a = managerApi.analytics(m.email);
      return {
        email: m.email,
        display_name: m.display_name,
        is_paceday_user: m.is_paceday_user,
        weeks: a?.weeks ?? [],
      };
    });
  }, [activeTeam]);

  const sourceLabel = activeTeam ? activeTeam.name : "your manager team";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl tracking-tight text-foreground">Analytics</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          How {sourceLabel} is spending their time.
        </p>
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-border">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={
              "border-b-2 px-3 py-2 text-sm font-medium transition " +
              (sub === t.key ? "border-[#5B7FFF] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {teamData.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Users className="h-5 w-5" />
          </div>
          <p className="text-sm text-muted-foreground">No team data yet.</p>
          {!activeTeam && (
            <Button onClick={onCreateTeam} className="mt-3 bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90">
              Create team
            </Button>
          )}
        </div>
      )}

      {teamData.length > 0 && sub === "week" && <ThisWeek data={teamData} />}
      {teamData.length > 0 && sub === "trends" && <Trends data={teamData} />}
      {teamData.length > 0 && sub === "members" && <MembersPanel members={managerApi.listTeam()} />}
    </div>
  );
}

// ============================================================================
// This week
// ============================================================================

interface RowData {
  email: string;
  display_name: string;
  is_paceday_user: boolean;
  weeks: { week_start: string; meeting_minutes: number; focus_minutes: number; free_minutes: number }[];
}

function ThisWeek({ data }: { data: RowData[] }) {
  const rows = data.map((d) => {
    const w = d.weeks[d.weeks.length - 1];
    const meeting = w?.meeting_minutes ?? 0;
    const focus = w?.focus_minutes ?? 0;
    const total = meeting + focus + (w?.free_minutes ?? 0);
    const score = total > 0 ? Math.round((focus / Math.max(1, focus + meeting)) * 100) : 0;
    return { ...d, meeting, focus, score };
  });
  rows.sort((a, b) => a.score - b.score);

  const avgFocus = Math.round(rows.reduce((s, r) => s + r.focus, 0) / Math.max(1, rows.length));
  const avgMtg = Math.round(rows.reduce((s, r) => s + r.meeting, 0) / Math.max(1, rows.length));
  const avgScore = Math.round(rows.reduce((s, r) => s + r.score, 0) / Math.max(1, rows.length));

  const insights: string[] = [];
  for (const r of rows) {
    if (r.meeting > 25 * 60) insights.push(`${r.display_name} had over 25 hours in meetings this week.`);
  }
  if (avgScore < 40) insights.push("The team is spending more time in meetings than focused work.");
  if (rows.every((r) => r.score >= 60)) insights.push("Great week — the whole team had solid focus time.");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Avg team focus" value={fmtMin(avgFocus)} color="#5B7FFF" />
        <Stat label="Avg team meetings" value={fmtMin(avgMtg)} color="#E9B949" />
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
              const tint =
                r.meeting > r.focus
                  ? "bg-[#EF4444]/5"
                  : r.focus > r.meeting
                    ? "bg-[#22C55E]/5"
                    : "";
              return (
                <tr key={r.email} className={"border-t border-border " + tint}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                        {initials(r.display_name)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-foreground">{r.display_name}</div>
                        {!r.is_paceday_user && (
                          <div className="text-[10px] italic text-muted-foreground">Meeting time estimated</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{fmtMin(r.meeting)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                    {r.is_paceday_user ? fmtMin(r.focus) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
                      style={{
                        color: r.score >= 60 ? "#15803D" : r.score >= 40 ? "#8A6A14" : "#B91C1C",
                        backgroundColor:
                          r.score >= 60 ? "#22C55E20" : r.score >= 40 ? "#E9B94920" : "#EF444420",
                      }}
                    >
                      {r.is_paceday_user ? `${r.score}` : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {insights.length > 0 && (
        <div className="space-y-2">
          {insights.map((line, i) => (
            <div key={i} className="rounded-xl border border-border bg-[#5B7FFF]/5 px-4 py-3 text-sm text-foreground">
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
      <div className="text-2xl font-semibold tracking-tight" style={{ color }}>
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// ============================================================================
// Trends
// ============================================================================

function Trends({ data }: { data: RowData[] }) {
  const [metric, setMetric] = useState<"focus" | "meetings">("focus");

  // 8 most recent weeks per member
  const weeks = data[0]?.weeks.slice(-8) ?? [];
  const palette = ["#5B7FFF", "#E9B949", "#9B7AE0", "#5FC9A6", "#EF4444", "#0EA5E9", "#F97316", "#6366F1"];

  // Trend arrows: compare last week vs avg of prior weeks per member
  const trends = data.map((d, idx) => {
    const last = (metric === "focus" ? d.weeks.at(-1)?.focus_minutes : d.weeks.at(-1)?.meeting_minutes) ?? 0;
    const prior = d.weeks.slice(-8, -1);
    const avg = prior.length
      ? prior.reduce((s, w) => s + (metric === "focus" ? w.focus_minutes : w.meeting_minutes), 0) / prior.length
      : 0;
    const pct = avg > 0 ? Math.round(((last - avg) / avg) * 100) : 0;
    return { name: d.display_name, color: palette[idx % palette.length], last, pct };
  });

  // Max value across all members & weeks for scaling
  const maxVal = Math.max(
    1,
    ...data.flatMap((d) => d.weeks.slice(-8).map((w) => (metric === "focus" ? w.focus_minutes : w.meeting_minutes))),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg border border-border bg-card p-1 text-xs">
          {(["focus", "meetings"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={
                "rounded-md px-3 py-1.5 font-medium transition " +
                (metric === m ? "bg-[#5B7FFF] text-white" : "text-muted-foreground hover:text-foreground")
              }
            >
              {m === "focus" ? "Focus" : "Meetings"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card p-5">
        <div className="flex h-48 min-w-[600px] items-end gap-2">
          {weeks.map((_, weekIdx) => (
            <div key={weekIdx} className="flex flex-1 items-end gap-0.5">
              {data.map((d, memberIdx) => {
                const w = d.weeks.slice(-8)[weekIdx];
                const v = w ? (metric === "focus" ? w.focus_minutes : w.meeting_minutes) : 0;
                const h = (v / maxVal) * 100;
                return (
                  <div
                    key={d.email}
                    className="flex-1 rounded-t-sm transition hover:opacity-80"
                    style={{ height: `${h}%`, backgroundColor: palette[memberIdx % palette.length] }}
                    title={`${d.display_name} · ${fmtMin(v)}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          {weeks.map((w, i) => (
            <span key={i}>
              {new Date(w.week_start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          ))}
        </div>
      </div>

      {/* Per-member trend arrows */}
      <div className="grid gap-2 sm:grid-cols-2">
        {trends.map((t) => (
          <div key={t.name} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: t.color }} />
              <span className="truncate">{t.name}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground tabular-nums">{fmtMin(t.last)}</span>
              {t.pct > 5 ? (
                <span className="inline-flex items-center text-[#22C55E]">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  {t.pct}%
                </span>
              ) : t.pct < -5 ? (
                <span className="inline-flex items-center text-[#EF4444]">
                  <ArrowDownRight className="h-3.5 w-3.5" />
                  {t.pct}%
                </span>
              ) : (
                <span className="inline-flex items-center text-muted-foreground">
                  <Minus className="h-3 w-3" />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Members panel — per-member 12-week chart + history
// ============================================================================

function MembersPanel({ members }: { members: TeamMember[] }) {
  const [selectedEmail, setSelectedEmail] = useState<string>(members[0]?.email ?? "");
  const member = members.find((m) => m.email === selectedEmail) ?? members[0];

  if (!member) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Add team members in the Team tab to see per-member analytics.
      </div>
    );
  }

  const data = managerApi.analytics(member.email);
  if (!data) return null;
  const maxMin = Math.max(...data.weeks.map((w) => w.meeting_minutes + w.focus_minutes + w.free_minutes), 1);

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <ul className="space-y-1 rounded-2xl border border-border bg-card p-2">
        {members.map((m) => (
          <li key={m.email}>
            <button
              onClick={() => setSelectedEmail(m.email)}
              className={
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition " +
                (m.email === member.email ? "bg-[#5B7FFF]/10 text-foreground" : "text-foreground hover:bg-muted")
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
        <div className="mb-4 text-xs text-muted-foreground">12-week breakdown</div>

        <div className="flex h-40 items-end gap-1.5">
          {data.weeks.map((w) => {
            const totalH = (w.meeting_minutes + w.focus_minutes + w.free_minutes) / maxMin;
            const mtgH = w.meeting_minutes / maxMin;
            const focH = w.focus_minutes / maxMin;
            const freH = w.free_minutes / maxMin;
            return (
              <div
                key={w.week_start}
                className="relative flex flex-1 flex-col-reverse"
                title={`Week of ${new Date(w.week_start).toLocaleDateString(undefined, { month: "short", day: "numeric" })} — Focus ${fmtMin(w.focus_minutes)}, Meetings ${fmtMin(w.meeting_minutes)}`}
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
        </div>

        {data.one_on_ones.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold text-foreground">1:1 history</div>
            <ul className="space-y-1.5">
              {data.one_on_ones.map((o, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-xs">
                  <span className="text-foreground">{o.title}</span>
                  <span className="text-muted-foreground">
                    {new Date(o.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
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
