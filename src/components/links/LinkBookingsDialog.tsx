import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, Loader2, RotateCcw } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { schedulingLinkKeys, schedulingLinksApi } from "@/api/schedulingLinks";
import { apiErrorMessage } from "@/api/client";
import type { SchedulingLink } from "@/api/types";

interface LinkBookingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: SchedulingLink | null;
}

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const date = start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time(start)} – ${time(end)}`;
}

export function LinkBookingsDialog({ open, onOpenChange, link }: LinkBookingsDialogProps) {
  const {
    data: bookings = [],
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: schedulingLinkKeys.bookings(link?.id ?? ""),
    queryFn: () => schedulingLinksApi.listBookings(link!.id),
    enabled: open && !!link,
    // Keep the last successful list visible if a refetch fails.
    placeholderData: (prev) => prev,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="font-serif text-xl">Bookings</DialogTitle>
          <DialogDescription>{link ? link.title : ""}</DialogDescription>
        </DialogHeader>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="min-w-0 flex-1 text-sm text-destructive/90">{apiErrorMessage(error)}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="shrink-0">
              <RotateCcw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        )}

        {isLoading && !bookings.length && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading bookings…
          </p>
        )}

        {!isLoading && !error && !bookings.length && (
          <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No bookings on this link yet.</p>
          </div>
        )}

        {bookings.length > 0 && (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
            {bookings.map((b) => (
              <li key={b.id} className="rounded-lg border border-border bg-card px-3 py-2">
                <p className="text-sm font-medium text-foreground">{formatRange(b.start, b.end)}</p>
                <p className="text-xs text-muted-foreground">
                  {b.booker_name} · {b.booker_email} · {b.duration_minutes} min
                </p>
                {b.notes && <p className="mt-1 text-xs text-muted-foreground">{b.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
