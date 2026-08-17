import { useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  Link as LinkIcon,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  usePersonalCalendars,
  useAddPersonalCalendar,
  useUpdatePersonalCalendar,
  useDeletePersonalCalendar,
  useSyncPersonalCalendar,
} from "@/hooks/usePersonalCalendars";
import { apiErrorMessage } from "@/api/client";
import { toast } from "@/hooks/useToast";
import type { PersonalCalendar, PersonalCalendarType } from "@/api/types";
import { isValidWebcalUrl } from "@/lib/personalCalendarValidation";

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const TYPE_META: Record<PersonalCalendarType, { label: string; icon: React.ComponentType<{ className?: string }>; badgeCls: string }> = {
  google: { label: "Google", icon: Calendar, badgeCls: "bg-primary/10 text-primary" },
  outlook: { label: "Outlook", icon: Mail, badgeCls: "bg-accent/10 text-accent-foreground" },
  webcal: { label: "WebCal", icon: LinkIcon, badgeCls: "bg-muted text-muted-foreground" },
};

function formatRelative(iso?: string) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} h ago`;
  return `${Math.floor(diff / 86_400_000)} d ago`;
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={checked ? "Disable calendar" : "Enable calendar"}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-50 ${checked ? "bg-primary" : "bg-muted"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
          checked ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function PersonalCalendarsSection() {
  const { data: cals = [], isLoading, isError, error, isFetching, refetch } = usePersonalCalendars();
  const [modalOpen, setModalOpen] = useState(false);

  const hasCachedData = cals.length > 0;

  return (
    <>
      <div className="space-y-3">
        {isError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Couldn't load personal calendars</p>
              <p className="mt-0.5 text-destructive/80">{apiErrorMessage(error)}</p>
              {hasCachedData && (
                <p className="mt-0.5 text-destructive/70">Showing the last loaded list.</p>
              )}
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="shrink-0 rounded-md border border-destructive/30 px-2 py-1 text-[11px] font-semibold transition hover:bg-destructive/10 disabled:opacity-50"
            >
              {isFetching ? "Retrying…" : "Retry"}
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : cals.length === 0 ? (
          !isError && (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
              No personal calendars yet. Add one to block out personal time so it never gets scheduled over.
            </p>
          )
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {cals.map((c) => (
              <CalendarRow key={c.id} cal={c} />
            ))}
          </ul>
        )}

        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary hover:bg-primary/5 hover:text-primary"
        >
          <Plus className="h-3 w-3" /> Add personal calendar
        </button>
      </div>

      {modalOpen && <AddPersonalCalendarModal onClose={() => setModalOpen(false)} />}
    </>
  );
}

function CalendarRow({ cal }: { cal: PersonalCalendar }) {
  const update = useUpdatePersonalCalendar();
  const remove = useDeletePersonalCalendar();
  const sync = useSyncPersonalCalendar();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cal.label);

  const meta = TYPE_META[cal.type] ?? TYPE_META.webcal;
  const Icon = meta.icon;
  const busy = update.isPending || remove.isPending || sync.isPending;

  const saveLabel = () => {
    const label = draft.trim();
    if (!label) {
      toast.error("Label is required");
      return;
    }
    if (label === cal.label) {
      setEditing(false);
      return;
    }
    update.mutate(
      { id: cal.id, patch: { label } },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success("Calendar renamed");
        },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <li className="flex items-center gap-3 bg-background p-3">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              aria-label="Calendar name"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveLabel();
                if (e.key === "Escape") setEditing(false);
              }}
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
            <button
              onClick={saveLabel}
              disabled={update.isPending}
              aria-label="Save name"
              className="rounded-md p-1.5 text-primary transition hover:bg-primary/10 disabled:opacity-50"
            >
              {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => {
                setDraft(cal.label);
                setEditing(false);
              }}
              aria-label="Cancel rename"
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <p className={`truncate text-sm font-medium ${cal.enabled ? "text-foreground" : "text-muted-foreground line-through"}`}>
                {cal.label}
              </p>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.badgeCls}`}>
                {meta.label}
              </span>
              <button
                onClick={() => {
                  setDraft(cal.label);
                  setEditing(true);
                }}
                aria-label={`Rename ${cal.label}`}
                className="rounded p-0.5 text-muted-foreground transition hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {cal.email || cal.url || "—"} · last synced {formatRelative(cal.last_synced_at)}
            </p>
          </>
        )}
      </div>

      <Toggle
        checked={cal.enabled}
        disabled={busy}
        onChange={(v) =>
          update.mutate(
            { id: cal.id, patch: { enabled: v } },
            {
              onSuccess: () => toast.success(v ? "Calendar enabled" : "Calendar disabled"),
              onError: (e) => toast.error(apiErrorMessage(e)),
            },
          )
        }
      />
      <button
        onClick={() =>
          sync.mutate(cal.id, {
            onSuccess: () => toast.success(`Synced ${cal.label}`),
            onError: (e) => toast.error(apiErrorMessage(e)),
          })
        }
        disabled={busy}
        title="Sync now"
        aria-label={`Sync ${cal.label}`}
        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? "animate-spin" : ""}`} />
      </button>
      <button
        onClick={() => {
          if (confirm(`Remove "${cal.label}"?`)) {
            remove.mutate(cal.id, {
              onSuccess: () => toast.success("Removed"),
              onError: (e) => toast.error(apiErrorMessage(e)),
            });
          }
        }}
        disabled={busy}
        title="Delete"
        aria-label={`Delete ${cal.label}`}
        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      >
        {remove.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </li>
  );
}

function AddPersonalCalendarModal({ onClose }: { onClose: () => void }) {
  const add = useAddPersonalCalendar();
  const [type, setType] = useState<PersonalCalendarType>("google");
  const [label, setLabel] = useState("Personal");
  const [url, setUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    if (add.isPending) return;
    setFormError(null);
    if (!label.trim()) {
      setFormError("Label is required");
      return;
    }
    if (type === "webcal" && !isValidWebcalUrl(url)) {
      setFormError("Enter a valid webcal:// or https:// .ics URL");
      return;
    }
    const body: { type: PersonalCalendarType; label: string; url?: string } = {
      type,
      label: label.trim(),
    };
    if (type === "webcal") body.url = url.trim();
    try {
      await add.mutateAsync(body);
      toast.success("Personal calendar added");
      onClose();
    } catch (e) {
      setFormError(apiErrorMessage(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add personal calendar"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-foreground">Add personal calendar</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Personal time is shown on your calendar in graphite so the scheduler never books over it.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">Label</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className={inputCls}
              placeholder="Personal"
            />
          </label>

          <div>
            <span className="mb-1 block text-xs font-medium text-foreground">Type</span>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TYPE_META) as PersonalCalendarType[]).map((t) => {
                const m = TYPE_META[t];
                const Icon = m.icon;
                const selected = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition ${
                      selected
                        ? "border-primary bg-primary/5 text-primary ring-2 ring-primary/20"
                        : "border-border bg-background text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {type === "webcal" ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-foreground">WebCal URL</span>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="webcal://example.com/calendar.ics"
                className={inputCls}
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Anyone with this link can read the calendar's busy times. Paceday fetches it server-side to block
                personal time — event titles are not shared with your team.
              </span>
            </label>
          ) : (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
              This saves the {TYPE_META[type].label} calendar entry. Authorizing access to {TYPE_META[type].label} is a
              separate step and is not completed here.
            </p>
          )}

          {formError && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
              {formError}
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={add.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {add.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Add calendar
          </button>
        </div>
      </div>
    </div>
  );
}
