import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button-variants";
import type { BookerErasurePolicy, SchedulingLink } from "@/api/types";

/**
 * PAC-40 (contract section 2.4): the delete confirmation. It always says that
 * bookings stop and that the link and its bookings move to the archive. It
 * promises erasure only when the server's BookerErasurePolicy says erasure is
 * enabled, and then quotes the server's retention_days. A policy that is
 * disabled, still loading or failed to load (`policy` undefined) promises
 * nothing: the figure is never hard-coded here.
 */
export function ArchiveDeleteDialog({
  link,
  policy,
  onConfirm,
  onOpenChange,
}: {
  link: SchedulingLink | null;
  policy: BookerErasurePolicy | undefined;
  onConfirm: (link: SchedulingLink) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const promiseErasure = policy?.enabled === true;
  return (
    <AlertDialog open={!!link} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="link-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{link?.title}”?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p data-testid="link-delete-copy">
                People with this link will no longer be able to book. The link and its bookings move to your archive,
                where only you can see them. A deleted link can’t be restored.
              </p>
              {promiseErasure && (
                <p data-testid="link-delete-erasure">
                  Bookers’ names and emails are erased {policy.retention_days} days after the link’s last booking.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="link-delete-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction
            data-testid="link-delete-confirm"
            className={buttonVariants({ variant: "destructive" })}
            onClick={() => {
              if (link) onConfirm(link);
            }}
          >
            Delete link
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
