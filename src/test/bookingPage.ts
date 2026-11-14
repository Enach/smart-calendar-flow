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
 * finds the same candidates by the same accessible name without walking
 * every button of the page. The visibility check the role query made is kept,
 * run only on the elements the label matched: the time helpers fail on a
 * hidden or aria-hidden button, and hidden days are never picked. Assertions
 * about roles and names stay with `*ByRole` where a test is about them.
 */
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, vi } from "vitest";

/**
 * What the role query's visibility check excluded: an element (or an
 * ancestor) with `hidden`, `aria-hidden="true"`, `display: none` or
 * `visibility: hidden`. Run only on the few elements a label query matched,
 * never on every button of the page; `seen` shares ancestors' answers within
 * one pass, as the role query does.
 */
function isExposed(el: Element, seen = new Map<Element, boolean>()): boolean {
  const path: Element[] = [];
  let ok = true;
  for (let e: Element | null = el; e; e = e.parentElement) {
    const known = seen.get(e);
    if (known !== undefined) {
      ok = known;
      break;
    }
    path.push(e);
    const style = getComputedStyle(e);
    if (
      e.hasAttribute("hidden") ||
      e.getAttribute("aria-hidden") === "true" ||
      style.display === "none" ||
      style.visibility === "hidden"
    ) {
      ok = false;
      break;
    }
  }
  for (const e of path) seen.set(e, ok);
  return ok;
}

/** Fails the test unless `el` is visible and not hidden from assistive technology. */
function expectExposed(el: HTMLElement) {
  expect(el).toBeVisible();
  expect(el.closest('[aria-hidden="true"]')).toBeNull();
}

/**
 * A time button's accessible name carries the clock time followed by the
 * zone ("Monday, January 11, 2027, 5:00 PM, Asia/Tokyo UTC+09:00"). The
 * trailing "M," keeps the zone offset ("UTC+09:00") from matching on its own.
 */
export const TIME_LABEL = /\d{1,2}:\d{2}\s[AP]M,/;

/** Every exposed time button on the page, now (hidden ones are left out, as a role query would). */
export const queryTimeButtons = (label: RegExp = TIME_LABEL) => {
  const seen = new Map<Element, boolean>();
  return screen.queryAllByLabelText(label, { selector: "button" }).filter((b) => isExposed(b, seen));
};

/** Every time button, once at least one is shown; fails if any of them is hidden. */
export async function findTimeButtons(label: RegExp = TIME_LABEL): Promise<HTMLElement[]> {
  const buttons = await screen.findAllByLabelText(label, { selector: "button" });
  buttons.forEach(expectExposed);
  return buttons;
}

/** The only time button, once it is shown (fails on more than one, like findByRole, and if it is hidden). */
export async function findTimeButton(label: RegExp = TIME_LABEL): Promise<HTMLElement> {
  const button = await screen.findByLabelText(label, { selector: "button" });
  expectExposed(button);
  return button;
}

const allDayButtons = (): HTMLElement[] => Array.from(screen.getByRole("grid").querySelectorAll("button"));

/** The month grid's exposed day buttons (hidden ones are left out, as a role query would). */
export const dayButtons = (): HTMLElement[] => {
  const seen = new Map<Element, boolean>();
  return allDayButtons().filter((b) => isExposed(b, seen));
};

const selectable = (b: HTMLElement) => !b.hasAttribute("disabled") && b.getAttribute("aria-disabled") !== "true";

/** The month grid's day button whose label matches `name`; fails if it is hidden. */
export const dayButton = (name: RegExp): HTMLElement => {
  const button = within(screen.getByRole("grid")).getByLabelText(name, { selector: "button" });
  expectExposed(button);
  return button;
};

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
    // Cheap attribute checks first; the visibility walk only for candidates.
    const seen = new Map<Element, boolean>();
    const d = allDayButtons().find((b) => selectable(b) && isExposed(b, seen));
    if (!d) throw new Error("no selectable day yet");
    return d;
  });
  fireEvent.click(day);
  return day;
}
