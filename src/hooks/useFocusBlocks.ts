import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

export function useFocusBlocks(weekISO: string) {
  return useQuery({
    queryKey: ["focusBlocks", weekISO],
    queryFn: () => api.getFocusBlocks(weekISO),
    staleTime: 30_000,
  });
}
