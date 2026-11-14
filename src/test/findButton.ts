import { screen } from "@testing-library/react";
import { expect } from "vitest";

/**
 * PAC-117: wait for a button the cheap way, then check it the strict way once.
 *
 * `findByRole("button", { name })` re-runs its query on every DOM mutation and
 * every 50 ms until the button shows up. Each run computes the accessible name
 * of every button on the page, and that computation calls jsdom's
 * `getComputedStyle` on each button and its descendants. jsdom 29 re-applies
 * its whole default stylesheet on each of those calls. While a component is
 * still loading, that polling is most of the test's CPU, so under full-suite
 * load the wait overruns `findBy`'s 1 s default (PAC-113 found the same cause
 * in the PublicBooking tests).
 *
 * This helper polls with a text query restricted to `<button>` elements, which
 * does no style or name computation. Once a button with that text exists, it
 * runs the role query a single time and requires both to agree. So the test
 * still fails if the button is hidden from assistive tech (`hidden`,
 * `aria-hidden`, `display: none`), not visible, or has a different accessible
 * name than its text, exactly as `findByRole` would, minus the repeated cost.
 *
 * Use it only for buttons whose label is their own text (not a nested element
 * or an `aria-label`); the text wait would otherwise never match.
 */
export async function findButton(name: string | RegExp): Promise<HTMLElement> {
  const byText = await screen.findByText(name, { selector: "button" });
  const byRole = screen.getByRole("button", { name });
  expect(byRole).toBe(byText);
  expect(byRole).toBeVisible();
  return byRole;
}
