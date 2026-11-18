import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import type { Attendee } from "@/api/types";
import { ContactEmailAutocomplete } from "./ContactEmailAutocomplete";

function Harness({ exclude, onSubmit }: { exclude?: string[]; onSubmit?: () => void }) {
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState<Attendee | null>(null);
  return (
    <>
      <ContactEmailAutocomplete
        value={email}
        onValueChange={setEmail}
        onContactResolved={setContact}
        inputClassName="input"
        exclude={exclude}
        onSubmit={onSubmit}
      />
      <output data-testid="selected-name">{contact?.name ?? ""}</output>
    </>
  );
}

const CONTACTS: Attendee[] = [
  { email: "alex@example.com", name: "Alex Carter" },
  { email: "alice@example.com", name: "Alice Moore" },
  { email: "albert@example.com", name: "Albert Ng" },
];

afterEach(() => {
  vi.restoreAllMocks();
});

async function typeQuery(query: string) {
  const input = screen.getByRole("combobox", { name: "Email" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: query } });
  return input;
}

describe("ContactEmailAutocomplete keyboard and filtering", () => {
  it("highlights suggestions with the arrow keys and selects one with Enter", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue(CONTACTS);
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    const input = await typeQuery("al");
    await screen.findByRole("listbox");
    expect(input).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", options[1].id);

    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    // Wraps from the first option to the last.
    expect(screen.getAllByRole("option")[2]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("albert@example.com");
    expect(screen.getByTestId("selected-name")).toHaveTextContent("Albert Ng");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("submits on Enter when no suggestion is highlighted", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue(CONTACTS);
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    const input = await typeQuery("al");
    await screen.findByRole("listbox");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("al");
  });

  it("closes the list on Escape", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue(CONTACTS);
    render(<Harness />);
    const input = await typeQuery("al");
    await screen.findByRole("listbox");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("never suggests an excluded address, whatever its case", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue(CONTACTS);
    render(<Harness exclude={["ALEX@example.com", "albert@example.com "]} />);

    await typeQuery("al");
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("alice@example.com");
  });

  it("shows a failed search instead of suggestions, and invents none", async () => {
    vi.spyOn(api, "suggestAttendees").mockRejectedValue(new Error("Can't reach Paceday"));
    render(<Harness />);

    const input = await typeQuery("al");
    const notice = await screen.findByText(/search your calendar contacts/);
    expect(notice).toHaveAttribute("role", "status");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
    // Typing remains possible.
    fireEvent.change(input, { target: { value: "someone@example.com" } });
    expect(input).toHaveValue("someone@example.com");
  });

  it("does not search for a single character", async () => {
    const suggest = vi.spyOn(api, "suggestAttendees").mockResolvedValue(CONTACTS);
    render(<Harness />);
    await typeQuery("a");
    await new Promise((r) => setTimeout(r, 350));
    expect(suggest).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });
});
