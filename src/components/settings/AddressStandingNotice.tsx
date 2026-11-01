import { Info } from "lucide-react";

import { useAuth } from "@/contexts/useAuth";

/**
 * PAC-71 spec §3 "What standing allows": an account whose address is not
 * domain-confirmed works fully for its own user, and Settings says that the
 * address is not confirmed and that invitations addressed to it cannot be
 * accepted yet. Shown only when the server says `unconfirmed`
 * (CurrentUserResponse.addressStanding); nothing is shown otherwise.
 */
export function AddressStandingNotice() {
  const { user } = useAuth();
  if (user?.addressStanding !== "unconfirmed") return null;
  return (
    <div role="status" className="flex gap-2.5 rounded-xl border border-border bg-card p-4 text-sm text-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="font-medium">Your email address is not confirmed.</p>
        <p className="mt-0.5 text-foreground/80">
          Invitations sent to {user.email} cannot be accepted yet. Everything else in Paceday works as usual.
        </p>
      </div>
    </div>
  );
}
