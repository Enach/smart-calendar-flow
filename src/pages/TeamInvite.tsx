import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Check, Loader2, RefreshCw, Users } from "lucide-react";

import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/api/client";
import { teamInvitesApi, teamKeys } from "@/api/teams";
import { toast } from "@/hooks/useToast";

/**
 * Authenticated invite consumption.
 *
 * GET  /api/teams/invites/:token
 * POST /api/teams/invites/:token/accept
 *
 * The current session is preserved: no sign-out, no local team fabrication.
 * A mismatched email is rejected with the server message.
 */
export default function TeamInvite() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const inviteQ = useQuery({
    queryKey: teamKeys.invite(token),
    queryFn: () => teamInvitesApi.get(token),
    enabled: !!token,
    retry: false,
  });

  const acceptMut = useMutation({
    mutationFn: () => teamInvitesApi.accept(token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.all });
      qc.invalidateQueries({ queryKey: teamKeys.invite(token) });
      toast.success(`You joined ${inviteQ.data?.team_name ?? "the team"}.`);
      navigate("/app/team", { replace: true });
    },
  });

  return (
    <div className="min-h-screen bg-[#F7F8F4]">
      <Navbar />
      <main className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#9B7AE0]/10 text-[#9B7AE0]">
            <Users className="h-5 w-5" />
          </div>
          <h1 className="font-serif text-2xl tracking-tight text-foreground">Team invitation</h1>

          {inviteQ.isLoading ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading the invitation…
            </p>
          ) : inviteQ.error ? (
            <div className="mt-4 space-y-3">
              <p role="alert" className="flex items-start gap-2 text-sm text-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B91C1C]" />
                {apiErrorMessage(inviteQ.error)}
              </p>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => inviteQ.refetch()}>
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          ) : inviteQ.data ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                You have been invited to join{" "}
                <span className="font-medium text-foreground">{inviteQ.data.team_name}</span>
                {inviteQ.data.invited_email ? (
                  <>
                    {" "}as <span className="font-medium text-foreground">{inviteQ.data.invited_email}</span>
                  </>
                ) : null}
                .
              </p>

              {acceptMut.error && (
                <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {apiErrorMessage(acceptMut.error)}
                </p>
              )}

              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  onClick={() => acceptMut.mutate()}
                  disabled={acceptMut.isPending}
                  className="min-w-[170px] bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90"
                >
                  {acceptMut.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Joining…
                    </>
                  ) : (
                    <>
                      <Check className="mr-1.5 h-4 w-4" /> Accept invitation
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => navigate("/app/team")}>
                  Not now
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
