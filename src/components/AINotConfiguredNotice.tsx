import { Link } from "react-router-dom";
import { Info } from "lucide-react";

import type { AINotConfigured } from "@/api/types";
import { whoCanEnable } from "@/lib/aiProviders";

interface AINotConfiguredNoticeProps {
  notConfigured: AINotConfigured;
  /** Link to the AI section of Settings (hidden on the Settings page itself). */
  showLink?: boolean;
}

/**
 * NEW-llm-bring-your-own (spec AC-21): AI features are off for this user. Says
 * so, why (the server's sentence), who can turn them on, and where. It is an
 * informational state, not an error.
 */
export function AINotConfiguredNotice({ notConfigured, showLink = true }: AINotConfiguredNoticeProps) {
  return (
    <div
      role="status"
      data-testid="ai-off-notice"
      className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium">AI features are off</p>
        <p className="text-muted-foreground">{notConfigured.message}</p>
        <p className="text-muted-foreground">{whoCanEnable(notConfigured)}</p>
        {showLink && (
          <Link to="/settings#ai" className="inline-block font-medium text-primary underline-offset-4 hover:underline">
            Open AI settings
          </Link>
        )}
      </div>
    </div>
  );
}
