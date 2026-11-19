/**
 * PAC-149 (spec §3.1, §3.7; the web half of AC-12, against the demo): the
 * link editor's text is identical for an address the demo directory knows
 * (its stand-in for "has an account") and for one it does not — after the
 * save and when the editor is reopened. Lives in src/demo because only
 * src/demo may import demo code (PAC-83).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LinkEditDrawer } from "@/components/links/LinkEditDrawer";
import { api } from "@/api/client";
import { clearFreebusyCache } from "@/api/coverageCache";
import { schedulingLinksApi } from "@/api/schedulingLinks";
import type { SchedulingLink } from "@/api/types";
import { AuthContext, type AuthContextValue } from "@/contexts/auth-context";
import { toast } from "@/hooks/useToast";
import { demoSchedulingLinksOps } from "./schedulingLinks";

const SLOW_WAIT = 4_000;
const SLOW_TEST = 20_000;

function renderDrawer(link: SchedulingLink | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  const auth = { user: { email: "alex@demo.paceday.com" } } as unknown as AuthContextValue;
  render(
    <AuthContext.Provider value={auth}>
      <QueryClientProvider client={client}>
        <LinkEditDrawer open onOpenChange={onOpenChange} link={link} />
      </QueryClientProvider>
    </AuthContext.Provider>,
  );
  return { onOpenChange };
}

let success: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  clearFreebusyCache();
  vi.spyOn(api, "freebusy").mockImplementation(async (input) => ({
    start_time: input.start_time, end_time: input.end_time,
    participants: input.emails.map((email) => ({ email, status: "unknown" as const, busy: [] })),
  }));
  vi.spyOn(schedulingLinksApi, "createLink").mockImplementation(async (input) => demoSchedulingLinksOps.createLink(input));
  vi.spyOn(schedulingLinksApi, "updateLink").mockImplementation(async (id, input) => demoSchedulingLinksOps.updateLink(id, input));
  vi.spyOn(schedulingLinksApi, "getLink").mockImplementation(async (id) => demoSchedulingLinksOps.getLink(id));
  success = vi.spyOn(toast, "success");
});
afterEach(() => vi.restoreAllMocks());

/** Create a link inviting `address`, then reopen the editor on it; the texts seen, with the address replaced. */
async function run(address: string, title: string) {
  success.mockClear();
  const { onOpenChange } = renderDrawer(null);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: title } });
  fireEvent.change(screen.getByLabelText("Co-host email"), { target: { value: address } });
  fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
  fireEvent.click(screen.getByRole("button", { name: /create link/i }));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false), { timeout: SLOW_WAIT });
  const saveText = JSON.stringify(success.mock.calls);
  cleanup();

  // By title: the demo's id counter can repeat a seeded id, so ids are not a safe handle here.
  const created = demoSchedulingLinksOps.listLinks().owned.filter((l) => l.title === title);
  expect(created).toHaveLength(1);
  const link = created[0];
  renderDrawer(link);
  await screen.findByText("Invite pending", {}, { timeout: SLOW_WAIT });
  const editorText = document.body.textContent ?? "";
  cleanup();
  // Each run makes its own link, so its title and slug differ by design; neither is about the co-host.
  const mask = (s: string) => s.split(link.slug).join("SLUG").split(title).join("TITLE").split(address).join("ADDR");
  return { saveText: mask(saveText), editorText: mask(editorText) };
}

describe("PAC-149: the editor says the same thing whether or not the address has an account", () => {
  it("a directory address and an unknown address give identical save and reopened-editor text", async () => {
    const known = await run("alice@co.com", "PAC-149 known run");
    const unknown = await run("someone@unknown.example", "PAC-149 unknown run");
    expect(unknown.saveText).toBe(known.saveText);
    expect(unknown.editorText).toBe(known.editorText);
    expect(known.saveText).toContain("1 co-host invited. Paceday doesn't email invitations, so let them know.");
    for (const text of [known.saveText, known.editorText, unknown.saveText, unknown.editorText]) {
      expect(text).not.toContain("couldn't be added");
      expect(text).not.toContain("valid email address");
      expect(text).not.toContain("Alice Martin");
    }
  }, SLOW_TEST);
});
