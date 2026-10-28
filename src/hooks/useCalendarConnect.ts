import { useCallback, useState } from "react";

import { api, apiErrorMessage, type ConnectProvider } from "@/api/client";
import { toast } from "@/hooks/useToast";

/**
 * PAC-71: the one way a signed-in control connects a calendar. It POSTs the
 * connect start and sends the window to the provider's authorize_url that the
 * server answered (spec §3 "Connecting a calendar", AC-32). It never navigates
 * to a GET start: those are the public sign-in. A failure is shown, and the
 * user stays where they are.
 */
export function useCalendarConnect() {
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(async (provider: ConnectProvider = "google") => {
    setConnecting(true);
    try {
      const url = await api.startConnect(provider);
      // Stay "connecting" while the browser leaves for the provider.
      window.location.href = url;
    } catch (e) {
      toast.error(apiErrorMessage(e));
      setConnecting(false);
    }
  }, []);

  return { connect, connecting };
}
