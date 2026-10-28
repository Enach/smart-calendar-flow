import { useState } from "react";
import { Link } from "react-router-dom";
import { Info } from "lucide-react";

import type { AINotConfigured } from "@/api/types";
import { OrgAIConsentDialog } from "@/components/OrgAIConsentDialog";
import { ORG_CHOICE_LABEL, asksConfirmation, noticeReason, offersOrganizationAI, whoCanEnable } from "@/lib/aiProviders";

interface AINotConfiguredNoticeProps {
  notConfigured: AINotConfigured;
  /** Link to the AI section of Settings (hidden on the Settings page itself). */
  showLink?: boolean;
  /** Called once the user confirmed the organisation's AI from this notice (PAC-73 Part 2). */
  onResolved?: () => void;
}

/**
 * NEW-llm-bring-your-own (spec AC-21): AI features are off for this user. Says
 * so, why (the server's sentence), who can turn them on, and where. It is an
 * informational state, not an error.
 *
 * PAC-73 Part 2 (spec §3.6): the administrator of the organisation is named
 * exactly when the answer's enablers include them. In row 5 the notice offers
 * to confirm the organisation's AI (owner O-13: told and asked once, nothing
 * sent before); in rows 7 and 10 it offers "Use my organisation's AI", which
 * shows the same notice and confirms.
 */
export function AINotConfiguredNotice({ notConfigured, showLink = true, onResolved }: AINotConfiguredNoticeProps) {
  const [consent, setConsent] = useState<null | { choose: boolean }>(null);
  const confirmable = asksConfirmation(notConfigured);
  const choosable = offersOrganizationAI(notConfigured);
  return (
    <div
      role="status"
      data-testid="ai-off-notice"
      className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium">AI features are off</p>
        <p className="text-muted-foreground">{noticeReason(notConfigured)}</p>
        {!confirmable && !choosable && <p className="text-muted-foreground">{whoCanEnable(notConfigured)}</p>}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {confirmable && (
            <button
              type="button"
              data-testid="ai-org-confirm"
              onClick={() => setConsent({ choose: false })}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Review and confirm
            </button>
          )}
          {choosable && (
            <button
              type="button"
              data-testid="ai-use-org"
              onClick={() => setConsent({ choose: true })}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              {ORG_CHOICE_LABEL}
            </button>
          )}
          {showLink && (
            <Link to="/settings#ai" className="inline-block font-medium text-primary underline-offset-4 hover:underline">
              Open AI settings
            </Link>
          )}
        </div>
      </div>
      {consent && (
        <OrgAIConsentDialog open onOpenChange={(open) => !open && setConsent(null)} choose={consent.choose} onConfirmed={onResolved} />
      )}
    </div>
  );
}
