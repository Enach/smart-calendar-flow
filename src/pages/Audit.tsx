import { AlertCircle, Loader2, RefreshCw, ScrollText } from "lucide-react";

import { Navbar } from "@/components/Navbar";
import { MockBanner } from "@/components/MockBanner";
import { apiErrorMessage, DEFAULT_AUDIT_LIMIT } from "@/api/client";
import { useAudit } from "@/hooks/useAudit";

function formatTimestamp(iso: string) {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AuditPage() {
  const { data, isLoading, isFetching, error, refetch } = useAudit(DEFAULT_AUDIT_LIMIT);
  const entries = data ?? [];
  const hasCached = entries.length > 0;

  return (
    <div className="min-h-screen bg-muted/30">
      <MockBanner />
      <Navbar />
      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
              <ScrollText className="h-5 w-5 text-muted-foreground" />
              Audit log
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              The last {DEFAULT_AUDIT_LIMIT} actions Paceday performed on your calendar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Couldn’t load the audit log</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{apiErrorMessage(error)}</p>
              {hasCached && (
                <p className="mt-1 text-xs text-muted-foreground">Showing the last entries loaded successfully.</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        )}

        <section className="rounded-2xl border border-border bg-card p-2 shadow-sm sm:p-3">
          {isLoading && !hasCached && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading activity…
            </div>
          )}

          {!isLoading && !error && entries.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <ScrollText className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground">
                Actions like scheduling, focus runs and calendar syncs will appear here.
              </p>
            </div>
          )}

          {entries.length > 0 && (
            <ul className="divide-y divide-border">
              {entries.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground sm:w-44">
                    {formatTimestamp(entry.created_at)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{entry.action}</p>
                    {entry.details && (
                      <p className="mt-0.5 break-words text-xs text-muted-foreground">{entry.details}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
