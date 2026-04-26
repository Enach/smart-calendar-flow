import { Settings as SettingsIcon, ChevronLeft, ChevronRight, Link2, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";


interface NavbarProps {
  weekLabel?: string;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  onToday?: () => void;
  /** When false, render a "Today" jump-back button. When true, hide it. */
  todayInRange?: boolean;
  showSettingsLink?: boolean;
}

/** Paceday brand mark — abstract structured calendar blocks. */
function PacedayMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 22 22" className={className} aria-hidden="true">
      {/* outlined small block */}
      <rect x="0.5" y="0.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {/* mid stair */}
      <rect x="8" y="8" width="6" height="6" rx="1" fill="currentColor" />
      {/* top stair, outlined */}
      <rect x="15.5" y="0.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {/* base block */}
      <rect x="0.5" y="15.5" width="6" height="6" rx="1" fill="currentColor" />
      {/* accent square */}
      <rect x="15.5" y="15.5" width="6" height="6" rx="1" fill="hsl(var(--primary))" />
    </svg>
  );
}

export function Navbar({
  weekLabel,
  onPrevWeek,
  onNextWeek,
  onToday,
  todayInRange = true,
  showSettingsLink = true,
}: NavbarProps) {
  const { user, isDemo } = useAuth();
  const homeHref = user || isDemo ? "/app" : "/";
  const signedIn = Boolean(user || isDemo);
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link to={homeHref} className="flex items-center gap-2.5 text-foreground">
          <PacedayMark className="h-6 w-6 text-foreground" />
          <span className="font-serif text-lg leading-none tracking-tight">Paceday</span>
        </Link>

        {weekLabel && (
          <div className="hidden items-center gap-1 rounded-full border border-border bg-card px-1 py-1 sm:flex">
            <button
              onClick={onPrevWeek}
              className="rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {!todayInRange && (
              <button
                onClick={onToday}
                className="rounded-full px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
              >
                Today
              </button>
            )}
            <span className="px-2 text-xs font-medium text-muted-foreground">{weekLabel}</span>
            <button
              onClick={onNextWeek}
              className="rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1">
          {signedIn && (
            <Link
              to="/app/manager"
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">My Team</span>
            </Link>
          )}
          {signedIn && (
            <Link
              to="/app/links"
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Link2 className="h-4 w-4" />
              <span className="hidden sm:inline">Links</span>
            </Link>
          )}
          {showSettingsLink && (
            <Link
              to="/settings"
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <SettingsIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
