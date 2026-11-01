/**
 * Demo-only (PAC-83 §3.3): entering and leaving the demo session. The demo
 * entry control is the only caller of startDemoSession (spec AC-15b).
 */
import type { AuthUser } from "@/contexts/AuthContext";
import { backupStoresForDemo } from "@/api/demoGate";
import { clearDemoEvents, seedDemoEvents } from "./demoData";

export const DEMO_USER: AuthUser = {
  id: "demo",
  name: "Alex Demo",
  email: "alex@demo.paceday.com",
};

/** Set the demo session flag and seed the demo week. */
export function startDemoSession(): AuthUser {
  try {
    sessionStorage.setItem("paceday:demo", "1");
  } catch {
    /* storage unavailable: the demo lasts for this page only */
  }
  backupStoresForDemo();
  seedDemoEvents();
  return DEMO_USER;
}

/** Remove the demo's seeded week from memory (the flag is cleared by the caller). */
export function endDemoSession(): void {
  clearDemoEvents();
}
