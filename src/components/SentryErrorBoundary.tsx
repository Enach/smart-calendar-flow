import * as Sentry from "@sentry/react";
import type { ReactNode } from "react";

/**
 * PAC-14 §4: wrap the root component in a Sentry error boundary so a render
 * exception is captured and a fallback UI is shown instead of a white screen.
 */

function Fallback() {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: "0.75rem",
        padding: "2rem",
        textAlign: "center",
        fontFamily:
          "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
        Something went wrong
      </h1>
      <p style={{ margin: 0, opacity: 0.75, maxWidth: "28rem" }}>
        The page hit an unexpected error and could not be displayed. The issue
        has been reported. Try reloading the page.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          marginTop: "0.5rem",
          padding: "0.5rem 1rem",
          borderRadius: "0.5rem",
          border: "1px solid currentColor",
          background: "transparent",
          cursor: "pointer",
          font: "inherit",
        }}
      >
        Reload
      </button>
    </div>
  );
}

export function SentryErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Sentry.ErrorBoundary fallback={<Fallback />}>
      {children}
    </Sentry.ErrorBoundary>
  );
}

export default SentryErrorBoundary;
