import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { CalendarProvider, IntegrationAvailability, IntegrationProvider } from "@/api/types";

export const integrationAvailabilityKey = ["integrationAvailability"] as const;

export function integrationProviderForCalendar(provider: CalendarProvider): IntegrationProvider {
  return provider === "outlook" ? "microsoft" : provider;
}

export function useIntegrationAvailability() {
  return useQuery({
    queryKey: integrationAvailabilityKey,
    queryFn: () => api.integrationAvailability(),
    staleTime: 60_000,
    retry: false,
  });
}

export function isIntegrationAvailable(
  availability: IntegrationAvailability | undefined,
  provider: IntegrationProvider,
): boolean {
  return availability?.[provider]?.available === true;
}
