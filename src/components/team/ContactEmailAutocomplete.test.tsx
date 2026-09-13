import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import type { Attendee } from "@/api/types";
import { ContactEmailAutocomplete } from "./ContactEmailAutocomplete";

function Harness() {
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState<Attendee | null>(null);
  return (
    <>
      <ContactEmailAutocomplete
        value={email}
        onValueChange={setEmail}
        onContactResolved={setContact}
        inputClassName="input"
      />
      <output data-testid="selected-name">{contact?.name ?? ""}</output>
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContactEmailAutocomplete", () => {
  it("searches calendar contacts and resolves the selected display name", async () => {
    const suggest = vi.spyOn(api, "suggestAttendees").mockResolvedValue([
      { email: "milos.kojic@gorgias.com", name: "Milos Kojic" },
    ]);
    render(<Harness />);

    const input = screen.getByRole("combobox", { name: "Email" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "milos" } });

    await waitFor(() => expect(suggest).toHaveBeenCalledWith("milos"));
    fireEvent.click(await screen.findByRole("button", { name: /Milos Kojic/i }));

    expect(input).toHaveValue("milos.kojic@gorgias.com");
    expect(screen.getByTestId("selected-name")).toHaveTextContent("Milos Kojic");
  });

  it("resolves a typed exact email without requiring a click", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([
      { email: "alex@example.com", name: "Alex Carter" },
    ]);
    render(<Harness />);

    const input = screen.getByRole("combobox", { name: "Email" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "alex@example.com" } });
    fireEvent.blur(input);

    await waitFor(() => expect(screen.getByTestId("selected-name")).toHaveTextContent("Alex Carter"));
  });
});
