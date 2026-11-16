import type { FormEventHandler, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Pass `form.handleSubmit(onValid)`. */
  onSubmit: FormEventHandler<HTMLFormElement>;
  submitLabel?: string;
  submitting?: boolean;
  /** A form-level error (anything that is not tied to one field). */
  error?: string | null;
  /** Tailwind max-width class for the dialog on >= sm screens. */
  widthClass?: string;
  children: ReactNode;
}

/**
 * Dialog + <form> + Cancel/Submit footer. Wrap it in RHF's `<Form {...form}>` (shadcn form.tsx) so
 * FormField/FormItem/FormMessage inside `children` work:
 *
 *   <Form {...form}>
 *     <FormDialog open onOpenChange title onSubmit={form.handleSubmit(save)} submitting={m.isPending} error={err}>
 *       <FormField ... />
 *     </FormDialog>
 *   </Form>
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  submitLabel = "Save",
  submitting,
  error,
  widthClass = "sm:max-w-[520px]",
  children,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className={cn("max-h-[90vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl sm:rounded-lg", widthClass)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {children}
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
