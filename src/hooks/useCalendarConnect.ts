import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { api, apiErrorMessage, type ConnectProvider } from "@/api/client";
import { effectOf, type OperationKey } from "@/api/effects";
import { isDemoSession } from "@/api/demoGate";
import { toast } from "@/hooks/useToast";

export interface CalendarConnectOptions {
  /**
   * The control changes the work calendar (the Settings work-calendar control,
   * the onboarding calendar step). The choice is saved first, and only it
   * (PATCH /api/settings `{ calendarProvider }`); the connect starts only once
   * that save succeeded. The connect itself never sets the work calendar
   * (PAC-71 spec §3, AC-12), so a choice not saved here would be lost.
   */
  setWorkCalendar?: boolean;
}

/** Shown instead of a connect in a demo session (non-production builds only). */
export const DEMO_CONNECT_UNAVAILABLE = "Connecting a calendar is not available in the demo.";

/**
 * PAC-71: the one way a signed-in control connects a calendar. It POSTs the
 * connect start and sends the window to the provider's authorize_url that the
 * server answered (spec §3 "Connecting a calendar", AC-32). It never navigates
 * to a GET start: those are the public sign-in. A failure is shown, and the
 * user stays where they are. Resolves to true when the window is leaving for
 * the provider.
 */
export function useCalendarConnect() {
  const qc = useQueryClient();
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(
    async (provider: ConnectProvider = "google", options: CalendarConnectOptions = {}): Promise<boolean> => {
      // PAC-83: a demo session has no server session, so a connect (or the
      // work-calendar save before it) would only reach the real server and be
      // refused. Nothing is sent; the user is told instead. The literal build
      // flag drops this branch from production builds.
      if (__PACEDAY_DEMO_BUILD__ && isDemoSession()) {
        toast.info(DEMO_CONNECT_UNAVAILABLE);
        return false;
      }
      setConnecting(true);
      // PAC-83: the failure is worded by the effect of the step that failed.
      let step: OperationKey = "api.saveWorkCalendar";
      try {
        if (options.setWorkCalendar) {
          const saved = await api.saveWorkCalendar(provider);
          qc.setQueryData(["settings"], saved);
        }
        step = "api.startConnect";
        const url = await api.startConnect(provider);
        // Stay "connecting" while the browser leaves for the provider.
        window.location.href = url;
        return true;
      } catch (e) {
        toast.error(apiErrorMessage(e, effectOf(step)));
        setConnecting(false);
        return false;
      }
    },
    [qc],
  );

  return { connect, connecting };
}
