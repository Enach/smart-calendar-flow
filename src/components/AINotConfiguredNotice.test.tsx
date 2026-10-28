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
