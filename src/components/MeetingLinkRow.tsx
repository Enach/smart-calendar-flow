import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Video, ExternalLink, Settings as SettingsIcon } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/hooks/useToast";
import type { ConferenceLink, ConferenceProvider } from "@/api/types";

const PROVIDER_META: Record<ConferenceProvider, { label: string; emoji: string; cls: string }> = {
  google_meet: { label: "Google Meet", emoji: "🟢", cls: "text-success" },
  zoom: { label: "Zoom", emoji: "🔵", cls: "text-primary" },
  teams: { label: "Microsoft Teams", emoji: "🟣", cls: "text-accent-foreground" },
  custom: { label: "Custom URL", emoji: "🔗", cls: "text-muted-foreground" },
};

const inputCls =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

interface MeetingLinkRowProps {
  eventId: string;
  conference?: ConferenceLink;
  onChange: (link: ConferenceLink | undefined) => void;
}

export function MeetingLinkRow({ eventId, conference, onChange }: MeetingLinkRowProps) {
  const qc = useQueryClient();
  const { data: providers = [] } = useQuery({
    queryKey: ["conferenceProviders"],
    queryFn: () => api.conferenceProviders(),
    staleTime: 60_000,
  });

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ConferenceProvider | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [customUrl, setCustomUrl] = useState("");

  const isConnected = (p: ConferenceProvider) =>
    p === "custom" ||
    providers.find((x) => x.provider === p)?.connected ||
    !!providers.find((x) => x.provider === p)?.auto_with;

  const add = async (provider: ConferenceProvider, url?: string) => {
    if (!isConnected(provider)) {
      toast.error("Provider not connected — open Settings → Conferencing");
      return;
    }
    setBusy(provider);
    try {
      const link = await api.addConference(eventId, { provider, url });
      onChange(link);
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.success(`${PROVIDER_META[provider].label} link added`);
      setOpen(false);
      setCustomMode(false);
      setCustomUrl("");
    } catch {
      toast.error("Failed to generate meeting link");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("custom");
    try {
      await api.removeConference(eventId);
      onChange(undefined);
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.success("Meeting link removed");
    } catch {
      toast.error("Failed to remove link");
    } finally {
      setBusy(null);
    }
  };

  if (conference) {
    const meta = PROVIDER_META[conference.provider];
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <span className="text-base leading-none">{meta.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold ${meta.cls}`}>{meta.label}</p>
          <a
            href={conference.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 truncate text-xs text-foreground hover:text-primary hover:underline"
          >
            <span className="truncate">{conference.url}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </div>
        <button
          type="button"
          onClick={remove}
          disabled={busy !== null}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          aria-label="Remove meeting link"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-primary hover:bg-primary/5 hover:text-primary"
      >
        <span className="flex items-center gap-1.5">
          <Video className="h-3.5 w-3.5" />
          Add meeting link
        </span>
        <Plus className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card p-1 shadow-lg">
          {(["google_meet", "zoom", "teams"] as ConferenceProvider[]).map((p) => {
            const meta = PROVIDER_META[p];
            const connected = isConnected(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => add(p)}
                disabled={busy !== null || !connected}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-muted/50 disabled:opacity-60"
              >
                <span>{meta.emoji}</span>
                <span className="flex-1 font-medium text-foreground">{meta.label}</span>
                {!connected && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <SettingsIcon className="h-2.5 w-2.5" />
                    Connect in Settings
                  </span>
                )}
                {busy === p && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </button>
            );
          })}
          <div className="my-1 border-t border-border" />
          {customMode ? (
            <div className="flex items-center gap-1 p-1">
              <input
                autoFocus
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://…"
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => customUrl.trim() && add("custom", customUrl.trim())}
                disabled={!customUrl.trim() || busy !== null}
                className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                {busy === "custom" && <Loader2 className="h-3 w-3 animate-spin" />}
                Add
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCustomMode(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-muted/50"
            >
              <span>🔗</span>
              <span className="flex-1 font-medium text-foreground">Custom URL</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
