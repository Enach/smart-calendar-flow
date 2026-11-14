/**
 * PAC-113: cheap queries for driving the public booking page in tests.
 *
 * Why not `*ByRole` here: a role query checks every candidate element, and
 * each of its ancestors, for visibility through jsdom's `getComputedStyle`,
 * and jsdom re-cascades its whole default stylesheet on every call. The
 * booking page renders ~45 buttons (the month grid alone is 35-42), and
 * `findBy*` / `waitFor` re-run their query on every DOM mutation as well as
 * every 50 ms. A page-wide `findAllByRole("button", { name })` therefore cost
 * 100-200 ms of CPU per React render burst, and a test that books six times
 * spent most of its time inside those queries. Under the full suite (one
 * worker per core) that CPU is contended, and single tests crossed vitest's
 * 5 s budget.
 *
 * The time and day buttons are named by their `aria-label` (spec 3.9 / AC-27:
 * date, time, zone and offset), so `*ByLabelText` with `selector: "button"`
 * finds the same elements by the same accessible name without the
 * computed-style walk. Assertions about roles and names stay with `*ByRole`
 * where a test is about them; these helpers only drive the page.
 */
import { fireEvent, screen, within } from "@testing-library/react";
import { vi } from "vitest";

/** A time button's accessible name carries a clock time ("…, 9:00 AM, UTC UTC+00:00"). */
export const TIME_LABEL = /\d{1,2}:\d{2}/;

/** Every time button on the page, now. */
export const queryTimeButtons = (label: RegExp = TIME_LABEL) =>
  screen.queryAllByLabelText(label, { selector: "button" });

/** Every time button, once at least one is shown. */
export const findTimeButtons = (label: RegExp = TIME_LABEL) =>
  screen.findAllByLabelText(label, { selector: "button" });

/** The only time button, once it is shown (fails on more than one, like findByRole). */
export const findTimeButton = (label: RegExp = TIME_LABEL) =>
  screen.findByLabelText(label, { selector: "button" });

/** The month grid's day buttons. */
export const dayButtons = (): HTMLElement[] => Array.from(screen.getByRole("grid").querySelectorAll("button"));

const selectable = (b: HTMLElement) => !b.hasAttribute("disabled") && b.getAttribute("aria-disabled") !== "true";

/** The month grid's day button whose label matches `name`. */
export const dayButton = (name: RegExp): HTMLElement =>
  within(screen.getByRole("grid")).getByLabelText(name, { selector: "button" });

/**
 * Waits for the booking page to show its title. By text in the page's `h1`,
 * not by role: this query re-runs on every DOM mutation while the page loads,
 * and the role query's visibility walk made it the costliest wait in these
 * tests. Tests about the heading itself keep `findByRole("heading")`.
 */
export const findPageTitle = (title: string | RegExp = "Intro call") => screen.findByText(title, { selector: "h1" });

/**
 * Waits for the page's title, then for the first selectable day (PAC-88: days become
 * selectable once the day overview answers) and clicks it.
 */
export async function pickFirstSelectableDay(title = "Intro call"): Promise<HTMLElement> {
  await findPageTitle(title);
  const day = await vi.waitFor(() => {
    const d = dayButtons().find(selectable);
    if (!d) throw new Error("no selectable day yet");
    return d;
  });
  fireEvent.click(day);
  return day;
}
