/**
 * 2026-11-22 audit, finding 4: `GET /api/book/:slug` is unauthenticated and
 * its slug is guessable, so a walk over common slugs used to harvest host
 * addresses from the chips this component renders. With `audience="public"` no
 * address reaches the page; the owner's own screens are unchanged.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { HostAvatars } from "./HostAvatars";

const titles = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[title]")).map((el) => el.getAttribute("title"));

describe("HostAvatars, audience=public", () => {
  it("renders no address for a host with no display name", () => {
    const { container } = render(<HostAvatars audience="public" hosts={[{ email: "host@co.com" }]} />);
    expect(container.innerHTML).not.toContain("host@co.com");
    expect(container.innerHTML).not.toContain("host");
    expect(titles(container)).toEqual(["Host"]);
  });

  it("renders no address for a host whose display name is blank", () => {
    const { container } = render(<HostAvatars audience="public" hosts={[{ email: "host@co.com", name: "   " }]} />);
    expect(container.innerHTML).not.toContain("host@co.com");
    expect(titles(container)).toEqual(["Host"]);
  });

  it("shows initials off the display name, never off the address", () => {
    const { container } = render(
      <HostAvatars audience="public" hosts={[{ email: "zebra@co.com", name: "Alice Martin" }]} />,
    );
    expect(titles(container)).toEqual(["Alice Martin"]);
    expect(container.textContent).toBe("AM");
    expect(container.innerHTML).not.toContain("zebra");
  });

  it("keeps a nameless host's picture — a picture is not an address", () => {
    const { container } = render(
      <HostAvatars audience="public" hosts={[{ email: "host@co.com", avatar_url: "https://img.test/a.png" }]} />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://img.test/a.png");
    expect(container.innerHTML).not.toContain("host@co.com");
  });

  it("holds no address with several nameless hosts", () => {
    const { container } = render(
      <HostAvatars audience="public" hosts={[{ email: "a@co.com" }, { email: "b@co.com", name: "Bee" }]} />,
    );
    expect(container.innerHTML).not.toContain("a@co.com");
    expect(titles(container)).toEqual(["Host", "Bee"]);
  });
});

describe("HostAvatars, audience=owner (the default)", () => {
  it("still names a host by address when it has no display name", () => {
    const { container } = render(<HostAvatars hosts={[{ email: "host@co.com" }]} />);
    expect(titles(container)).toEqual(["host@co.com"]);
    expect(container.textContent).toBe("HO");
  });
});
