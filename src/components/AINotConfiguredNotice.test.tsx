import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { AINotConfiguredNotice } from "./AINotConfiguredNotice";
import { NLPBar } from "./NLPBar";

// NEW-llm-bring-your-own AC-21: when AI is not configured the page says that
// AI features are off, why (the server's reason), who can turn them on, and
// links to Settings, instead of an error.
describe("AINotConfiguredNotice", () => {
  const nc = {
    reason: "nothing_configured" as const,
    enablers: ["user" as const],
    message: "AI features are off: no AI provider is set up. Add your own API key in Settings.",
  };

  // Spec revision 2: in Part 1 only the user can turn AI on, so the notice
  // never sends anyone to an organisation admin; and it says "AI features
  // are off" once (contract challenge rev. 2, non-blocking 6).
  it("says AI is off once, why, that the user can turn it on, and links to Settings", () => {
    render(
      <MemoryRouter>
        <AINotConfiguredNotice notConfigured={nc} />
      </MemoryRouter>,
    );
    const notice = screen.getByTestId("ai-off-notice");
    expect(notice).toHaveTextContent("AI features are off");
    expect(notice.textContent?.match(/AI features are off/gi)).toHaveLength(1);
    expect(notice).toHaveTextContent("No AI provider is set up. Add your own API key in Settings.");
    expect(notice).toHaveTextContent("You can turn them on in Settings.");
    expect(notice).not.toHaveTextContent(/admin/i);
    expect(screen.getByRole("link", { name: /open ai settings/i })).toHaveAttribute("href", "/settings#ai");
    expect(notice).not.toHaveClass("text-destructive");
  });

  it("names no organisation admin and can hide the link", () => {
    render(
      <MemoryRouter>
        <AINotConfiguredNotice notConfigured={{ reason: "off", enablers: ["user"], message: "AI features are off: you turned them off in Settings." }} showLink={false} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("ai-off-notice")).not.toHaveTextContent("admin");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

// PAC-73 Part 2 (P2-AC-31, P2-AC-35): the notice names the organisation's
// administrator exactly when the answer's enablers include them, and alone
// when only they can turn AI on.
describe("AINotConfiguredNotice in an organisation", () => {
  it("names the user and the administrator for an organisation with no AI configuration (row 6)", () => {
    render(
      <MemoryRouter>
        <AINotConfiguredNotice
          notConfigured={{
            reason: "nothing_configured",
            enablers: ["user", "organization_admin"],
            message: "AI features are off: no AI provider is set up. Add your own API key in Settings, or ask an administrator of your organisation to set up its AI.",
          }}
        />
      </MemoryRouter>,
    );
    const notice = screen.getByTestId("ai-off-notice");
    expect(notice).toHaveTextContent("You can turn them on in Settings, or an administrator of your organisation can set up its AI.");
    expect(screen.queryByTestId("ai-org-confirm")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ai-use-org")).not.toBeInTheDocument();
  });

  it("names only the administrator when only they can (row 11)", () => {
    render(
      <MemoryRouter>
        <AINotConfiguredNotice
          notConfigured={{
            reason: "personal_keys_forbidden",
            enablers: ["organization_admin"],
            message: "AI features are off: your organisation does not allow personal API keys and has not finished setting up its AI. An administrator of your organisation can set it up.",
          }}
          showLink={false}
        />
      </MemoryRouter>,
    );
    const notice = screen.getByTestId("ai-off-notice");
    expect(notice).toHaveTextContent("An administrator of your organisation can turn them on.");
    expect(notice).not.toHaveTextContent("You can turn them on in Settings");
    expect(screen.queryByTestId("ai-use-org")).not.toBeInTheDocument();
  });
});

describe("NLPBar", () => {
  it("shows the AI-off notice instead of an error when the parse was not configured", () => {
    render(
      <MemoryRouter>
        <NLPBar onSubmit={vi.fn()} error="should not show" notConfigured={{ reason: "needs_key", provider: "anthropic", enablers: ["user"], message: "AI features are off: Anthropic needs an API key. Add one in Settings." }} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("ai-off-notice")).toHaveTextContent("Anthropic needs an API key");
    expect(screen.queryByText("should not show")).not.toBeInTheDocument();
  });

  it("still shows a plain error otherwise", () => {
    render(
      <MemoryRouter>
        <NLPBar onSubmit={vi.fn()} error="Sorry, I couldn't understand that request." />
      </MemoryRouter>,
    );
    expect(screen.getByText("Sorry, I couldn't understand that request.")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-off-notice")).not.toBeInTheDocument();
  });
});
