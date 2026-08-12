import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Play, Trash2, ScrollText, ChevronDown, Loader2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { api, apiErrorMessage } from "@/api/client";
import { useAudit } from "@/hooks/useAudit";
import { toast } from "@/hooks/useToast";

interface QuickActionsProps {
  weekISO: string;
  onScheduleMeeting?: () => void;
}

export function QuickActions({ weekISO, onScheduleMeeting }: QuickActionsProps) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  const audit = useAudit(10, showAudit);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["focusBlocks"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };

  const runFocus = async () => {
    setRunning(true);
    try {
      const res = await api.runFocus(weekISO);
      toast.success(`Created ${res.created_blocks.length} focus block${res.created_blocks.length === 1 ? "" : "s"}`);
      refreshAll();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setRunning(false);
    }
  };

  const clearFocus = async () => {
    if (!confirm("Clear all focus blocks for this week?")) return;
    setClearing(true);
    try {
      const { deleted } = await api.clearFocusBlocks(weekISO);
      toast.info(`Removed ${deleted} focus block${deleted === 1 ? "" : "s"}`);
      refreshAll();
    } catch {
      toast.error("Failed to clear focus blocks");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Quick actions
        </h3>
      </div>
      <div className="space-y-2">
        {onScheduleMeeting && (
          <button
            onClick={onScheduleMeeting}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary/40 hover:bg-primary-muted"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Schedule Meeting
            </span>
          </button>
        )}
        <button
          onClick={runFocus}
          disabled={running}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary/40 hover:bg-primary-muted disabled:opacity-50"
        >
          <span className="flex items-center gap-2">
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <Play className="h-3.5 w-3.5 text-primary" />
            )}
            Run Focus Engine
          </span>
        </button>
        <button
          onClick={clearFocus}
          disabled={clearing}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-destructive/40 hover:bg-destructive/5 disabled:opacity-50"
        >
          <span className="flex items-center gap-2">
            {clearing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-destructive" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            )}
            Clear Focus Blocks
          </span>
        </button>
        <button
          onClick={() => setShowAudit((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          <span className="flex items-center gap-2">
            <ScrollText className="h-3.5 w-3.5 text-muted-foreground" />
            Audit Log
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition ${showAudit ? "rotate-180" : ""}`} />
        </button>

        {showAudit && (
          <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-lg bg-muted/40 p-2">
            {audit.error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-[11px] text-muted-foreground">
                <p className="font-medium text-foreground">Couldn’t load activity</p>
                <p className="mt-0.5">{apiErrorMessage(audit.error)}</p>
                <button
                  onClick={() => void audit.refetch()}
                  className="mt-1 rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground transition hover:bg-muted"
                >
                  Retry
                </button>
              </div>
            )}
            {audit.isLoading && !audit.data && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">Loading…</p>
            )}
            {audit.data && audit.data.length === 0 && !audit.error && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">No activity yet.</p>
            )}
            {audit.data?.map((e) => (
              <div key={e.id} className="rounded-md bg-card px-2.5 py-1.5 text-xs shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{e.action}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(e.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="truncate text-[11px] text-muted-foreground">{e.details}</p>
              </div>
            ))}
            <Link
              to="/settings/audit"
              className="block rounded-md px-2 py-1.5 text-center text-[11px] font-medium text-primary transition hover:underline"
            >
              View full audit log
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
