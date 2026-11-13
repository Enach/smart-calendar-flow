import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Settings } from "@/api/types";

export function useSettings(enabled = true) {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings(),
    staleTime: 60_000,
    enabled,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: Settings) => api.updateSettings(s, qc.getQueryData<Settings>(["settings"])),
    onSuccess: (s) => {
      qc.setQueryData(["settings"], s);
    },
  });
}
