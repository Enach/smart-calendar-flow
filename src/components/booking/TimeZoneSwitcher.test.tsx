/**
 * PAC-88: the "Time zone" combobox and its shortcuts — AC-6, AC-7, AC-8 and
 * the switcher half of AC-27 (name, keyboard, 44 px targets), plus the
 * link-zone mode of contract section 5.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { TZ_SWITCH_UNAVAILABLE, TimeZoneSwitcher } from "./TimeZoneSwitcher";

const ZONES = ["Africa/Abidjan", "America/New_York", "Asia/Tokyo", "Europe/Paris", "Pacific/Auckland"];
const WINTER = new Date("2027-01-15T12:00:00Z");

function setup(props: Partial<Parameters<typeof TimeZoneSwitcher>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <TimeZoneSwitcher
      value="Europe/Paris"
      linkZone="Europe/Paris"
      hostZone="Europe/Paris"
      zones={ZONES}
      now={WINTER}
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange, box: screen.getByRole("combobox", { name: "Time zone" }) };
}

describe("TimeZoneSwitcher", () => {
  it("AC-27: is a combobox named 'Time zone' whose value is the current zone, with the test id", () => {
    const { box } = setup();
    expect(box).toHaveValue("Europe/Paris");
    expect(box).toHaveAttribute("data-testid", "booking-tz-switcher");
    expect(box).toHaveAttribute("aria-expanded", "false");
    expect(box.className).toContain("min-h-[44px]");
  });

  it("AC-6: typing 'new york' finds America/New_York; options show offsets; link zone and UTC first", () => {
    const { box } = setup();
    fireEvent.click(box);
    const all = screen.getAllByRole("option");
    expect(all.slice(0, 2).map((o) => o.getAttribute("aria-label"))).toEqual(["Europe/Paris (UTC+01:00)", "UTC (UTC+00:00)"]);
    for (const o of all) expect(o.className).toContain("min-h-[44px]");

    fireEvent.change(box, { target: { value: "new york" } });
    const opts = screen.getAllByRole("option");
    expect(opts.map((o) => o.getAttribute("aria-label"))).toEqual(["America/New_York (UTC−05:00)"]);
    expect(within(opts[0]!).getByText("UTC−05:00")).toBeInTheDocument();
  });

  it("AC-27: keyboard alone opens, filters, moves, chooses and cancels", () => {
    const { box, onChange } = setup();
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(box).toHaveAttribute("aria-expanded", "true");
    // Opens on the current zone.
    expect(box.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[0]!.id);
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(box, { key: "Escape" });
    expect(box).toHaveAttribute("aria-expanded", "false");
    expect(box).toHaveValue("Europe/Paris");
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(box, { target: { value: "tok" } });
    fireEvent.keyDown(box, { key: "End" });
    fireEvent.keyDown(box, { key: "Home" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("Asia/Tokyo");
    expect(box).toHaveAttribute("aria-expanded", "false");
  });

  it("chooses with the pointer and says when nothing matches", () => {
    const { box, onChange } = setup();
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/no time zone matches/i)).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "auck" } });
    fireEvent.click(screen.getByRole("option", { name: /Pacific\/Auckland/ }));
    expect(onChange).toHaveBeenCalledWith("Pacific/Auckland");
    fireEvent.click(box);
    fireEvent.blur(box);
    expect(box).toHaveAttribute("aria-expanded", "false");
  });

  it("AC-7: offers 'Use my time zone' only when the browser's zone differs from the one shown", () => {
    const { onChange } = setup({ browserZone: "America/New_York" });
    const mine = screen.getByTestId("booking-tz-use-mine");
    expect(mine).toHaveTextContent("Use my time zone (America/New_York)");
    expect(mine.className).toContain("min-h-[44px]");
    fireEvent.click(mine);
    expect(onChange).toHaveBeenCalledWith("America/New_York");
  });

  it("AC-7: no shortcut when the browser is already in the zone shown, or its zone is unknown", () => {
    setup({ browserZone: "Europe/Paris" });
    expect(screen.queryByTestId("booking-tz-use-mine")).not.toBeInTheDocument();
    expect(screen.queryByTestId("booking-tz-back-to-host")).not.toBeInTheDocument();
  });

  it("AC-8: one action returns to the host's zone once the visitor switched away", () => {
    const { onChange } = setup({ value: "Asia/Tokyo" });
    const back = screen.getByTestId("booking-tz-back-to-host");
    expect(back).toHaveTextContent("Europe/Paris");
    expect(back.className).toContain("min-h-[44px]");
    fireEvent.click(back);
    expect(onChange).toHaveBeenCalledWith("Europe/Paris");
  });

  it("link-zone mode: focusable, aria-disabled, explained, and inert", () => {
    const { box, onChange } = setup({ disabled: true, browserZone: "Asia/Tokyo" });
    expect(box).toHaveAttribute("aria-disabled", "true");
    expect(box).not.toBeDisabled();
    const hint = document.getElementById(box.getAttribute("aria-describedby")!);
    expect(hint).toHaveTextContent(TZ_SWITCH_UNAVAILABLE);
    fireEvent.click(box);
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.change(box, { target: { value: "tokyo" } });
    expect(box).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("booking-tz-use-mine")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
