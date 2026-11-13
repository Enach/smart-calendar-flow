import type { ReactNode } from "react";
import { matchPath, useLocation } from "react-router-dom";

import { BOOKING_ROUTE_PATH, TOP_LEVEL_LINK_TARGET, isFramed } from "@/lib/framing";

/**
 * PAC-91 (contract section 3.3). Mounted inside BrowserRouter and above
 * AuthProvider. Decides on every render, synchronously: unframed, or framed on
 * the booking page, the app renders as usual; framed anywhere else, only the
 * notice renders. No effect and no state, so no route component, no session
 * probe and no redirect ever runs first (spec D-7); the location is read on
 * every render, so a client-side navigation away from the booking page is
 * caught too (AC-10).
 */
export function FrameGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  if (!isFramed() || matchPath(BOOKING_ROUTE_PATH, pathname)) return <>{children}</>;
  return <FrameNotice />;
}

function FrameNotice() {
  return (
    <main data-testid="frame-notice" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-3xl text-foreground">Open Paceday in its own window</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          For your security, this Paceday page can't be shown inside another website.
        </p>
        <a
          data-testid="frame-notice-open"
          href="/"
          target={TOP_LEVEL_LINK_TARGET}
          className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
        >
          Open Paceday
        </a>
      </div>
    </main>
  );
}
