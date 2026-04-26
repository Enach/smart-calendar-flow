import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, LogIn, LogOut, RotateCcw, X } from "lucide-react";
import { api, mockZoomConnect } from "@/api/client";
import { toast } from "@/hooks/useToast";
import type { ConferenceProvider, ConferenceProviderStatus, Settings } from "@/api/types";

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const PROVIDER_LABEL: Record<ConferenceProvider, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  teams: "Microsoft Teams",
  custom: "Custom URL",
};

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

interface ConferencingSectionProps {
  settings: Settings;
  onPatch: (patch: Partial<Settings>) => void;
}

export function ConferencingSection({ settings, onPatch }: ConferencingSectionProps) {
  const qc = useQueryClient();
  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["conferenceProviders"],
    queryFn: () => api.conferenceProviders(),
    staleTime: 60_000,
  });

  const [zoomBusy, setZoomBusy] = useState<"connect" | "disconnect" | null>(null);
  const [zoomError, setZoomError] = useState<{
    message: string;
    retry: () => void;
  } | null>(null);

  const meet = providers.find((p) => p.provider === "google_meet");
  const zoom = providers.find((p) => p.provider === "zoom");
  const teams = providers.find((p) => p.provider === "teams");
  const isOutlook = settings.calendar_provider === "outlook";

  const refresh = () => qc.invalidateQueries({ queryKey: ["conferenceProviders"] });

  const patchZoomCache = (connected: boolean, email?: string) => {
    qc.setQueryData<ConferenceProviderStatus[]>(["conferenceProviders"], (prev) => {
      if (!prev) return prev;
      return prev.map((p) =>
        p.provider === "zoom" ? { ...p, connected, email: connected ? email ?? p.email : undefined } : p,
      );
    });
  };

  const handleZoomConnect = async () => {
    // Concurrent-toggle guard: ignore if a request is already in flight
    if (zoomBusy !== null) return;
    setZoomError(null);
    const previous = qc.getQueryData<ConferenceProviderStatus[]>(["conferenceProviders"]);
    // Optimistically flip to connected immediately
    patchZoomCache(true, "you@example.com");
    setZoomBusy("connect");
    try {
      try {
        mockZoomConnect();
        toast.success("Zoom connected (demo)");
        refresh();
      } catch {
        window.location.href = api.zoomConnectUrl();
      }
    } catch {
      // Rollback on failure
      if (previous) qc.setQueryData(["conferenceProviders"], previous);
      const message = "Couldn't connect to Zoom — your previous state has been restored.";
      toast.error(message);
      setZoomError({ message, retry: handleZoomConnect });
    } finally {
      setZoomBusy(null);
    }
  };

  const handleZoomDisconnect = async () => {
    // Concurrent-toggle guard: ignore if a request is already in flight
    if (zoomBusy !== null) return;
    setZoomError(null);
    const previous = qc.getQueryData<ConferenceProviderStatus[]>(["conferenceProviders"]);
    // Optimistically flip to disconnected immediately
    patchZoomCache(false);
    setZoomBusy("disconnect");
    try {
      await api.zoomDisconnect();
      toast.success("Disconnected Zoom");
      refresh();
    } catch {
      if (previous) qc.setQueryData(["conferenceProviders"], previous);
      const message = "Couldn't disconnect Zoom — your account is still linked.";
      toast.error(message);
      setZoomError({ message, retry: handleZoomDisconnect });
    } finally {
      setZoomBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">Default provider</label>
        <select
          value={settings.default_conference_provider ?? "google_meet"}
          onChange={(e) => onPatch({ default_conference_provider: e.target.value as ConferenceProvider })}
          className={inputCls}
        >
          {(["google_meet", "zoom", "teams"] as ConferenceProvider[]).map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABEL[p]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Used when adding a meeting link without picking a specific provider.
        </p>
      </div>

      {zoomError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-destructive">Action rolled back</p>
            <p className="text-[11px] text-destructive/90">{zoomError.message}</p>
          </div>
          <button
            type="button"
            onClick={zoomError.retry}
            disabled={zoomBusy !== null}
            className="flex items-center gap-1 rounded-md border border-destructive/40 bg-background px-2 py-1 text-[11px] font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
          <button
            type="button"
            onClick={() => setZoomError(null)}
            aria-label="Dismiss"
            className="rounded-md p-1 text-destructive/70 transition hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {isLoading && (
          <li className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading providers…
          </li>
        )}

        {/* Google Meet */}
        <li className="flex items-center gap-3 bg-background p-3">
          <span className="text-base leading-none">🟢</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Google Meet</p>
            <p className="text-[11px] text-muted-foreground">
              {meet?.connected
                ? "Auto-enabled with Google Calendar"
                : "Connect your Google Calendar to enable Google Meet"}
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              meet?.connected ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            {meet?.connected ? "Active" : "Inactive"}
          </span>
        </li>

        {/* Zoom */}
        <li className="flex items-center gap-3 bg-background p-3">
          <span className="text-base leading-none">🔵</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Zoom</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {zoom?.connected ? zoom.email || "Connected" : "Connect your Zoom account to generate links automatically"}
            </p>
          </div>
          {zoom?.connected ? (
            <button
              type="button"
              onClick={handleZoomDisconnect}
              disabled={zoomBusy !== null}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {zoomBusy === "disconnect" ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={handleZoomConnect}
              disabled={zoomBusy !== null}
              className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {zoomBusy === "connect" ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
              Connect Zoom account
            </button>
          )}
        </li>

        {/* Teams */}
        <li className="flex items-center gap-3 bg-background p-3">
          <span className="text-base leading-none">🟣</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Microsoft Teams</p>
            <p className="text-[11px] text-muted-foreground">
              {isOutlook
                ? "Auto-enabled with Outlook Calendar"
                : teams?.connected
                  ? "Connected"
                  : "Toggle on to attach Teams links to events"}
            </p>
          </div>
          <Toggle
            checked={isOutlook ? true : !!settings.teams_enabled}
            onChange={(v) => onPatch({ teams_enabled: v })}
          />
        </li>
      </ul>
    </div>
  );
}
