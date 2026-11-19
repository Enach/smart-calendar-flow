/**
 * PAC-149 AC-11 (spec §3.4, §3.7, contract §5): a pending entry is an
 * invitation to an address. Its chip tooltip shows the address, and never a
 * name or picture — even if one were sent — so what the owner sees does not
 * depend on whether the address has an account.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { HostAvatars } from "./HostAvatars";

const titles = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[title]")).map((el) => el.getAttribute("title"));

describe("PAC-149 AC-11: the pending chip", () => {
  it("a pending host with no name shows its address in the tooltip", () => {
    const { container } = render(
      <HostAvatars hosts={[{ email: "someone@unknown.example", is_owner: false, status: "pending" }]} />,
    );
    expect(titles(container)).toEqual(["someone@unknown.example — awaiting acceptance"]);
    expect(container.textContent).toBe("SO");
  });

  it("a pending host is shown by address even when a name and picture are present", () => {
    const { container } = render(
      <HostAvatars
        hosts={[{ email: "alice@co.com", name: "Alice Martin", avatar_url: "https://img.test/a.png", is_owner: false, status: "pending" }]}
      />,
    );
    expect(titles(container)).toEqual(["alice@co.com — awaiting acceptance"]);
    expect(container.textContent).not.toContain("AM");
    expect(container.querySelector("img")).toBeNull();
  });

  it("a declined entry is shown by address and status only, even when a name and picture are present (spec §3.4, D-6)", () => {
    const { container } = render(
      <HostAvatars
        hosts={[{ email: "dee@co.com", name: "Dee Clined", avatar_url: "https://img.test/d.png", is_owner: false, status: "declined" }]}
      />,
    );
    expect(titles(container)).toEqual(["dee@co.com"]);
    expect(container.textContent).toBe("DE");
    expect(container.innerHTML).not.toContain("Dee Clined");
    expect(container.querySelector("img")).toBeNull();
  });

  it("with showPending off, a pending entry is still shown by address only", () => {
    const { container } = render(
      <HostAvatars
        showPending={false}
        hosts={[{ email: "alice@co.com", name: "Alice Martin", avatar_url: "https://img.test/a.png", is_owner: false, status: "pending" }]}
      />,
    );
    expect(titles(container)).toEqual(["alice@co.com"]);
    expect(container.querySelector("img")).toBeNull();
  });

  it("an accepted host keeps its name and picture (unchanged)", () => {
    const { container } = render(
      <HostAvatars
        hosts={[{ email: "alice@co.com", name: "Alice Martin", avatar_url: "https://img.test/a.png", is_owner: false, status: "accepted" }]}
      />,
    );
    expect(titles(container)).toEqual(["Alice Martin"]);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://img.test/a.png");
  });

  it("two pending entries, one whose address has an account and one not, render identically modulo the address", () => {
    const html = (email: string, name?: string) =>
      render(<HostAvatars hosts={[{ email, name, is_owner: false, status: "pending" }]} />).container.innerHTML.split(email).join("ADDR");
    // Same initials source shape so the palette/initials are not what differs:
    // the account holder may arrive with a name from an old server or the demo.
    expect(html("ab@x.example", "Zed Holder")).toBe(html("ab@x.example"));
  });
});
