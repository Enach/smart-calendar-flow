/**
 * PAC-91 frame guard (contract section 3.3, spec AC-6..AC-11), through the real
 * App: its BrowserRouter, its routes, the real AuthProvider and RequireAuth.
 *
 * - isFramed() is stubbed (contract 3.1: never jsdom's window.top alone).
 * - Every route component is replaced by a stub, or wrapped when its own
 *   behaviour matters (Logout, AuthCallback, PublicBooking, RequireAuth), so a
 *   render counter proves the route never rendered — not even once before the
 *   notice — rather than only the final DOM.
 * - fetch is stubbed and records every request; the session probe answers
 *   "signed out" (401), so unframed RequireAuth would redirect.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import App from "@/App";
import { schedulingLinksApi, type PublicSlotsParams } from "@/api/schedulingLinks";
import { TOP_LEVEL_LINK_TARGET, isFramed } from "@/lib/framing";

const h = vi.hoisted(() => {
  const renders: Record<string, number> = {};
  /** A component counting its renders: a stub naming the page, or the real one wrapped. */
  async function counted(name: string, Real?: (props: Record<string, unknown>) => unknown) {
    const { createElement } = await import("react");
    function Counted(props: Record<string, unknown>) {
      renders[name] = (renders[name] ?? 0) + 1;
      return Real ? createElement(Real as never, props) : createElement("p", null, `page:${name}`);
    }
    return Counted;
  }
  return { renders, counted };
});

vi.mock("@/lib/framing", async (orig) => ({
  ...(await orig<typeof import("@/lib/framing")>()),
  isFramed: vi.fn(() => false),
}));

vi.mock("@/pages/Index", async () => ({ default: await h.counted("Index") }));
vi.mock("@/pages/Dashboard", async () => ({ default: await h.counted("Dashboard") }));
vi.mock("@/pages/Settings", async () => ({ default: await h.counted("Settings") }));
vi.mock("@/pages/Audit", async () => ({ default: await h.counted("Audit") }));
vi.mock("@/pages/SignIn", async () => ({ default: await h.counted("SignIn") }));
vi.mock("@/pages/SignUp", async () => ({ default: await h.counted("SignUp") }));
vi.mock("@/pages/Links", async () => ({ default: await h.counted("Links") }));
vi.mock("@/pages/Team", async () => ({ default: await h.counted("Team") }));
vi.mock("@/pages/TeamInvite", async () => ({ default: await h.counted("TeamInvite") }));
vi.mock("@/pages/Onboarding", async () => ({ default: await h.counted("Onboarding") }));
vi.mock("@/pages/NotFound", async () => ({ default: await h.counted("NotFound") }));
// Real behaviour, counted: sign-out on mount, refresh on mount, the booking page itself.
vi.mock("@/pages/Logout", async (orig) => ({
  default: await h.counted("Logout", (await orig<typeof import("@/pages/Logout")>()).default),
}));
vi.mock("@/pages/AuthCallback", async (orig) => ({
  default: await h.counted("AuthCallback", (await orig<typeof import("@/pages/AuthCallback")>()).default),
}));
vi.mock("@/pages/PublicBooking", async (orig) => ({
  default: await h.counted("PublicBooking", (await orig<typeof import("@/pages/PublicBooking")>()).default),
}));
vi.mock("@/components/RequireAuth", async (orig) => {
  const real = await orig<typeof import("@/components/RequireAuth")>();
  return { ...real, RequireAuth: await h.counted("RequireAuth", real.RequireAuth as never) };
});

/** The non-booking routes of AC-6, with the route components that render there. */
const NON_BOOKING_ROUTES: Array<[path: string, components: string[]]> = [
  ["/", ["Index"]],
  ["/signin", ["SignIn"]],
  ["/signup", ["SignUp"]],
  ["/app", ["RequireAuth", "Dashboard"]],
  ["/settings", ["RequireAuth", "Settings"]],
  ["/app/team/invite/tok-123", ["RequireAuth", "TeamInvite"]],
  ["/logout", ["Logout"]],
  ["/auth/callback", ["AuthCallback"]],
  ["/no-such-page", ["NotFound"]],
  // The crafted addresses nginx used to judge framable (spec 2.5); the app routes them elsewhere.
  ["/app/team/invite/..%2F..%2F..%2Fbook%2Fx", ["RequireAuth", "TeamInvite"]],
  ["/settings/..%2Fbook/x", ["NotFound"]],
  ["/book//abc", ["NotFound"]],
];

const ALL_ROUTE_COMPONENTS = [
  "Index", "Dashboard", "Settings", "Audit", "SignIn", "SignUp", "Links", "Team", "TeamInvite",
  "Onboarding", "NotFound", "Logout", "AuthCallback", "PublicBooking", "RequireAuth",
];

let requests: string[] = [];

function framed(yes: boolean) {
  vi.mocked(isFramed).mockReturnValue(yes);
}

function open(path: string) {
  window.history.replaceState(null, "", path);
  return render(<App />);
}

