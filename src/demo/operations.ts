/**
 * Demo-only (PAC-83): the dispatcher src/api/demoGate.ts calls in a demo
 * session of a non-production build. An operation without a demo answer is
 * not handled here and goes to the server as usual.
 */
import { demoClientOps } from "./clientMocks";
import { demoSchedulingLinksOps } from "./schedulingLinks";
import { demoTeamsOps } from "./teams";
import { demoManagerOps } from "./manager";
import { seedDemoEvents } from "./demoData";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PAC-83: one table of heterogeneous signatures, called with the operation's own arguments.
type AnyOp = (...args: any[]) => unknown;

const GROUPS: Record<string, Record<string, AnyOp>> = {
  api: demoClientOps as unknown as Record<string, AnyOp>,
  schedulingLinksApi: demoSchedulingLinksOps as unknown as Record<string, AnyOp>,
  teams: demoTeamsOps as unknown as Record<string, AnyOp>,
  manager: demoManagerOps as unknown as Record<string, AnyOp>,
};

// A demo restored after a reload gets its seeded week back.
seedDemoEvents();

/** Every "<group>.<name>" the demo answers (used by tests). */
export function demoOperationKeys(): string[] {
  return Object.entries(GROUPS).flatMap(([group, ops]) => Object.keys(ops).map((name) => `${group}.${name}`));
}

export async function runDemoOperation(op: string, args: readonly unknown[]): Promise<{ handled: boolean; value?: unknown }> {
  const dot = op.indexOf(".");
  const fn = GROUPS[op.slice(0, dot)]?.[op.slice(dot + 1)];
  if (!fn) return { handled: false };
  return { handled: true, value: await fn(...args) };
}
