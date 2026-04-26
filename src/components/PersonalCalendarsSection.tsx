import { useState } from "react";
import { Loader2, Plus, RefreshCw, Trash2, Calendar, Mail, Link as LinkIcon } from "lucide-react";
import {
  usePersonalCalendars,
  useAddPersonalCalendar,
  useUpdatePersonalCalendar,
  useDeletePersonalCalendar,
  useSyncPersonalCalendar,
} from "@/hooks/usePersonalCalendars";
import { toast } from "@/hooks/useToast";
import type { PersonalCalendarType } from "@/api/types";

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

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-primary" : "bg-muted"}`}
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
  const { data: cals = [], isLoading } = usePersonalCalendars();
  const update = useUpdatePersonalCalendar();
  const remove = useDeletePersonalCalendar();
  const sync = useSyncPersonalCalendar();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : cals.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
            No personal calendars yet. Add one to block out personal time so it never gets scheduled over.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {cals.map((c) => {
              const meta = TYPE_META[c.type];
              const Icon = meta.icon;
              return (
                <li key={c.id} className="flex items-center gap-3 bg-background p-3">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{c.label}</p>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.badgeCls}`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {c.email || c.url || "—"} · last synced {formatRelative(c.last_synced_at)}
                    </p>
                  </div>
                  <Toggle
                    checked={c.enabled}
                    onChange={(v) => update.mutate({ id: c.id, patch: { enabled: v } })}
                  />
                  <button
                    onClick={() => {
                      sync.mutate(c.id, {
                        onSuccess: () => toast.success(`Synced ${c.label}`),
                        onError: () => toast.error("Sync failed"),
                      });
                    }}
                    disabled={sync.isPending}
                    title="Sync now"
                    className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remove "${c.label}"?`)) {
                        remove.mutate(c.id, {
                          onSuccess: () => toast.success("Removed"),
                          onError: () => toast.error("Failed to remove"),
                        });
                      }
                    }}
                    title="Delete"
                    className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
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

function AddPersonalCalendarModal({ onClose }: { onClose: () => void }) {
  const add = useAddPersonalCalendar();
  const [type, setType] = useState<PersonalCalendarType>("google");
  const [label, setLabel] = useState("Personal");
  const [url, setUrl] = useState("");

  const submit = async () => {
    if (!label.trim()) {
      toast.error("Label is required");
      return;
    }
    if (type === "webcal" && !url.trim()) {
      toast.error("WebCal URL is required");
      return;
    }
    try {
      const body: { type: PersonalCalendarType; label: string; url?: string } = {
        type,
        label: label.trim(),
      };
      if (type === "webcal") body.url = url.trim();
      const res = (await add.mutateAsync(body)) as { auth_url?: string };
      if (res.auth_url) {
        window.open(res.auth_url, "_blank", "noopener,noreferrer");
        toast.success("Opening provider sign-in in a new tab…");
      } else {
        toast.success("Personal calendar added");
      }
      onClose();
    } catch {
      toast.error("Failed to add calendar");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={onClose}>
      <div
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

          {type === "webcal" && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-foreground">WebCal URL</span>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="webcal://example.com/calendar.ics"
                className={inputCls}
              />
            </label>
          )}

          {type !== "webcal" && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
              You'll be redirected to {TYPE_META[type].label} to authorize this calendar in a new tab.
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
