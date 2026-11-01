import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { api, apiErrorMessage, type ConnectProvider } from "@/api/client";
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
      setConnecting(true);
      try {
        if (options.setWorkCalendar) {
          const saved = await api.saveWorkCalendar(provider);
          qc.setQueryData(["settings"], saved);
        }
        const url = await api.startConnect(provider);
        // Stay "connecting" while the browser leaves for the provider.
        window.location.href = url;
        return true;
      } catch (e) {
        toast.error(apiErrorMessage(e));
        setConnecting(false);
        return false;
      }
    },
    [qc],
  );

  return { connect, connecting };
}
