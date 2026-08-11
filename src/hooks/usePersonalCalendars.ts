import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { PersonalCalendar, PersonalCalendarType } from "@/api/types";

export const personalCalendarsKey = ["personalCalendars"] as const;

export function usePersonalCalendars() {
  return useQuery({
    queryKey: personalCalendarsKey,
    queryFn: async () => {
      const data = await api.listPersonalCalendars();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
    // Keep the last successful list visible if a refetch fails.
    retry: false,
  });
}

export function useAddPersonalCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { type: PersonalCalendarType; label: string; url?: string }) =>
      api.addPersonalCalendar(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: personalCalendarsKey }),
  });
}

export function useUpdatePersonalCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<PersonalCalendar, "enabled" | "label">> }) =>
      api.updatePersonalCalendar(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: personalCalendarsKey }),
  });
}

export function useDeletePersonalCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deletePersonalCalendar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: personalCalendarsKey }),
  });
}

export function useSyncPersonalCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.syncPersonalCalendar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: personalCalendarsKey }),
  });
}
