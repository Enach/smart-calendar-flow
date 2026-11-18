import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  apiErrorMessage,
  CALENDAR_DISCONNECT_UNAVAILABLE_MESSAGE,
  canDisconnectCalendar,
  isCalendarDisconnectUnsupported,
} from "@/api/client";
import { AlertCircle, Loader2, LogIn, LogOut, Link2, RotateCcw } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { useState } from "react";
import { useCalendarConnect } from "@/hooks/useCalendarConnect";
import { effectOf } from "@/api/effects";
import { ApiErrorText } from "@/components/ApiErrorNotice";

export function ConnectionStatus({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["auth"],
    queryFn: () => api.authStatus(),
  });
  // PAC-122 SF-055: an unread status is not "Not connected".
  const statusUnknown = isError && !data;
  const [busy, setBusy] = useState(false);
  // PAC-71: a connect is a signed-in POST, never the sign-in start.
  const { connect, connecting } = useCalendarConnect();

  const handleConnect = () => {
    void connect("google");
  };
  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await api.authDisconnect();
      toast.success("Disconnected from Google Calendar");
      qc.invalidateQueries({ queryKey: ["auth"] });
    } catch (e) {
      if (isCalendarDisconnectUnsupported(e)) {
        // The calendar is not Google after all (a stale status): nothing was
        // disconnected. Say so and re-read the status (PAC-35).
        toast.error(CALENDAR_DISCONNECT_UNAVAILABLE_MESSAGE);
        qc.invalidateQueries({ queryKey: ["auth"] });
      } else {
        toast.error(apiErrorMessage(e, effectOf("api.authDisconnect")));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-xl border border-border bg-card ${compact ? "p-3" : "p-4"}`}>
      {!compact && (
        <div className="mb-3 flex items-center gap-2">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Calendar
          </h3>
        </div>
      )}
      {statusUnknown ? (
        <div className="flex items-start justify-between gap-3">
          <div role="alert" data-testid="calendar-status-error" className="flex min-w-0 items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Could not check your calendar connection.</p>
              <p className="text-[11px] text-muted-foreground">
                <ApiErrorText error={error} effect={effectOf("api.authStatus")} />
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            Try again
          </button>
        </div>
      ) : (
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              {data?.connected && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/50" />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  data?.connected ? "bg-success" : "bg-destructive"
                }`}
              />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {data?.connected ? data.email || "Connected" : "Not connected"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {data?.connected ? "Syncing in real time" : "Connect to enable scheduling"}
            </p>
          </div>
        </div>
        {data?.connected && !canDisconnectCalendar(data.provider) ? (
          <p className="max-w-[12rem] shrink-0 text-right text-[11px] text-muted-foreground">
            {CALENDAR_DISCONNECT_UNAVAILABLE_MESSAGE}
          </p>
        ) : data?.connected ? (
          <button
            onClick={handleDisconnect}
            disabled={busy}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {connecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
            Connect
          </button>
        )}
      </div>
      )}
    </div>
  );
}
