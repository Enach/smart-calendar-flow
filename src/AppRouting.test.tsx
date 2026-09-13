import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { LegacyCalendarNewRedirect } from "./App";

function CurrentLocation() {
  const location = useLocation();
  return <output>{`${location.pathname}${location.search}`}</output>;
}

describe("legacy calendar creation route", () => {
  it("redirects to the calendar root while preserving prefill parameters", () => {
    render(
      <MemoryRouter
        initialEntries={[
          "/app/calendar/new?attendees=milos.kojic%40gorgias.com&duration=30&title=1%3A1+with+milos.kojic",
        ]}
      >
        <Routes>
          <Route path="/app/calendar/new" element={<LegacyCalendarNewRedirect />} />
          <Route path="/app" element={<CurrentLocation />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/\/app\?attendees=milos\.kojic%40gorgias\.com/)).toHaveTextContent(
      "/app?attendees=milos.kojic%40gorgias.com&duration=30&title=1%3A1+with+milos.kojic",
    );
  });
});
