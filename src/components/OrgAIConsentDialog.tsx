import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/api/client";
import type { OrganizationAIConfiguration } from "@/api/types";
import { useConfirmOrganizationAI, useOrganizationAI } from "@/hooks/useOrganizationAI";
import { PROVIDER_LABELS, organizationConsentText } from "@/lib/aiProviders";

interface OrgAIConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Also choose "Use my organisation's AI" once confirmed (rows 7 and 10, Settings). */
  choose: boolean;
  /** Called once the confirmation (and the choice) are recorded. */
  onConfirmed?: () => void;
}

/**
 * PAC-73 Part 2, owner O-13 (2026-10-28): before a member's first AI request
 * on the organisation's account, tell them and ask once. The notice names the
 * organisation's provider and says its administrators can access the data;
 * nothing is sent before they confirm. Confirming names the version shown:
 * when an administrator changed the configuration meanwhile, nothing is
 * recorded and the current configuration is shown to confirm instead.
 */
export function OrgAIConsentDialog({ open, onOpenChange, choose, onConfirmed }: OrgAIConsentDialogProps) {
  const org = useOrganizationAI(open);
  const confirm = useConfirmOrganizationAI();
  const [changed, setChanged] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The version displayed is the one confirmed (P2-AC-38): kept from the
  // read the user is looking at, replaced only by a conflict's answer.
  const [shown, setShown] = useState<OrganizationAIConfiguration | null>(null);

  useEffect(() => {
    if (!open) {
      setShown(null);
      setChanged(false);
      setProblem(null);
    } else if (org.data && !shown) {
      setShown(org.data);
    }
  }, [open, org.data, shown]);

  const onConfirm = async () => {
    if (!shown) return;
    setProblem(null);
    try {
      const res = await confirm.mutateAsync({ version: shown.configurationVersion, choose });
      if (res.kind === "confirmed") {
        onOpenChange(false);
        onConfirmed?.();
        return;
      }
      setShown(res.configuration);
      if (res.reason === "organization_not_configured") {
        setProblem("Your organisation's AI is not set up completely, so there is nothing to confirm yet.");
      } else {
        setChanged(true);
      }
    } catch (e) {
      setProblem(apiErrorMessage(e));
    }
  };

  const provider = shown?.provider;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="org-ai-consent">
        <DialogHeader className="text-left">
          <DialogTitle>Use your organisation's AI</DialogTitle>
          <DialogDescription>
            {provider ? `Your organisation provides AI through ${PROVIDER_LABELS[provider]}.` : "Your organisation's AI configuration."}
          </DialogDescription>
        </DialogHeader>
        {!shown && org.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" />}
        {!shown && org.error && <p className="text-sm text-destructive">{apiErrorMessage(org.error)}</p>}
        {shown && (
          <div className="space-y-3 text-sm text-foreground">
            {changed && (
              <p role="status" data-testid="org-ai-consent-changed" className="rounded-lg border border-border bg-muted/40 p-3">
                An administrator changed your organisation's AI configuration after it was shown to you. Nothing was
                recorded. Review the current configuration below and confirm again.
              </p>
            )}
            <p data-testid="org-ai-consent-text">{organizationConsentText(provider)}</p>
            {problem && <p className="text-destructive">{problem}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button onClick={onConfirm} disabled={!shown || !shown.configured || confirm.isPending}>
            {confirm.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm and turn AI on
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
