import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Pencil, Trash2, Copy, Check, Plus, LogOut, Sparkles, Hourglass, Infinity as InfinityIcon, Repeat, Zap, AlertCircle, RotateCcw } from "lucide-react";

import { Navbar } from "@/components/Navbar";
import { DemoBanner } from "@/components/DemoBanner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { HostAvatars } from "@/components/links/HostAvatars";
import { LinkEditDrawer } from "@/components/links/LinkEditDrawer";
import { schedulingLinkKeys, schedulingLinksApi, publicBookingUrl } from "@/api/schedulingLinks";
import { apiErrorMessage } from "@/api/client";
import { toast } from "@/hooks/useToast";
import type { SchedulingLink } from "@/api/types";

function publicUrlFor(slug: string) {
  return publicBookingUrl(slug);
}


function CopyButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(publicUrlFor(slug));
          setCopied(true);
          toast.success("Link copied");
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Could not copy");
        }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function DurationBadges({ durations }: { durations: number[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {durations.map((d) => (
        <span
          key={d}
          className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground"
        >
          {d} min
        </span>
      ))}
    </div>
  );
}

function formatNotice(min: number): string {
  if (!min) return "No minimum notice";
  if (min < 60) return `${min} min notice`;
  if (min < 1440) {
    const h = Math.round(min / 60);
    return `${h} hour${h === 1 ? "" : "s"} notice`;
  }
  const d = Math.round(min / 1440);
  return `${d} day${d === 1 ? "" : "s"} notice`;
}

function UsageBadge({ link }: { link: SchedulingLink }) {
  if (link.usage_type === "single_use") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#9B7AE0]/30 bg-[#9B7AE0]/10 px-2 py-0.5 text-[11px] font-medium text-[#5C3DA1]">
        <Zap className="h-3 w-3" /> Single use
      </span>
    );
  }
  if (link.usage_type === "recurring") {
    const left = link.max_uses ? Math.max(0, link.max_uses - link.uses_count) : null;
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#5B7FFF]/30 bg-[#5B7FFF]/10 px-2 py-0.5 text-[11px] font-medium text-[#3a5cd9]">
        <Repeat className="h-3 w-3" />
        {link.max_uses
          ? `${link.uses_count}/${link.max_uses} used${left === 0 ? " · ended" : ""}`
          : "Recurring"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <InfinityIcon className="h-3 w-3" /> Reusable
    </span>
  );
}

