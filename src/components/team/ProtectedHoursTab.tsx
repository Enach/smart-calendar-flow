import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X, UserPlus, ShieldCheck } from "lucide-react";

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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/hooks/useToast";
import {
  teamsApi,
  teamKeys,
  validateTeamEmail,
  validateZoneInput,
  DAY_LABELS,
  fmtTime,
  type FormalTeam,
  type NoMeetingZone,
} from "@/api/teams";
import { apiErrorMessage } from "@/api/client";

const HOUR_START = 8; // 08:00
const HOUR_END = 20; // 20:00
const PX_PER_HOUR = 36;

interface Props {
  team: FormalTeam;
  onChanged: () => void;
}

interface DraftZone {
  day_of_week: number;
  start_min: number;
  end_min: number;
}

export function ProtectedHoursTab({ team, onChanged }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<DraftZone | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState("");
  const [mobileFormOpen, setMobileFormOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: teamKeys.all });
    onChanged();
  };
  const onMutationError = (e: unknown) => toast.error(apiErrorMessage(e));

  const addMut = useMutation({
    mutationFn: (input: Omit<NoMeetingZone, "id" | "created_at">) =>
      teamsApi.remote.addZone(team.id, input),
    onError: onMutationError,
    onSuccess: () => refresh(),
  });
  const updateMut = useMutation({
    mutationFn: (input: { id: string; patch: Partial<NoMeetingZone> }) =>
      teamsApi.remote.updateZone(team.id, input.id, input.patch),
    onError: onMutationError,
    onSuccess: () => refresh(),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => teamsApi.remote.removeZone(team.id, id),
    onError: onMutationError,
    onSuccess: () => refresh(),
  });

  const editingZone = useMemo(
    () => team.no_meeting_zones.find((z) => z.id === editingId) ?? null,
    [team.no_meeting_zones, editingId],
  );

  const editingZoneId = editingZone?.id ?? null;
  const editingZoneLabel = editingZone?.label ?? "";
  const previousEditingZoneId = useRef<string | null>(null);

  useEffect(() => {
    if (editingZoneId && editingZoneId !== previousEditingZoneId.current) {
      setLabelInput(editingZoneLabel);
    }
    previousEditingZoneId.current = editingZoneId;
  }, [editingZoneId, editingZoneLabel]);

  const activeMembers = team.members.filter((m) => m.status === "active");

  return (
    <div className="space-y-5">
      {/* Members row */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {activeMembers.slice(0, 6).map((m) => (
              <span
                key={m.email}
                title={m.display_name}
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-semibold text-foreground"
              >
                {m.display_name
                  .split(/\s+/)
                  .map((p) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
            ))}
            {activeMembers.length > 6 && (
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-semibold text-muted-foreground">
                +{activeMembers.length - 6}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {activeMembers.length} active member{activeMembers.length === 1 ? "" : "s"}
            {team.members.some((m) => m.status === "pending") &&
              ` · ${team.members.filter((m) => m.status === "pending").length} pending`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setManageOpen(true)}
            className="text-xs text-[#5B7FFF] hover:underline"
          >
            Manage members
          </button>
          <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)} className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Invite
          </Button>
        </div>
      </div>

      <div>
        <h2 className="font-serif text-xl tracking-tight text-foreground">Protected hours</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Times when the whole team should be free to focus.
        </p>
      </div>

      {/* Mobile add zone button */}
      <div className="flex sm:hidden">
        <Button
          onClick={() => setMobileFormOpen(true)}
          className="w-full gap-1.5 bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90"
        >
          <Plus className="h-4 w-4" /> Add protected block
        </Button>
      </div>

      {/* Desktop grid */}
      <div className="hidden rounded-2xl border border-border bg-card p-4 sm:block">
        <Grid
          zones={team.no_meeting_zones}
          draft={draft}
          onDraft={setDraft}
          onZoneClick={(id) => setEditingId(id)}
        />
        {team.no_meeting_zones.length === 0 && !draft && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Drag vertically on a day to protect time.
          </p>
        )}
      </div>

      {/* Mobile zone list */}
      <div className="space-y-2 sm:hidden">
        {team.no_meeting_zones.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No protected blocks yet.
          </div>
        )}
        {team.no_meeting_zones
          .slice()
          .sort((a, b) => a.day_of_week - b.day_of_week || a.start_min - b.start_min)
          .map((z) => (
            <div key={z.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
              <div>
                <div className="text-sm font-medium text-foreground">{z.label || "Protected"}</div>
                <div className="text-xs text-muted-foreground">
                  {DAY_LABELS[z.day_of_week - 1]} · {fmtTime(z.start_min)} – {fmtTime(z.end_min)}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditingId(z.id)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                >
                  Edit
                </button>
                <button
                  onClick={() => removeMut.mutate(z.id)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
      </div>

      {/* Draft popover (desktop) */}
      <DraftDialog
        draft={draft}
        onSave={(label) => {
          if (!draft) return;
          addMut.mutate({
            day_of_week: draft.day_of_week,
            start_min: draft.start_min,
            end_min: draft.end_min,
            label: label || "Protected",
          });
          setDraft(null);
        }}
        onCancel={() => setDraft(null)}
      />

      {/* Edit dialog */}
      <Dialog open={!!editingZone} onOpenChange={(o) => !o && setEditingId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">Edit protected block</DialogTitle>
            {editingZone && (
              <DialogDescription>
                {DAY_LABELS[editingZone.day_of_week - 1]} · {fmtTime(editingZone.start_min)} – {fmtTime(editingZone.end_min)}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs font-medium text-foreground">
              Label
              <input
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-[#5B7FFF] focus:outline-none focus:ring-2 focus:ring-[#5B7FFF]/20"
                placeholder="Deep work"
              />
            </label>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="outline"
              onClick={() => {
                if (editingId) removeMut.mutate(editingId);
                setEditingId(null);
              }}
              className="text-[#EF4444] hover:text-[#EF4444]"
            >
              Delete
            </Button>
            <Button
              onClick={() => {
                if (editingId)
                  updateMut.mutate({ id: editingId, patch: { label: labelInput || "Protected" } });
                setEditingId(null);
              }}
              className="bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile add form */}
      <MobileAddForm
        open={mobileFormOpen}
        onOpenChange={setMobileFormOpen}
        onSave={(input) => {
          addMut.mutate(input);
          setMobileFormOpen(false);
        }}
      />

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        teamId={team.id}
        onInvited={refresh}
      />

      <ManageMembersSheet
        open={manageOpen}
        onOpenChange={setManageOpen}
        team={team}
        onChanged={refresh}
      />
    </div>
  );
}

// ============================================================================
// Grid
// ============================================================================

function Grid({
  zones,
  draft,
  onDraft,
  onZoneClick,
}: {
  zones: NoMeetingZone[];
  draft: DraftZone | null;
  onDraft: (d: DraftZone | null) => void;
  onZoneClick: (id: string) => void;
}) {
  const totalH = HOUR_END - HOUR_START;
  const minToY = (m: number) => ((m - HOUR_START * 60) / 60) * PX_PER_HOUR;

  const columnRefs = useRef<Array<HTMLDivElement | null>>([]);
  const dragState = useRef<{ day: number; startMin: number } | null>(null);

  const onMouseDown = (day: number, e: React.MouseEvent) => {
    const col = columnRefs.current[day - 1];
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const min = HOUR_START * 60 + Math.round((y / PX_PER_HOUR) * 60 / 15) * 15;
    dragState.current = { day, startMin: min };
    onDraft({ day_of_week: day, start_min: min, end_min: min + 30 });

    const onMove = (ev: MouseEvent) => {
      const r = col.getBoundingClientRect();
      const yy = ev.clientY - r.top;
      const m = HOUR_START * 60 + Math.round((yy / PX_PER_HOUR) * 60 / 15) * 15;
      const startMin = Math.min(dragState.current!.startMin, m);
      const endMin = Math.max(dragState.current!.startMin, m);
      onDraft({
        day_of_week: day,
        start_min: Math.max(HOUR_START * 60, startMin),
        end_min: Math.min(HOUR_END * 60, Math.max(startMin + 15, endMin)),
      });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dragState.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="flex">
      {/* Hour labels */}
      <div className="w-12 shrink-0 pt-6 text-right">
        {Array.from({ length: totalH + 1 }, (_, i) => (
          <div
            key={i}
            className="pr-2 text-[10px] text-muted-foreground"
            style={{ height: PX_PER_HOUR }}
          >
            {fmtTime((HOUR_START + i) * 60)}
          </div>
        ))}
      </div>

      {/* Day columns */}
      <div className="flex flex-1 gap-1.5">
        {DAY_LABELS.map((label, idx) => {
          const day = idx + 1;
          const dayZones = zones.filter((z) => z.day_of_week === day);
          return (
            <div key={day} className="flex flex-1 flex-col">
              <div className="mb-1 text-center text-xs font-semibold text-foreground">{label}</div>
              <div
                ref={(el) => {
                  columnRefs.current[idx] = el;
                }}
                onMouseDown={(e) => onMouseDown(day, e)}
                className="relative cursor-crosshair rounded border border-dashed border-border bg-background/40"
                style={{ height: totalH * PX_PER_HOUR }}
              >
                {/* Hour ticks */}
                {Array.from({ length: totalH }, (_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-border/30"
                    style={{ top: i * PX_PER_HOUR }}
                  />
                ))}
                {/* Zones */}
                {dayZones.map((z) => (
                  <button
                    key={z.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onZoneClick(z.id);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="absolute left-0 right-0 cursor-pointer rounded border border-[#9B7AE0]/40 bg-[#9B7AE0]/20 px-1 py-0.5 text-left text-[10px] font-medium text-[#5A3F9C] hover:bg-[#9B7AE0]/30"
                    style={{
                      top: minToY(z.start_min),
                      height: minToY(z.end_min) - minToY(z.start_min),
                    }}
                    title={`${z.label} · ${fmtTime(z.start_min)}–${fmtTime(z.end_min)}`}
                  >
                    <span className="line-clamp-2">{z.label}</span>
                  </button>
                ))}
                {/* Draft */}
                {draft?.day_of_week === day && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 rounded border-2 border-[#9B7AE0] bg-[#9B7AE0]/20"
                    style={{
                      top: minToY(draft.start_min),
                      height: minToY(draft.end_min) - minToY(draft.start_min),
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Draft dialog (after mouse-up)
// ============================================================================

function DraftDialog({
  draft,
  onSave,
  onCancel,
}: {
  draft: DraftZone | null;
  onSave: (label: string) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const hasDraft = draft !== null;
  useEffect(() => {
    if (hasDraft) setLabel("");
  }, [draft?.day_of_week, draft?.start_min, draft?.end_min, hasDraft]);

  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">New protected block</DialogTitle>
          {draft && (
            <DialogDescription>
              {DAY_LABELS[draft.day_of_week - 1]} · {fmtTime(draft.start_min)} – {fmtTime(draft.end_min)}
            </DialogDescription>
          )}
        </DialogHeader>
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Deep work"
          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-[#5B7FFF] focus:outline-none focus:ring-2 focus:ring-[#5B7FFF]/20"
          onKeyDown={(e) => e.key === "Enter" && onSave(label)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSave(label)} className="bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Mobile add form
// ============================================================================

function MobileAddForm({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (z: Omit<NoMeetingZone, "id" | "created_at">) => void;
}) {
  const [day, setDay] = useState(1);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("11:00");
  const [label, setLabel] = useState("");

  const submit = () => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    const zone = { day_of_week: day, start_min: startMin, end_min: endMin, label: label || "Protected" };
    const invalid = validateZoneInput(zone);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    onSave(zone);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">Add protected block</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-foreground">
            Day
            <select value={day} onChange={(e) => setDay(Number(e.target.value))} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
              {DAY_LABELS.map((l, i) => (
                <option key={i} value={i + 1}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-foreground">
              Start
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
            </label>
            <label className="block text-xs font-medium text-foreground">
              End
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
            </label>
          </div>
          <label className="block text-xs font-medium text-foreground">
            Label
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Deep work" className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} className="bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Invite + Manage members
// ============================================================================

function InviteDialog({
  open,
  onOpenChange,
  teamId,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teamId: string;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inviteMut = useMutation({
    mutationFn: () => teamsApi.remote.inviteMember(teamId, email, name),
    // Typed values are preserved on failure.
    onError: (e) => setError(apiErrorMessage(e)),
    onSuccess: () => {
      toast.success(`Invite sent to ${email}.`);
      setEmail("");
      setName("");
      setError(null);
      onOpenChange(false);
      onInvited();
    },
  });

  const submit = () => {
    const invalid = validateTeamEmail(email);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    inviteMut.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">Invite to team</DialogTitle>
          <DialogDescription>
            They will appear as Pending until they accept.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-foreground">
            Email <span className="text-[#EF4444]">*</span>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-[#5B7FFF] focus:outline-none focus:ring-2 focus:ring-[#5B7FFF]/20"
              placeholder="alex@team.com"
            />
          </label>
          <label className="block text-xs font-medium text-foreground">
            Display name <span className="text-muted-foreground">(optional)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-[#5B7FFF] focus:outline-none focus:ring-2 focus:ring-[#5B7FFF]/20" placeholder="Alex Carter" />
          </label>
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
          <Button onClick={submit} disabled={inviteMut.isPending} className="bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90">
            {inviteMut.isPending ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageMembersSheet({
  open,
  onOpenChange,
  team,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  team: FormalTeam;
  onChanged: () => void;
}) {
  const me = teamsApi.currentUserEmail();
  const isOwner = team.owner_email === me;
  const removeMemberMut = useMutation({
    mutationFn: (email: string) => teamsApi.remote.removeMember(team.id, email),
    onError: (e) => toast.error(apiErrorMessage(e)),
    onSuccess: () => {
      toast.success("Member removed.");
      onChanged();
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-serif">Manage members</SheetTitle>
          <SheetDescription>{team.name}</SheetDescription>
        </SheetHeader>
        <ul className="mt-6 divide-y divide-border">
          {team.members.map((m) => (
            <li key={m.email} className="flex items-center gap-3 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                {m.display_name
                  .split(/\s+/)
                  .map((p) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <span className="truncate font-medium">{m.display_name}</span>
                  {m.role === "owner" && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-[#9B7AE0]/12 px-1.5 py-0.5 text-[9px] font-semibold text-[#5A3F9C]">
                      <ShieldCheck className="h-2.5 w-2.5" /> Owner
                    </span>
                  )}
                  {m.status === "pending" && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">Pending</span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">{m.email}</div>
              </div>
              {isOwner && m.email !== me && (
                <button
                  onClick={() => removeMemberMut.mutate(m.email)}
                  disabled={removeMemberMut.isPending}
                  className="rounded p-1.5 text-muted-foreground hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
