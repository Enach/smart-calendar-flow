/**
 * PAC-122 batch 6b, SF-088: a failed refresh of the co-host invites was shown
 * only when no invite was cached, so a stale list stayed on screen with no
 * sign that it could not be refreshed. The error now shows above the cached
 * invites, with a retry.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { API_MESSAGES, ApiHttpError } from "@/api/client";
import { schedulingLinkKeys, schedulingLinksApi } from "@/api/schedulingLinks";
import { InviteBanner } from "./Links";

afterEach(() => vi.restoreAllMocks());

describe("PAC-122 SF-088: an invites refresh error with cached invites", () => {
  it("shows the error above the cached invites, with a retry", async () => {
    vi.spyOn(schedulingLinksApi, "listInvites").mockRejectedValue(
      new ApiHttpError(500, { error: "internal error" }, "internal error"),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(schedulingLinkKeys.invites, [
      { link_id: "l1", link_title: "Intro", owner_name: "Olive", owner_email: "olive@co.com" },
    ]);
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <InviteBanner onAccept={() => {}} onDecline={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const alert = await screen.findByRole("alert");
    // PAC-69: the 500's wording comes from its status, not the server's text.
    expect(alert).toHaveTextContent(API_MESSAGES.serverProblem);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    // The cached invite stays visible below the error.
    expect(screen.getByText(/added you to the scheduling link/)).toBeInTheDocument();
  });
});