function LinkCard({
  link,
  onEdit,
  onDelete,
  onLeave,
  onToggleActive,
}: {
  link: SchedulingLink;
  onEdit?: (link: SchedulingLink) => void;
  onDelete?: (link: SchedulingLink) => void;
  onLeave?: (link: SchedulingLink) => void;
  onToggleActive?: (link: SchedulingLink, active: boolean) => void;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-foreground/15">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 className="font-serif text-lg leading-snug text-foreground">{link.title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate font-mono">paceday.com/book/{link.slug}</span>
              <CopyButton slug={link.slug} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DurationBadges durations={link.durations} />
            <UsageBadge link={link} />
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Hourglass className="h-3 w-3" />
              {formatNotice(link.min_notice_minutes)}
            </span>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <HostAvatars hosts={link.hosts} size="sm" />
            <span className="text-xs text-muted-foreground">
              {link.hosts.length} {link.hosts.length === 1 ? "host" : "hosts"}
              {link.hosts.some((h) => h.status === "pending") && " · awaiting acceptance"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:flex-col sm:items-end">
          {link.is_owner && onToggleActive && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{link.active ? "Active" : "Paused"}</span>
              <Switch
                checked={link.active}
                onCheckedChange={(v) => onToggleActive(link, v)}
                aria-label="Toggle active"
              />
            </div>
          )}
          <div className="flex items-center gap-1">
            {link.is_owner ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => onEdit?.(link)} aria-label="Edit">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete?.(link)}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onLeave?.(link)}
                className="text-muted-foreground"
              >
                <LogOut className="h-3.5 w-3.5" /> Leave
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function InviteBanner({
  onAccept,
  onDecline,
}: {
  onAccept: (linkId: string) => void;
  onDecline: (linkId: string) => void;
}) {
  const { data: invites = [] } = useQuery({
    queryKey: ["scheduling-link-invites"],
    queryFn: () => schedulingLinksApi.listInvites(),
  });

  if (!invites.length) return null;

  return (
    <div className="space-y-2">
      {invites.map((inv) => (
        <div
          key={inv.link_id}
          className="flex flex-col gap-3 rounded-xl border border-[#E9B949]/40 bg-[#E9B949]/15 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-[#3a2e0a]">
            <span className="font-semibold">{inv.owner_name}</span> added you to the scheduling link{" "}
            <span className="font-semibold">"{inv.link_title}"</span>. Accept to share your availability.
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDecline(inv.link_id)}
              className="border-[#3a2e0a]/20 bg-transparent text-[#3a2e0a] hover:bg-[#3a2e0a]/5"
            >
              Decline
            </Button>
            <Button size="sm" onClick={() => onAccept(inv.link_id)}>
              Accept
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 px-8 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-muted text-primary">
        <Link2 className="h-7 w-7" />
      </div>
      <h3 className="mt-5 font-serif text-2xl text-foreground">Share your availability — no back-and-forth</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Create a public booking link. People pick a time that works for everyone, and the meeting lands on your
        calendar.
      </p>
      <Button onClick={onCreate} className="mt-6">
        <Sparkles className="h-4 w-4" /> Create your first link
      </Button>
    </div>
  );
}

export default function LinksPage() {
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<SchedulingLink | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["scheduling-links"],
    queryFn: () => schedulingLinksApi.listLinks(),
  });

  const owned = useMemo(() => data?.owned ?? [], [data]);
  const shared = useMemo(() => data?.shared ?? [], [data]);

  const acceptInvite = useMutation({
    mutationFn: (linkId: string) => schedulingLinksApi.acceptInvite(linkId),
    onSuccess: () => {
      toast.success("Invite accepted");
      qc.invalidateQueries({ queryKey: ["scheduling-link-invites"] });
      qc.invalidateQueries({ queryKey: ["scheduling-links"] });
    },
    onError: () => toast.error("Could not accept invite"),
  });

  const declineInvite = useMutation({
    mutationFn: (linkId: string) => schedulingLinksApi.declineInvite(linkId),
    onSuccess: () => {
      toast.info("Invite declined");
      qc.invalidateQueries({ queryKey: ["scheduling-link-invites"] });
    },
    onError: () => toast.error("Could not decline invite"),
  });

  const deleteLink = useMutation({
    mutationFn: (id: string) => schedulingLinksApi.deleteLink(id),
    onSuccess: () => {
      toast.info("Link deleted");
      qc.invalidateQueries({ queryKey: ["scheduling-links"] });
    },
    onError: () => toast.error("Could not delete link"),
  });

  const leaveLink = useMutation({
    mutationFn: (id: string) => schedulingLinksApi.leaveLink(id),
    onSuccess: () => {
      toast.info("You left the link");
      qc.invalidateQueries({ queryKey: ["scheduling-links"] });
    },
    onError: () => toast.error("Could not leave the link"),
  });

  const updateLink = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      schedulingLinksApi.updateLink(id, { active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduling-links"] });
    },
    onError: () => toast.error("Could not update the link"),
  });

  function openCreate() {
    setEditingLink(null);
    setDrawerOpen(true);
  }
  function openEdit(link: SchedulingLink) {
    setEditingLink(link);
    setDrawerOpen(true);
  }

  function handleDelete(link: SchedulingLink) {
    if (confirm(`Delete "${link.title}"? People with this link will no longer be able to book.`)) {
      deleteLink.mutate(link.id);
    }
  }
  function handleLeave(link: SchedulingLink) {
    if (confirm(`Leave "${link.title}"? Your availability will no longer be combined into this link.`)) {
      leaveLink.mutate(link.id);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DemoBanner />

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Scheduling
            </p>
            <h1 className="mt-2 font-serif text-3xl text-foreground sm:text-4xl">Booking links</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Share a single URL. People book a time that works for you and any co-hosts you add.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> New link
          </Button>
        </header>

        <div className="mb-6">
          <InviteBanner
            onAccept={(id) => acceptInvite.mutate(id)}
            onDecline={(id) => declineInvite.mutate(id)}
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-card" />
            ))}
          </div>
        ) : owned.length === 0 && shared.length === 0 ? (
          <EmptyState onCreate={openCreate} />
        ) : (
          <div className="space-y-8">
            {owned.length > 0 && (
              <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Your links
                </h2>
                <div className="space-y-3">
                  {owned.map((l) => (
                    <LinkCard
                      key={l.id}
                      link={l}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                      onToggleActive={(link, active) => updateLink.mutate({ id: link.id, active })}
                    />
                  ))}
                </div>
              </section>
            )}
            {shared.length > 0 && (
              <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Shared with me
                </h2>
                <div className="space-y-3">
                  {shared.map((l) => (
                    <LinkCard key={l.id} link={l} onLeave={handleLeave} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      <LinkEditDrawer open={drawerOpen} onOpenChange={setDrawerOpen} link={editingLink} />
    </div>
  );
}
