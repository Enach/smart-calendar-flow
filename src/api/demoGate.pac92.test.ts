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

/**
 * A tab's own sessionStorage. Each tab gets its own object, kept for as long as
 * the tab is open: switching tabs moves no data and clears nothing, so a tab
 * cannot reach another tab's keys even by name — which is the whole property
 * under test. `localStorage` stays the one shared store, as in a browser.
 */
class TabStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

/** Open a tab (nothing is loaded in it yet). */
function openTab(): TabStorage {
  return new TabStorage();
}

/** Bring a tab to the front: from here on, `sessionStorage` is that tab's own. */
function switchTo(tab: TabStorage): void {
  vi.stubGlobal("sessionStorage", tab);
}

/** Load the page in the front tab: the start-up of the demo gate runs. */
async function startUp(): Promise<void> {
  vi.resetModules();
  await import("@/api/demoGate");
}

/** Enter the demo in the front tab (what the demo entry does, see src/demo/session.ts). */
function enterDemo(): void {
  sessionStorage.setItem(DEMO_SESSION, "1");
  backupStoresForDemo();
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("PAC-92: the demo store backup is scoped to its tab", () => {
  it("keeps the backup out of the shared storage every tab can see", () => {
    switchTo(openTab());
    localStorage.setItem(TEAMS, REAL_TEAMS);
    enterDemo();

    expect(sessionStorage.getItem(BACKUP)).not.toBeNull();
    expect(localStorage.getItem(BACKUP)).toBeNull();
    // The demo starts on empty stores, and says so to the other tabs.
    expect(localStorage.getItem(TEAMS)).toBeNull();
    expect(localStorage.getItem(TOUCHED)).toBe("1");
  });

  it("a second tab opened during a demo neither restores nor drops the demo tab's backup", async () => {
    const demoTab = openTab();
    const secondTab = openTab();

    switchTo(demoTab);
    localStorage.setItem(TEAMS, REAL_TEAMS);
    localStorage.setItem(MANAGER, REAL_MANAGER);
    enterDemo();
    localStorage.setItem(TEAMS, DEMO_TEAMS); // the demo writes through the shared store

    // The second tab loads the page: its own sessionStorage, no demo session.
    switchTo(secondTab);
    await startUp();
    expect(sessionStorage.getItem(BACKUP)).toBeNull(); // it cannot see the other tab's backup
    expect(localStorage.getItem(TEAMS)).toBeNull(); // and shows none of the demo's writes
    expect(localStorage.getItem(TOUCHED)).toBe("1"); // the demo over there is still marked

    // Back in the demo tab, with its backup untouched: "Exit demo" still puts
    // the real cache back.
    switchTo(demoTab);
    expect(sessionStorage.getItem(BACKUP)).not.toBeNull();
    restoreStoresAfterDemo();
    expect(localStorage.getItem(TEAMS)).toBe(REAL_TEAMS);
    expect(localStorage.getItem(MANAGER)).toBe(REAL_MANAGER);
    expect(sessionStorage.getItem(BACKUP)).toBeNull();
    expect(localStorage.getItem(TOUCHED)).toBeNull();
  });

  it("a reload of the demo tab keeps its backup and its demo data", async () => {
    switchTo(openTab());
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
    switchTo(openTab());
    localStorage.setItem(TEAMS, REAL_TEAMS);
    enterDemo();
    localStorage.setItem(TEAMS, DEMO_TEAMS);

    // That tab is gone, and its sessionStorage with it; the mark it left is not.
    switchTo(openTab());
    await startUp();
    expect(localStorage.getItem(TEAMS)).toBeNull();
    expect(localStorage.getItem(MANAGER)).toBeNull();
  });

  it("still honours a backup left in localStorage by a build from before PAC-92", async () => {
    switchTo(openTab());
    localStorage.setItem(BACKUP, JSON.stringify({ [TEAMS]: REAL_TEAMS, [MANAGER]: null }));
    localStorage.setItem(TEAMS, DEMO_TEAMS);

    await startUp();
    expect(localStorage.getItem(TEAMS)).toBe(REAL_TEAMS);
    expect(localStorage.getItem(MANAGER)).toBeNull();
    expect(localStorage.getItem(BACKUP)).toBeNull();
    expect(localStorage.getItem(TOUCHED)).toBeNull();
  });
});
