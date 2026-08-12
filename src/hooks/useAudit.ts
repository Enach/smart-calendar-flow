import { useQuery } from "@tanstack/react-query";

import { api, DEFAULT_AUDIT_LIMIT } from "@/api/client";
import type { AuditEntry } from "@/api/types";

export const auditKeys = {
  all: ["audit"] as const,
  list: (limit: number) => ["audit", limit] as const,
};

/**
 * Audit log list. Uses the frozen `GET /api/audit?limit=` contract through the
 * shared API client. Previously loaded data is kept while a refetch is in
 * flight or when a refetch fails, so a transient error never blanks the list.
 */
export function useAudit(limit: number = DEFAULT_AUDIT_LIMIT, enabled = true) {
  return useQuery<AuditEntry[]>({
    queryKey: auditKeys.list(limit),
    queryFn: () => api.getAudit(limit),
    enabled,
    placeholderData: (prev) => prev,
  });
}
