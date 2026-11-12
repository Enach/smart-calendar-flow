/**
 * Demo-only (PAC-83 §3.3, contract §4.4): the one way into the demo. Shown on
 * the sign-in dialog's initial view of a non-production build only — never
 * after an error.
 */
import { Button } from "@/components/ui/button";
import type { AuthUser } from "@/contexts/AuthContext";
import { startDemoSession } from "./session";

export default function DemoEntry({ onStarted }: { onStarted: (user: AuthUser) => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      data-testid="demo-entry"
      onClick={() => onStarted(startDemoSession())}
      className="mt-4 h-11 w-full rounded-md text-sm"
    >
      Explore a demo — made-up data
    </Button>
  );
}
