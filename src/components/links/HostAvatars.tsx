import { Clock, User } from "lucide-react";
import type { SchedulingHost } from "@/api/types";

interface HostAvatarsProps {
  hosts: Array<Pick<SchedulingHost, "email" | "name" | "avatar_url"> & Partial<Pick<SchedulingHost, "is_owner" | "status">>>;
  size?: "sm" | "md" | "lg";
  /** Visual overlap (negative margin) — useful for the public booking page header. */
  overlap?: boolean;
  /** Show a clock icon ring around pending co-hosts. */
  showPending?: boolean;
  /**
   * Who is reading. "owner" is the signed-in owner's own screens, where a
   * host's address is theirs to see. "public" is the unauthenticated booking
   * page: 2026-11-22 audit, finding 4 — `/book/:slug` is guessable, so nothing
   * rendered there may name a host by address. Defaults to "owner".
   */
  audience?: "owner" | "public";
}

const SIZE: Record<NonNullable<HostAvatarsProps["size"]>, string> = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-11 w-11 text-sm",
};

function initials(name?: string, email?: string): string {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
}

const PALETTE = [
  "bg-primary/15 text-primary",
  "bg-[#E9B949]/20 text-[#7A5A0F]",
  "bg-ai/20 text-[#5C3DA1]",
  "bg-success/20 text-[#1F7A5C]",
  "bg-destructive/15 text-[#A33333]",
];

/**
 * A host's colour comes from its position in the list, not from its address.
 * `PublicHost` carries no id (`src/api/generated/schemas.types.d.ts`: email,
 * name, avatar_url), so position is the only stable discriminator the public
 * booking page has — and unlike the address it is not identifying data, and it
 * survives the address leaving the DTO. The cost is that the colours follow
 * positions rather than people: a host whose rank in the response changes gets
 * a different colour. An opaque host id in the DTO would fix that properly.
 */
function paletteFor(index: number) {
  return PALETTE[index % PALETTE.length];
}

export function HostAvatars({ hosts, size = "sm", overlap = false, showPending = true, audience = "owner" }: HostAvatarsProps) {
  if (!hosts.length) return null;
  return (
    <div className="flex items-center">
      {hosts.map((h, i) => {
        const pending = showPending && h.status === "pending";
        // PAC-149 (spec §3.4, D-6, §3.7): pending and declined entries are shown
        // by address and status only — never a name or picture, even if one
        // were sent — so what the owner sees does not depend on accounts.
        // `pending` drives only the clock ring and the "awaiting" wording.
        const byAddressOnly = h.status === "pending" || h.status === "declined";
        // 2026-11-22 audit, finding 4: on the public booking page a host is
        // named by display name only. With no name it is a nameless host —
        // never an address, and never initials read off one.
        const isPublic = audience === "public";
        const nameless = isPublic && !h.name?.trim();
        const label = isPublic ? h.name?.trim() || "Host" : byAddressOnly ? h.email : h.name || h.email;
        return (
          <div
            // The list key is positional for the same reason as the colour: a
            // host has no id, and the address is not an identity. Nothing here
            // holds state of its own — no input, no uncontrolled node — so a
            // positional key only means React updates a chip in place instead
            // of remounting it.
            key={i}
            className={`group relative ${overlap && i > 0 ? "-ml-2" : i > 0 ? "ml-1" : ""}`}
            title={pending ? `${label} — awaiting acceptance` : label}
          >
            <div
              className={`flex items-center justify-center rounded-full font-semibold ring-2 ring-card ${SIZE[size]} ${paletteFor(i)} ${
                pending ? "opacity-70 ring-muted-foreground/30 grayscale-[40%]" : ""
              }`}
            >
              {h.avatar_url && !byAddressOnly ? (
                <img src={h.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
              ) : nameless ? (
                <User className="h-1/2 w-1/2" aria-hidden="true" />
              ) : (
                initials(byAddressOnly ? undefined : h.name, isPublic ? undefined : h.email)
              )}
            </div>
            {pending && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
                <Clock className="h-2.5 w-2.5" />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
