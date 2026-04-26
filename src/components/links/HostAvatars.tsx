import { Clock } from "lucide-react";
import type { SchedulingHost } from "@/api/types";

interface HostAvatarsProps {
  hosts: Array<Pick<SchedulingHost, "email" | "name" | "avatar_url"> & Partial<Pick<SchedulingHost, "is_owner" | "status">>>;
  size?: "sm" | "md" | "lg";
  /** Visual overlap (negative margin) — useful for the public booking page header. */
  overlap?: boolean;
  /** Show a clock icon ring around pending co-hosts. */
  showPending?: boolean;
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
  "bg-[#5B7FFF]/15 text-[#5B7FFF]",
  "bg-[#E9B949]/20 text-[#7A5A0F]",
  "bg-[#9B7AE0]/20 text-[#5C3DA1]",
  "bg-[#5FC9A6]/20 text-[#1F7A5C]",
  "bg-[#E35D5D]/15 text-[#A33333]",
];

function paletteFor(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n + seed.charCodeAt(i)) % PALETTE.length;
  return PALETTE[n];
}

export function HostAvatars({ hosts, size = "sm", overlap = false, showPending = true }: HostAvatarsProps) {
  if (!hosts.length) return null;
  return (
    <div className="flex items-center">
      {hosts.map((h, i) => {
        const pending = showPending && h.status === "pending";
        return (
          <div
            key={h.email + i}
            className={`group relative ${overlap && i > 0 ? "-ml-2" : i > 0 ? "ml-1" : ""}`}
            title={pending ? `${h.name || h.email} — awaiting acceptance` : h.name || h.email}
          >
            <div
              className={`flex items-center justify-center rounded-full font-semibold ring-2 ring-card ${SIZE[size]} ${paletteFor(h.email)} ${
                pending ? "opacity-70 ring-muted-foreground/30 grayscale-[40%]" : ""
              }`}
            >
              {h.avatar_url ? (
                <img src={h.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                initials(h.name, h.email)
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
