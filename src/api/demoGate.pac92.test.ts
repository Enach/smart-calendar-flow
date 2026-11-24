/**
 * PAC-92 (PAC-83 AC-15): the demo's store backup belongs to the tab that
 * entered the demo. A second tab opened during a demo neither reads nor drops
 * that backup and shows none of the demo's writes, and the demo tab's own exit
 * still puts the real cache back. A demo tab that closed without "Exit demo"
 * leaves nothing behind for the next tab either.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { backupStoresForDemo, restoreStoresAfterDemo } from "@/api/demoGate";

const TEAMS = "paceday:teams:v1";
const MANAGER = "paceday:manager:v1";
const BACKUP = "paceday:stores-before-demo";
const TOUCHED = "paceday:demo-touched-stores";
const DEMO_SESSION = "paceday:demo";

const REAL_TEAMS = JSON.stringify({ teams: [{ id: "real", name: "Real team" }] });
const REAL_MANAGER = JSON.stringify({ profile: { is_manager: true } });
const DEMO_TEAMS = JSON.stringify({ teams: [{ id: "demo", name: "Demo squad" }] });

type Tab = Record<string, string>;

/** What this tab's sessionStorage holds (a tab keeps it across reloads). */
function tabState(): Tab {
  const out: Tab = {};
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (key !== null) out[key] = sessionStorage.getItem(key) ?? "";
  }
  return out;
}

/** Switch to a tab: sessionStorage is per tab, localStorage is shared. */
function switchTo(tab: Tab): void {
  sessionStorage.clear();
  for (const [key, value] of Object.entries(tab)) sessionStorage.setItem(key, value);
}

/** Load the page in the current tab: the start-up of the demo gate runs. */
async function startUp(): Promise<void> {
  vi.resetModules();
  await import("@/api/demoGate");
}

/** Enter the demo in the current tab (what the demo entry does, see src/demo/session.ts). */
function enterDemo(): void {
  sessionStorage.setItem(DEMO_SESSION, "1");
  backupStoresForDemo();
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("PAC-92: the demo store backup is scoped to its tab", () => {
  it("keeps the backup out of the shared storage every tab can see", () => {
    localStorage.setItem(TEAMS, REAL_TEAMS);
    enterDemo();

    expect(sessionStorage.getItem(BACKUP)).not.toBeNull();
    expect(localStorage.getItem(BACKUP)).toBeNull();
    // The demo starts on empty stores, and says so to the other tabs.
    expect(localStorage.getItem(TEAMS)).toBeNull();
    expect(localStorage.getItem(TOUCHED)).toBe("1");
  });

  it("a second tab opened during a demo neither restores nor drops the demo tab's backup", async () => {
    localStorage.setItem(TEAMS, REAL_TEAMS);
    localStorage.setItem(MANAGER, REAL_MANAGER);
    enterDemo();
    localStorage.setItem(TEAMS, DEMO_TEAMS); // the demo writes through the shared store
    const demoTab = tabState();

    // A second tab opens: its own empty sessionStorage, no demo session.
    switchTo({});
    await startUp();
    expect(sessionStorage.getItem(BACKUP)).toBeNull(); // it cannot see the other tab's backup
    expect(localStorage.getItem(TEAMS)).toBeNull(); // and shows none of the demo's writes
    expect(localStorage.getItem(TOUCHED)).toBe("1"); // the demo over there is still marked

    // Back in the demo tab: "Exit demo" still puts the real cache back.
    switchTo(demoTab);
    restoreStoresAfterDemo();
    expect(localStorage.getItem(TEAMS)).toBe(REAL_TEAMS);
    expect(localStorage.getItem(MANAGER)).toBe(REAL_MANAGER);
    expect(sessionStorage.getItem(BACKUP)).toBeNull();
    expect(localStorage.getItem(TOUCHED)).toBeNull();
  });

  it("a reload of the demo tab keeps its backup and its demo data", async () => {
    localStorage.setItem(TEAMS, REAL_TEAMS);
    enterDemo();
    localStorage.setItem(TEAMS, DEMO_TEAMS);

    await startUp(); // same tab: sessionStorage survives the reload
    expect(localStorage.getItem(TEAMS)).toBe(DEMO_TEAMS);
    expect(sessionStorage.getItem(BACKUP)).not.toBeNull();

    restoreStoresAfterDemo();
    expect(localStorage.getItem(TEAMS)).toBe(REAL_TEAMS);
  });

  it("a demo tab closed without Exit leaves no demo data for the next tab", async () => {
    localStorage.setItem(TEAMS, REAL_TEAMS);
    enterDemo();
    localStorage.setItem(TEAMS, DEMO_TEAMS);

    // The tab is gone, and its backup with it; the mark it left is not.
    switchTo({});
    await startUp();
    expect(localStorage.getItem(TEAMS)).toBeNull();
    expect(localStorage.getItem(MANAGER)).toBeNull();
  });

  it("still honours a backup left in localStorage by a build from before PAC-92", async () => {
    localStorage.setItem(BACKUP, JSON.stringify({ [TEAMS]: REAL_TEAMS, [MANAGER]: null }));
    localStorage.setItem(TEAMS, DEMO_TEAMS);

    await startUp();
    expect(localStorage.getItem(TEAMS)).toBe(REAL_TEAMS);
    expect(localStorage.getItem(MANAGER)).toBeNull();
    expect(localStorage.getItem(BACKUP)).toBeNull();
    expect(localStorage.getItem(TOUCHED)).toBeNull();
  });
});
