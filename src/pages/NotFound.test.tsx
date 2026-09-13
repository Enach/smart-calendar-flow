import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import NotFound from "./NotFound";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NotFound", () => {
  it("returns users to the authenticated app", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={["/missing"]}>
        <NotFound />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /return to home/i })).toHaveAttribute("href", "/app");
  });
});
