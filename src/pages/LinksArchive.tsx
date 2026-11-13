import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Archive, CalendarDays } from "lucide-react";

import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { ApiErrorNotice } from "@/components/ApiErrorNotice";
import { ArchiveUnavailable } from "@/components/links/ArchiveUnavailable";
import { ArchivedLinkDialog } from "@/components/links/ArchivedLinkDialog";
import { formatArchiveDate } from "@/components/links/ArchiveFormat";
import { classifyApiFailure } from "@/api/client";
import { publicBookingDisplayUrl, schedulingLinkKeys, schedulingLinksApi } from "@/api/schedulingLinks";
import type { ArchivedSchedulingLink, BookerErasurePolicy } from "@/api/types";

/**
 * What the archive says about a link's bookers' names and emails. A date is
 * shown only when it is a fact (erased_at) or a server-given due instant with
 * erasure enabled; with erasure disabled (PAC-40 part A) nothing is promised.
 */
function ErasureLine({ link, policy }: { link: ArchivedSchedulingLink; policy: BookerErasurePolicy }) {
  let text: string | null = null;
  if (link.erasure_state === "no_bookings") {
    text = policy.enabled ? "No bookings, so nothing to erase" : null;
  } else if (link.erasure_state === "erased") {
    text = link.erased_at ? `Bookers’ names and emails erased on ${formatArchiveDate(link.erased_at)}` : "Bookers’ names and emails erased";
  } else if (policy.enabled && link.erasure_due_at) {
    text = `Bookers’ names and emails will be erased on ${formatArchiveDate(link.erasure_due_at)}`;
  } else if (link.erased_at) {
    text = `Earlier bookers’ names and emails erased on ${formatArchiveDate(link.erased_at)}`;
  }
  if (!text) return null;
  return (
    <p data-testid="archive-erasure" className="text-xs text-foreground">
      {text}
    </p>
  );
}

function ArchiveRow({
  link,
  policy,
  onView,
}: {
  link: ArchivedSchedulingLink;
  policy: BookerErasurePolicy;
  onView: (link: ArchivedSchedulingLink) => void;
}) {
  const count = link.bookings_count;
  return (
    <li
      data-testid={`archive-row-${link.slug}`}
      data-erasure-state={link.erasure_state}
      className="rounded-xl border border-border bg-card p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="font-serif text-lg leading-snug text-foreground">{link.title}</h2>
          <p className="truncate font-mono text-xs text-muted-foreground">{publicBookingDisplayUrl(link.slug)}</p>
          <p className="text-xs text-foreground">
            Deleted {formatArchiveDate(link.deleted_at)} · {count} {count === 1 ? "booking" : "bookings"}
          </p>
          <ErasureLine link={link} policy={policy} />
        </div>
        <Button
          size="sm"
          variant="outline"
          data-testid="archive-view-bookings"
          onClick={() => onView(link)}
          aria-label={`View bookings of ${link.title}`}
          className="shrink-0"
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> View bookings
        </Button>
      </div>
    </li>
  );
}

/**
 * PAC-40 (spec section 3.2, contract section 2.1): the owner's archive of the
 * links they deleted, most recently deleted first. Read only: viewing a link's
 * bookings is the one action; nothing edits, resumes, restores or deletes.
 */
export default function LinksArchivePage() {
  const [viewing, setViewing] = useState<ArchivedSchedulingLink | null>(null);
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: schedulingLinkKeys.archive,
    queryFn: () => schedulingLinksApi.listArchive(),
  });

  const kind = error ? classifyApiFailure(error) : null;
  // PAC-83: a lost answer or an expired budget keeps its own notice and retry.
  // Every other failure (any non-200, or a body that fails the schema, K4-7)
  // is "archive unavailable": nothing from the archive is shown.
  const transport = kind === "lost" || kind === "budget";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main data-testid="archive-page" className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          to="/app/links"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Booking links
        </Link>
        <header className="mb-6 mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Scheduling</p>
          <h1 className="mt-2 font-serif text-3xl text-foreground sm:text-4xl">Deleted links</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            The links you deleted and their bookings. Only you can see them. Nothing here can be edited, resumed or
            restored.
          </p>
        </header>

        {error && transport && (
          <ApiErrorNotice error={error} effect="read" onRetry={() => refetch()} retrying={isFetching} />
        )}
        {error && !transport && kind !== "cancelled" && (
          <ArchiveUnavailable onRetry={() => refetch()} retrying={isFetching} />
        )}

        {isLoading && (
          <div className="space-y-3" aria-hidden="true">
            {[0, 1].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
            ))}
          </div>
        )}

        {data && !error && data.links.length === 0 && (
          <div data-testid="archive-empty" className="rounded-2xl border border-dashed border-border px-8 py-12 text-center">
            <Archive className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm text-foreground">You haven’t deleted any links.</p>
          </div>
        )}

        {data && !error && data.links.length > 0 && (
          <ul data-testid="archive-list" className="space-y-3">
            {data.links.map((link) => (
              <ArchiveRow key={link.id} link={link} policy={data.booker_erasure} onView={setViewing} />
            ))}
          </ul>
        )}
      </main>

      <ArchivedLinkDialog link={viewing} onOpenChange={(open) => !open && setViewing(null)} />
    </div>
  );
}
