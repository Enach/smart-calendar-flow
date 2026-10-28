import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  chooseOrganizationAIChoice,
  confirmOrganizationAI,
  fetchOrganizationAI,
  patchOrganizationAI,
  type OrganizationAIConsentResult,
} from "@/api/client";
import type { OrganizationAIConfiguration, OrganizationAIConfigurationUpdate } from "@/api/types";

// PAC-73 Part 2: the organisation's AI configuration (read by every member,
// changed by a proven administrator, confirmed by each member).

export const ORG_AI_QUERY_KEY = ["organization-ai"] as const;

/** The organisation's AI configuration; only fetched for a member. */
export function useOrganizationAI(enabled: boolean) {
  return useQuery({ queryKey: ORG_AI_QUERY_KEY, queryFn: fetchOrganizationAI, enabled, retry: false, staleTime: 30_000 });
}

/** The outcome of confirming, after the optional "Use my organisation's AI" write. */
export type OrganizationConsentOutcome = OrganizationAIConsentResult;

/**
 * Confirms the version the user was shown; when `choose` is set, then chooses
 * "Use my organisation's AI" (the confirmation first, so the choice never
 * runs unconfirmed). A conflict shows the current configuration instead.
 */
export function useConfirmOrganizationAI() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ version, choose }: { version: number; choose: boolean }): Promise<OrganizationConsentOutcome> => {
      const res = await confirmOrganizationAI(version);
      if (res.kind === "confirmed" && choose) {
        const saved = await chooseOrganizationAIChoice();
        qc.setQueryData(["settings"], saved);
      }
      return res;
    },
    onSuccess: (res) => {
      if (res.kind === "conflict") qc.setQueryData<OrganizationAIConfiguration>(ORG_AI_QUERY_KEY, res.configuration);
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

/** An administrator's change; the configuration shown follows the answer. */
export function usePatchOrganizationAI() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OrganizationAIConfigurationUpdate) => patchOrganizationAI(body),
    onSuccess: (res) => {
      if (res.kind === "saved" || res.kind === "conflict") {
        qc.setQueryData<OrganizationAIConfiguration>(ORG_AI_QUERY_KEY, res.configuration);
      }
      if (res.kind === "saved") void qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}
