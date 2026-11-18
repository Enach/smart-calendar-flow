import { useContext } from "react";

import { teamsApi } from "@/api/teams";
import { AuthContext } from "@/contexts/auth-context";

/**
 * The signed-in user's address, lowercase, for owner checks and for leaving
 * the user out of a team meeting's attendees (PAC-129 review, blocker 1). It
 * is the session's own address, never one derived from a team. The demo keeps
 * its local store's user, the one its teams were created with. Outside an
 * auth provider (component tests only) it is "", which shows no owner control.
 */
export function useTeamViewerEmail(): string {
  const auth = useContext(AuthContext);
  if (auth?.isDemo) return teamsApi.currentUserEmail().trim().toLowerCase();
  return (auth?.user?.email ?? "").trim().toLowerCase();
}
