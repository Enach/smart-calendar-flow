/**
 * Demo-only (PAC-83 §3.3, contract §5.1): the label shown on every signed-in
 * page while a demo lasts. It cannot be dismissed and never says the server
 * is offline: it says the data is made up.
 */
import { DEMO_BUNDLE_MARKER } from "./index";

export default function DemoLabel() {
  return (
    <div
      role="status"
      data-testid="demo-label"
      data-demo-bundle={DEMO_BUNDLE_MARKER}
      className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-sm font-medium text-foreground"
    >
      Demo — everything here is made-up data, and nothing you change is saved to Paceday.
    </div>
  );
}