/** Lets every pending effect, probe and redirect run. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

const rendersOf = (names: string[]) => names.reduce((n, name) => n + (h.renders[name] ?? 0), 0);
const apiRequests = () => requests.filter((u) => new URL(u, window.location.origin).pathname.startsWith("/api/"));
const here = () => window.location.pathname + window.location.search;

function listing(params: PublicSlotsParams) {
  const zone = params.displayTimeZone ?? "UTC";
  return { time_zone: "UTC", display_time_zone: zone, range_from: params.date ?? params.from, range_to: params.date ?? params.to, slots: [], available_dates: [] };
}

beforeEach(() => {
  for (const k of Object.keys(h.renders)) delete h.renders[k];
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      requests.push(url);
      // Signed out: the session probe and everything else answer 401.
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue({
    slug: "intro",
    title: "Intro call",
    durations: [30],
    hosts: [{ email: "host@co.com", name: "Host" }],
    min_notice_minutes: 0,
    usage_type: "reusable",
    coverage: { total: 1, checked: 1 },
  });
  vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_s, p) => listing(p));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  framed(false);
  window.history.replaceState(null, "", "/");
});

describe("PAC-91 FrameGuard: framed off the booking page, only the notice", () => {
  it.each(NON_BOOKING_ROUTES)("AC-6: framed on %s, only the notice renders; the route component never rendered", async (path, components) => {
    framed(true);
    const { container } = open(path);
    await settle();

    expect(screen.getByTestId("frame-notice")).toBeInTheDocument();
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(screen.getByTestId("frame-notice"));
    expect(rendersOf(components)).toBe(0);
    expect(rendersOf(ALL_ROUTE_COMPONENTS)).toBe(0);
  });

  it.each(NON_BOOKING_ROUTES)("AC-7: framed on %s, the notice has exactly one link, to / at the top level", async (path) => {
    framed(true);
    open(path);
    const notice = screen.getByTestId("frame-notice");
    const links = notice.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]).toBe(screen.getByTestId("frame-notice-open"));
    expect(links[0]).toHaveAttribute("href", "/");
    expect(links[0]).toHaveAttribute("target", TOP_LEVEL_LINK_TARGET);
    expect(notice).toHaveTextContent(/paceday/i);
  });

  it.each(NON_BOOKING_ROUTES)("AC-8: framed on %s and signed out, no redirect and no /api/ request at all", async (path) => {
    framed(true);
    open(path);
    const loaded = here();
    await settle();

    expect(here()).toBe(loaded);
    expect(apiRequests()).toEqual([]);
    expect(requests).toEqual([]);
  });
});

describe("PAC-91 FrameGuard: the booking page and the unframed app are unchanged", () => {
  it("AC-9: framed on /book/<slug>, the booking page renders as it does unframed", async () => {
    framed(true);
    const first = open("/book/intro");
    expect(await screen.findByRole("heading", { name: "Intro call" })).toBeInTheDocument();
    expect(screen.queryByTestId("frame-notice")).not.toBeInTheDocument();
    expect(h.renders.PublicBooking).toBeGreaterThan(0);
    expect(screen.getByTestId("booking-home-link")).toHaveAttribute("target", TOP_LEVEL_LINK_TARGET);
    const framedText = document.body.textContent;
    first.unmount();

    framed(false);
    open("/book/intro");
    await screen.findByRole("heading", { name: "Intro call" });
    expect(document.body.textContent).toBe(framedText);
  });

  it.each(["/app", "/signin", "/no-such-page", "/settings"])(
    "AC-10: framed on the booking page, a client-side navigation to %s shows the notice instead",
    async (to) => {
      framed(true);
      open("/book/intro");
      await screen.findByRole("heading", { name: "Intro call" });
      const before = { ...h.renders };

      await act(async () => {
        window.history.pushState(null, "", to);
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      await settle();

      expect(screen.getByTestId("frame-notice")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Intro call" })).not.toBeInTheDocument();
      expect(window.location.pathname).toBe(to);
      // No route component of the new location rendered, not even once.
      for (const name of ALL_ROUTE_COMPONENTS.filter((n) => n !== "PublicBooking")) {
        expect(h.renders[name] ?? 0).toBe(before[name] ?? 0);
      }
    },
  );

  it.each(NON_BOOKING_ROUTES.slice(0, 9))("AC-11: unframed on %s, no notice and the app routes as today", async (path, components) => {
    framed(false);
    open(path);
    await settle();

    expect(screen.queryByTestId("frame-notice")).not.toBeInTheDocument();
    if (components[0] === "RequireAuth") {
      // Signed out: RequireAuth rendered and redirected home, after the session probe (today's behaviour).
      expect(h.renders.RequireAuth).toBeGreaterThan(0);
      expect(window.location.pathname).toBe("/");
      // RequireAuth omits ?redirect= for /app itself.
      expect(window.location.search).toBe(path === "/app" ? "" : `?redirect=${encodeURIComponent(path)}`);
      expect(screen.getByText("page:Index")).toBeInTheDocument();
    } else {
      expect(rendersOf(components)).toBeGreaterThan(0);
    }
    expect(apiRequests().some((u) => u.includes("/api/auth/me"))).toBe(true);
  });
});
