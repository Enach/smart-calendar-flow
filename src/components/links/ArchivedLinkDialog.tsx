import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiErrorNotice } from "@/components/ApiErrorNotice";
import { ArchiveUnavailable } from "@/components/links/ArchiveUnavailable";
import { classifyApiFailure, isApiHttpError } from "@/api/client";
import { ArchiveUnavailableError, schedulingLinkKeys, schedulingLinksApi } from "@/api/schedulingLinks";
import type { ArchivedSchedulingLink, ArchivedSchedulingLinkBooking } from "@/api/types";
import { formatArchiveDate } from "@/components/links/ArchiveFormat";
import { useTimeFormat } from "@/contexts/TimeFormatContext";
import { formatTime, type TimeFormat } from "@/lib/timeFormat";

function formatRange(startIso: string, endIso: string, tf: TimeFormat): string {
  return `${formatArchiveDate(startIso)} · ${formatTime(new Date(startIso), tf)} – ${formatTime(new Date(endIso), tf)}`;
}

function statusLabel(status: string): string {
  return status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ") : "Unknown";
}

/**
 * One archived booking. An erased booker (contract section 2.2: null name and
 * email, `booker_erased_at` set) is shown as an explicit erased state, never
 * as a blank and never as the old value.
 */
function ArchivedBookingItem({ booking, tf }: { booking: ArchivedSchedulingLinkBooking; tf: TimeFormat }) {
  const erased = booking.booker_erased_at !== null || booking.booker_name === null || booking.booker_email === null;
  return (
    <li
      data-testid={`archive-booking-${booking.id}`}
      data-erased={erased ? "true" : "false"}
      className="rounded-lg border border-border bg-card px-3 py-2"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{formatRange(booking.start_time, booking.end_time, tf)}</p>
        <span data-testid="archive-booking-status" className="text-xs font-medium text-foreground">
          {statusLabel(booking.status)}
        </span>
      </div>
      {erased ? (
        <p data-testid="archive-booker-erased" className="mt-1 text-xs italic text-foreground">
          Name and email erased
          {booking.booker_erased_at ? ` on ${formatArchiveDate(booking.booker_erased_at)}` : ""}
        </p>
      ) : (
        <p data-testid="archive-booker" className="mt-1 text-xs text-foreground">
          <span data-testid="archive-booker-name">{booking.booker_name}</span>
          {" · "}
          <span data-testid="archive-booker-email">{booking.booker_email}</span>
        </p>
      )}
      {booking.notes && <p className="mt-1 text-xs text-muted-foreground">{booking.notes}</p>}
      <p className="mt-1 text-xs text-muted-foreground">Booked {formatArchiveDate(booking.created_at)}</p>
    </li>
  );
}

/**
 * PAC-40: one deleted link and every one of its bookings, read-only. The only
 * control is closing the dialog: nothing here edits, resumes, restores or
 * deletes anything (spec section 3.2).
 */
export function ArchivedLinkDialog({
  link,
  onOpenChange,
}: {
  link: ArchivedSchedulingLink | null;
  onOpenChange: (open: boolean) => void;
}) {
  const tf = useTimeFormat();
  const qc = useQueryClient();
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: schedulingLinkKeys.archivedLink(link?.id ?? ""),
    queryFn: () => schedulingLinksApi.getArchivedLink(link!.id),
    enabled: !!link,
  });

  const notFound = isApiHttpError(error) && error.status === 404;
  const kind = error ? classifyApiFailure(error) : null;
  // A transport failure (lost answer, budget) keeps PAC-83's notice and retry;
  // any other HTTP answer, or a body that fails the schema, is "unavailable".
  const transport = kind === "lost" || kind === "budget";
  const unavailable = !!error && !notFound && !transport && (error instanceof ArchiveUnavailableError || kind === "http");

  useEffect(() => {
    // The archive list named a link the server no longer has there: refresh it.
    if (notFound) qc.invalidateQueries({ queryKey: schedulingLinkKeys.archive, exact: true });
  }, [notFound, qc]);

  const bookings = data?.bookings ?? [];

  return (
    <Dialog open={!!link} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="archive-detail">
        <DialogHeader className="text-left">
          <DialogTitle className="font-serif text-xl">{link?.title ?? "Deleted link"}</DialogTitle>
          <DialogDescription>Bookings of this deleted link. Read only.</DialogDescription>
        </DialogHeader>

        {notFound && (
          <p data-testid="archive-detail-not-found" role="alert" className="text-sm text-foreground">
            This link is no longer in your archive.
          </p>
        )}
        {transport && <ApiErrorNotice error={error} effect="read" onRetry={() => refetch()} retrying={isFetching} />}
        {unavailable && (
          <ArchiveUnavailable testId="archive-detail-unavailable" onRetry={() => refetch()} retrying={isFetching} />
        )}

        {isLoading && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading bookings…
          </p>
        )}

        {data && !error && bookings.length === 0 && (
          <div data-testid="archive-bookings-empty" className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm text-foreground">This link had no bookings.</p>
          </div>
        )}

        {data && !error && bookings.length > 0 && (
          <ul data-testid="archive-bookings" className="max-h-[50vh] space-y-2 overflow-y-auto">
            {bookings.map((b) => (
              <ArchivedBookingItem key={b.id} booking={b} tf={tf} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
