/**
 * PAC-113 review F1-F3: the booking-page helpers keep what the role queries
 * they replaced guaranteed. A hidden or aria-hidden time button fails the
 * test, the zone offset alone is not a time, and hidden days are never picked.
 */
import { afterEach, describe, expect, it } from "vitest";

import { TIME_LABEL, dayButtons, findTimeButton, findTimeButtons, pickFirstSelectableDay, queryTimeButtons } from "./bookingPage";

const TIME = (t: string) => `<button type="button" aria-label="Monday, January 11, 2027, ${t}, Asia/Tokyo UTC+09:00">${t}</button>`;

function page(body: string) {
  document.body.innerHTML = `<h1>Intro call</h1>${body}`;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("time buttons", () => {
  it.each([
    ["hidden", `<div>${TIME("5:00 PM").replace("<button", "<button hidden")}</div>`],
    ["display:none", `<div>${TIME("5:00 PM").replace("<button", '<button style="display:none"')}</div>`],
    ["aria-hidden", `<div>${TIME("5:00 PM").replace("<button", '<button aria-hidden="true"')}</div>`],
    ["inside an aria-hidden ancestor", `<div aria-hidden="true">${TIME("5:00 PM")}</div>`],
    ["inside a hidden ancestor", `<div style="visibility:hidden">${TIME("5:00 PM")}</div>`],
  ])("a %s time button fails findTimeButton(s) and is left out of queryTimeButtons", async (_label, html) => {
    page(html);
    await expect(findTimeButton()).rejects.toThrow();
    await expect(findTimeButtons()).rejects.toThrow();
    expect(queryTimeButtons()).toHaveLength(0);
  });

  it("an exposed time button is found", async () => {
    page(TIME("5:00 PM"));
    expect(await findTimeButton()).toHaveTextContent("5:00 PM");
    expect(queryTimeButtons()).toHaveLength(1);
  });

  it("the zone offset alone is not a time", () => {
    expect(TIME_LABEL.test("Monday, January 11, 2027, 5:00 PM, Asia/Tokyo UTC+09:00")).toBe(true);
    expect(TIME_LABEL.test("Monday, January 11, 2027, Asia/Tokyo UTC+09:00")).toBe(false);
    page('<button type="button" aria-label="Monday, January 11, 2027, Asia/Tokyo UTC+09:00">x</button>');
    expect(queryTimeButtons()).toHaveLength(0);
  });
});

describe("day buttons", () => {
  const grid = (cells: string) => `<table role="grid"><tbody><tr>${cells}</tr></tbody></table>`;
  const day = (n: number, attrs = "") => `<td><button type="button" aria-label="January ${n}, 2027" ${attrs}>${n}</button></td>`;

  it("hidden days are left out and never picked", async () => {
    page(grid(day(1, "disabled") + day(2, "hidden") + day(3, 'style="display:none"') + day(4, 'aria-hidden="true"') + day(5)));
    expect(dayButtons().map((b) => b.textContent)).toEqual(["1", "5"]);
    expect((await pickFirstSelectableDay()).textContent).toBe("5");
  });

  it("a grid whose only selectable days are hidden offers none", async () => {
    page(grid(day(1, "hidden") + day(2, 'aria-hidden="true"')));
    await expect(pickFirstSelectableDay()).rejects.toThrow("no selectable day yet");
  });
});
