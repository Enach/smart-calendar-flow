/**
 * PAC-112 AC-26 / contract §5.5: the link editor against the demo
 * implementation (it lives here because only src/demo may import demo code,
 * PAC-83). The editor's rules hold the same: outcome texts, counts, the
 * stay-open rule, a create that becomes an edit, and the own-address refusal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LinkEditDrawer } from "@/components/links/LinkEditDrawer";
import { api } from "@/api/client";
import { clearFreebusyCache } from "@/api/coverageCache";
import { schedulingLinksApi } from "@/api/schedulingLinks";
import { AuthContext, type AuthContextValue } from "@/contexts/auth-context";
import { toast } from "@/hooks/useToast";
import { demoSchedulingLinksOps } from "./schedulingLinks";

function renderDrawer(signedIn: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  const auth = { user: { email: signedIn } } as unknown as AuthContextValue;
  render(
    <AuthContext.Provider value={auth}>
      <QueryClientProvider client={client}>
        <LinkEditDrawer open onOpenChange={onOpenChange} link={null} />
      </QueryClientProvider>
    </AuthContext.Provider>,
  );
  return { onOpenChange };
}

const emailInput = () => screen.getByLabelText("Co-host email") as HTMLInputElement;
function addCoHost(email: string) {
  fireEvent.change(emailInput(), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
}
const chipEmails = () =>
  screen.queryAllByRole("button", { name: /^Remove / }).map((b) => (b.getAttribute("aria-label") ?? "").replace(/^Remove /, ""));
const save = (name = /save changes/i) => fireEvent.click(screen.getByRole("button", { name }));

// PAC-139: the AC-26 create-then-edit journey renders the whole drawer twice
// and waits on three answers; under a full parallel run it once passed 5 s.
// Its waits are event-driven, so a longer bound only matters on a loaded box.
const SLOW_WAIT = 4_000;
const SLOW_TEST = 20_000;

let success: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  clearFreebusyCache();
  vi.spyOn(api, "freebusy").mockImplementation(async (input) => ({
    start_time: input.start_time, end_time: input.end_time,
    participants: input.emails.map((email) => ({ email, status: "unknown" as const, busy: [] })),
  }));
  success = vi.spyOn(toast, "success");
});
afterEach(() => vi.restoreAllMocks());

describe("demo mode follows the same rules (contract §5.5, AC-26)", () => {
  function wireDemo() {
    vi.spyOn(schedulingLinksApi, "createLink").mockImplementation(async (input) => demoSchedulingLinksOps.createLink(input));
    vi.spyOn(schedulingLinksApi, "updateLink").mockImplementation(async (id, input) => demoSchedulingLinksOps.updateLink(id, input));
    vi.spyOn(schedulingLinksApi, "getLink").mockImplementation(async (id) => demoSchedulingLinksOps.getLink(id));
  }

  it("AC-26 (AC-11, AC-12, AC-24): a demo create names the unknown address, stays open, then edits the created link", async () => {
    wireDemo();
    const before = demoSchedulingLinksOps.listLinks().owned.length;
    const { onOpenChange } = renderDrawer("alex@demo.paceday.com");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Demo PAC-112" } });
    addCoHost("bob@co.com");
    addCoHost("c@nowhere.io");
    save(/create link/i);
    expect(await screen.findByText("c@nowhere.io couldn't be added as a co-host.", {}, { timeout: SLOW_WAIT })).toBeInTheDocument();
    const results = Array.from(screen.getByRole("status", { name: "Save results" }).querySelectorAll("p")).map((p) => p.textContent);
    expect(results).toEqual([
      "Link created.",
      "1 co-host invited — they can accept from Paceday.",
      "1 address couldn't be added as a co-host.",
      "c@nowhere.io couldn't be added as a co-host.",
    ]);
    // Announced once, by the live region: no toast while the editor stays open (M6).
    expect(success).not.toHaveBeenCalled();
    await waitFor(() => expect(chipEmails()).toEqual(["bob@co.com"]), { timeout: SLOW_WAIT });

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Demo PAC-112 renamed" } });
    save();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false), { timeout: SLOW_WAIT });
    const owned = demoSchedulingLinksOps.listLinks().owned;
    expect(owned).toHaveLength(before + 1);
    expect(owned.filter((l) => l.title.startsWith("Demo PAC-112")).map((l) => l.title)).toEqual(["Demo PAC-112 renamed"]);
  }, SLOW_TEST);

  it("AC-26 (AC-14): the demo owner's address is refused as a chip", async () => {
    wireDemo();
    renderDrawer("alex@demo.paceday.com");
    addCoHost("Alex@Demo.Paceday.com");
    expect(screen.getByRole("alert")).toHaveTextContent("That's your own address — you're the link's owner.");
  });
});
