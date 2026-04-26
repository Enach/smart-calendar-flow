import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpinnerProps {
  /** Optional label rendered next to the spinner */
  label?: string;
  /** Size variant — defaults to `sm` (h-4) */
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLS: Record<NonNullable<SpinnerProps["size"]>, string> = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

export function Spinner({ label, size = "sm", className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("inline-flex items-center gap-2 text-muted-foreground", className)}
    >
      <Loader2 className={cn("animate-spin", SIZE_CLS[size])} />
      {label && <span className="text-xs font-medium">{label}</span>}
      {!label && <span className="sr-only">Loading…</span>}
    </span>
  );
}

/**
 * Full-bleed translucent overlay — drops over a positioned container while
 * data is refetching in the background. Keep the container as `relative`.
 */
export function LoadingOverlay({ label = "Loading…", show }: { label?: string; show: boolean }) {
  if (!show) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-card/60 backdrop-blur-[1px] transition-opacity"
    >
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-sm">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <span className="text-xs font-medium text-foreground">{label}</span>
      </div>
    </div>
  );
}

/**
 * Reusable skeleton bar — used by list/agenda placeholders while data loads.
 */
export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}
