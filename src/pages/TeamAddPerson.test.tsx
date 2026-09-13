import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import { AddPersonDialog } from "./Team";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AddPersonDialog", () => {
  it("prefills the display name from the selected calendar contact", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([
      { email: "milos.kojic@gorgias.com", name: "Milos Kojic" },
    ]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <AddPersonDialog open teamId="team-1" onOpenChange={() => {}} onAdded={() => {}} />
      </QueryClientProvider>,
    );

    const email = screen.getByRole("combobox", { name: "Email" });
    fireEvent.focus(email);
    fireEvent.change(email, { target: { value: "milos" } });
    fireEvent.click(await screen.findByRole("button", { name: /Milos Kojic/i }));

    expect(email).toHaveValue("milos.kojic@gorgias.com");
    expect(screen.getByPlaceholderText("Alex Carter")).toHaveValue("Milos Kojic");
  });

  it("does not overwrite a manually entered display name", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([
      { email: "alex@example.com", name: "Alex Carter" },
    ]);
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <AddPersonDialog open teamId="team-1" onOpenChange={() => {}} onAdded={() => {}} />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText("Alex Carter"), { target: { value: "My Alex" } });
    const email = screen.getByRole("combobox", { name: "Email" });
    fireEvent.focus(email);
    fireEvent.change(email, { target: { value: "alex@example.com" } });
    await waitFor(() => expect(api.suggestAttendees).toHaveBeenCalled());
    expect(screen.getByPlaceholderText("Alex Carter")).toHaveValue("My Alex");
  });
});
