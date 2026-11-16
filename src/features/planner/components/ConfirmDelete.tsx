import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { describeApiError } from "../lib/errors";

interface ConfirmDeleteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  /**
   * Run the delete (usually `() => del.mutateAsync(id)`). The dialog closes when it resolves and
   * stays open showing the error when it rejects. Build the mutation with `silent: true` so the
   * error is shown here once instead of also as a toast.
   */
  onConfirm: () => Promise<unknown>;
  /** Turn a rejection into the text shown in the dialog (e.g. a friendlier message for IN_USE). */
  errorText?: (err: unknown) => string;
}

export function ConfirmDelete({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  errorText = describeApiError,
}: ConfirmDeleteProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (pending) return;
    if (!next) setError(null);
    onOpenChange(next);
  };

  const run = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          {/* A plain Button, not AlertDialogAction, so the dialog does not auto-close before the request ends. */}
          <Button variant="destructive" onClick={run} disabled={pending}>
            {pending ? "Deleting..." : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
