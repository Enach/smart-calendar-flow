/**
 * A host's address is not its identity. PR #207 stopped this component from
 * *displaying* an address on the public booking page; it kept *reading* one for
 * two internal purposes that sit outside the `audience` gate — the React list
 * key and the avatar colour seed. Both only need a stable per-host
 * discriminator, and `PublicHost` has no id to offer, so both now use the
 * host's position in the array.
 *
 * `PublicHost.email` is on its way out of the DTO. These tests simulate that
 * removal, which the generated types cannot express yet (`email: string` is
 * still required), with a cast at the one place it is needed: a host object
 * carrying no address at all. Before this change such a host took `paletteFor`
 * — and the whole booking page — down with a TypeError.
 */
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { render } from "@testing-library/react";

import { HostAvatars } from "./HostAvatars";

type Hosts = ComponentProps<typeof HostAvatars>["hosts"];

/** A hosts array as a server that has dropped `email` would send it. */
const addressless = (...hosts: Array<{ name?: string; avatar_url?: string }>): Hosts => hosts as Hosts;

/**
 * One element per rendered host: the inner circle that carries the palette
 * classes. Found by structure, not by `title` — an owner-side host with
 * neither name nor address has no title to be found by.
 */
const cells = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("div.group")).map((el) => el.firstElementChild as HTMLElement);

/** The palette entry a host was given, as the pair of classes `paletteFor` returns. */
const palettes = (container: HTMLElement) =>
  cells(container).map((el) =>
    Array.from(el.classList)
      .filter((c) => c.startsWith("bg-") || c.startsWith("text-"))
      .join(" "),
  );

describe("HostAvatars renders hosts that carry no address", () => {
  it("renders a nameless public host with no address at all", () => {
    const { container } = render(<HostAvatars audience="public" hosts={addressless({})} />);
    expect(cells(container)).toHaveLength(1);
    expect(container.querySelector("svg")).not.toBeNull(); // the User icon, as for any nameless public host
    expect(container.querySelectorAll("[title]")[0]?.getAttribute("title")).toBe("Host");
  });

  it("renders several public hosts with no address at all", () => {
    const { container } = render(
      <HostAvatars audience="public" hosts={addressless({ name: "Alice Martin" }, {}, { name: "Bob Stone" })} />,
    );
    expect(cells(container)).toHaveLength(3);
    // Initials for the two named hosts, the User icon for the nameless one.
    expect(container.textContent).toBe("AMBS");
  });

  it("renders an owner-side host with no address at all", () => {
    const { container } = render(<HostAvatars hosts={addressless({}, { name: "Alice Martin" })} />);
    expect(cells(container)).toHaveLength(2);
    // No name and no address leaves `initials` its own fallback; nothing throws.
    expect(container.textContent).toBe("?AM");
  });
});

describe("HostAvatars identity does not come from the address", () => {
  const byAddress = (domain: string): Hosts => [
    { email: `alice@${domain}`, name: "Alice Martin" },
    { email: `bob@${domain}`, name: "Bob Stone" },
    { email: `carol@${domain}`, name: "Carol Day" },
  ];

  it("gives a host the same colour whatever its address", () => {
    const first = render(<HostAvatars hosts={byAddress("one.test")} />);
    const second = render(<HostAvatars hosts={byAddress("another-much-longer.example")} />);
    expect(palettes(first.container)).toEqual(palettes(second.container));
  });

  it("keeps the same DOM node for a host whose address changes", () => {
    const { container, rerender } = render(<HostAvatars hosts={byAddress("one.test")} />);
    const before = cells(container);
    rerender(<HostAvatars hosts={byAddress("another-much-longer.example")} />);
    const after = cells(container);
    // A key built from the address remounts every chip when the address
    // changes; a positional key keeps the nodes and only updates them.
    expect(after).toHaveLength(before.length);
    after.forEach((el, i) => expect(el).toBe(before[i]));
  });

  it("keeps colours and nodes stable across a re-render of the same list, with no duplicate keys", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const hosts = byAddress("one.test");
      const { container, rerender } = render(<HostAvatars hosts={hosts} />);
      const before = { nodes: cells(container), palettes: palettes(container) };
      rerender(<HostAvatars hosts={hosts} />);
      expect(palettes(container)).toEqual(before.palettes);
      cells(container).forEach((el, i) => expect(el).toBe(before.nodes[i]));
      expect(warn.mock.calls.flat().join(" ")).not.toContain("same key");
    } finally {
      warn.mockRestore();
    }
  });

  it("gives the hosts of one list distinct colours", () => {
    const { container } = render(<HostAvatars hosts={byAddress("one.test")} />);
    const given = palettes(container);
    expect(new Set(given).size).toBe(given.length);
  });
});
