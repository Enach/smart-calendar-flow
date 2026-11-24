import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  chooseOrganizationAIChoice,
  confirmOrganizationAI,
  fetchOrganizationAI,
  patchOrganizationAI,
  type OrganizationAIConsentResult,
} from "@/api/client";
import type { OrganizationAIConfiguration, OrganizationAIConfigurationUpdate } from "@/api/types";
import { nullIfNoOrganisation } from "@/lib/orgAI";

// PAC-73 Part 2: the organisation's AI configuration (read by every member,
// changed by a proven administrator, confirmed by each member).

export const ORG_AI_QUERY_KEY = ["organization-ai"] as const;

/**
 * The organisation's AI configuration; only fetched for a member. A caller
 * the server counts as a member of no organisation gets the membership 403,
 * whose answer here is `null`: there is no configuration to show (P2-AC-30).
 *
 * PAC-156: `null` is an answer, so it replaces a configuration read before
 * the membership ended, within this query's `staleTime` as well. Were the
 * 403 left as the query's error, React Query would keep that configuration
 * as `data` and the section would stay on screen.
 */
export function useOrganizationAI(enabled: boolean) {
  return useQuery({
    queryKey: ORG_AI_QUERY_KEY,
    queryFn: () => nullIfNoOrganisation(fetchOrganizationAI),
    enabled,
    retry: false,
    staleTime: 30_000,
  });
}

/**
 * The outcome of confirming, after the optional "Use my organisation's AI"
 * write. PAC-122 SF-090: `choiceError` is set when the confirmation was
 * recorded and the choice write then failed; the confirmation is not undone.
 */
export type OrganizationConsentOutcome = OrganizationAIConsentResult & { choiceError?: unknown };

/**
 * Confirms the version the user was shown; when `choose` is set, then chooses
 * "Use my organisation's AI" (the confirmation first, so the choice never
 * runs unconfirmed). A conflict shows the current configuration instead.
 * `choose` comes only from row 7 and the Settings choice list: rows 5 and 10
 * confirm alone (PAC-87, PAC87-AC-16: no settings write from row 10).
 */
export function useConfirmOrganizationAI() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ version, choose }: { version: number; choose: boolean }): Promise<OrganizationConsentOutcome> => {
      const res = await confirmOrganizationAI(version);
      if (res.kind === "confirmed" && choose) {
        try {
          const saved = await chooseOrganizationAIChoice();
          qc.setQueryData(["settings"], saved);
        } catch (choiceError) {
          return { ...res, choiceError };
        }
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
