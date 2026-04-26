import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogIn, LogOut, Calendar, Mail, Link as LinkIcon } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/hooks/useToast";
import type { CalendarProvider, Settings } from "@/api/types";

const PROVIDERS: Array<{
  value: CalendarProvider;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "google", label: "Google Calendar", hint: "Sign in with Google", icon: Calendar },
  { value: "outlook", label: "Microsoft Outlook", hint: "Sign in with Microsoft", icon: Mail },
  { value: "webcal", label: "WebCal / iCal URL", hint: "Read-only feed", icon: LinkIcon },
];

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export function WorkCalendarConnection({
  settings,
  onPatch,
}: {
  settings: Settings;
  onPatch: (patch: Partial<Settings>) => void;
}) {
  const qc = useQueryClient();
  const { data: status, isLoading } = useQuery({
    queryKey: ["auth"],
    queryFn: () => api.authStatus(),
  });

  const initialProvider: CalendarProvider =
    settings.calendar_provider ?? status?.provider ?? "google";
  const [provider, setProvider] = useState<CalendarProvider>(initialProvider);
  const [webcalUrl, setWebcalUrl] = useState(settings.webcal_url ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setProvider(settings.calendar_provider ?? status?.provider ?? "google");
  }, [settings.calendar_provider, status?.provider]);

  useEffect(() => {
    setWebcalUrl(settings.webcal_url ?? "");
  }, [settings.webcal_url]);

  const handleConnect = () => {
    onPatch({ calendar_provider: provider });
    if (provider === "webcal") {
      if (!webcalUrl.trim()) {
        toast.error("Enter a WebCal/iCal URL first");
        return;
      }
      onPatch({ webcal_url: webcalUrl.trim(), calendar_provider: "webcal" });
      toast.success("WebCal URL saved — remember to click Save changes");
      return;
    }
    window.location.href = api.authConnectUrl(provider);
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await api.authDisconnect();
      toast.success("Disconnected");
      qc.invalidateQueries({ queryKey: ["auth"] });
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setBusy(false);
    }
  };

  const connectedProviderLabel =
    PROVIDERS.find((p) => p.value === (status?.provider ?? provider))?.label ?? "Calendar";

  return (
    <div className="space-y-4">
      {/* Current connection */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex min-w-0 items-center gap-2">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                status?.connected ? "bg-success" : "bg-destructive"
              }`}
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {status?.connected
                ? `${connectedProviderLabel} — ${status.email || "connected"}`
                : "Not connected"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {status?.connected ? "Syncing in real time" : "Choose a provider below to connect"}
            </p>
          </div>
        </div>
        {status?.connected && (
          <button
            onClick={handleDisconnect}
            disabled={busy}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
            Disconnect
          </button>
        )}
      </div>

      {/* Provider picker */}
      <div role="radiogroup" aria-label="Calendar provider" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {PROVIDERS.map((p) => {
          const Icon = p.icon;
          const selected = provider === p.value;
          return (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setProvider(p.value)}
              className={`flex items-start gap-2 rounded-xl border p-3 text-left transition ${
                selected
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-border bg-background hover:bg-muted/50"
              }`}
            >
              <Icon className="mt-0.5 h-4 w-4 text-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">{p.label}</p>
                <p className="text-[11px] text-muted-foreground">{p.hint}</p>
              </div>
            </button>
          );
        })}
      </div>

      {provider === "webcal" && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">WebCal URL</span>
          <input
            type="url"
            value={webcalUrl}
            onChange={(e) => setWebcalUrl(e.target.value)}
            placeholder="webcal://example.com/calendar.ics"
            className={inputCls}
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Saved with the rest of your settings.
          </span>
        </label>
      )}

      <button
        onClick={handleConnect}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
      >
        <LogIn className="h-3 w-3" />
        {provider === "webcal" ? "Save WebCal URL" : `Connect ${PROVIDERS.find((p) => p.value === provider)?.label}`}
      </button>
    </div>
  );
}
