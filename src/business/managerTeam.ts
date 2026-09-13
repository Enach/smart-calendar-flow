import type { ManagerRosterWire } from "@/contracts/managerTeam";
import type { TeamMember } from "@/api/manager";

export type ManagerTeamState =
  | { status: "loading"; team_id: string; members: [] }
  | { status: "ready"; team_id: string; members: TeamMember[] }
  | { status: "empty"; team_id: string; members: [] }
  | { status: "degraded"; team_id: string; members: TeamMember[] }
  | { status: "error"; team_id: string; members: []; error: unknown }
  | { status: "inconsistent"; team_id: string; members: []; received_team_id: string };

export function loadingManagerTeam(teamId: string): ManagerTeamState {
  return { status: "loading", team_id: teamId, members: [] };
}

export function failedManagerTeam(teamId: string, error: unknown): ManagerTeamState {
  return { status: "error", team_id: teamId, members: [], error };
}

export function managerTeamFromRoster(
  requestedTeamId: string,
  roster: ManagerRosterWire,
  normalize: (member: ManagerRosterWire["members"][number]) => TeamMember,
): ManagerTeamState {
  if (roster.team_id !== requestedTeamId) {
    return {
      status: "inconsistent",
      team_id: requestedTeamId,
      received_team_id: roster.team_id,
      members: [],
    };
  }
  if (roster.members.length === 0) return { status: "empty", team_id: requestedTeamId, members: [] };
  const members = roster.members.map(normalize);
  return members.some((member) => !member.data_available)
    ? { status: "degraded", team_id: requestedTeamId, members }
    : { status: "ready", team_id: requestedTeamId, members };
}

/** A response for another team is stale and cannot replace the active state. */
export function applyManagerTeamResult(
  current: ManagerTeamState,
  activeTeamId: string,
  incoming: ManagerTeamState,
): ManagerTeamState {
  if (incoming.team_id !== activeTeamId) return current;
  return incoming;
}
