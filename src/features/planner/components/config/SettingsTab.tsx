import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LockKeyhole } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { TermSettingsFields } from "../TermSettingsFields";
import { useTerm, useUpdateTerm } from "../../hooks";
import { applyFieldErrors, describeApiError, hasCode } from "../../lib/errors";
import {
  TERM_SERVER_FIELD_ALIASES,
  diffTermPatch,
  termFormDefaults,
  termFormSchema,
  toTermPayload,
  type TermFormInput,
  type TermFormValues,
} from "../../lib/termForm";

// A tab that edits one existing record: load with a query hook, reset the form to the loaded data,
// send only what changed, and keep server errors visible next to the form.
export function SettingsTab({ termId }: { termId: string }) {
  const detail = useTerm(termId);
  const term = detail.data?.term;
  const [locked, setLocked] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const update = useUpdateTerm(termId, { silent: true });

  const form = useForm<TermFormInput, unknown, TermFormValues>({
    resolver: zodResolver(termFormSchema),
    defaultValues: termFormDefaults(term),
  });

  // Re-seed from the saved term on first load, when a different term is shown, and when the saved
  // term changes while the form is clean. Never while the user has unsaved edits: a window-focus
  // refetch (or an edit made elsewhere) must not throw their typing away.
  const isDirtyRef = useRef(false);
  isDirtyRef.current = form.formState.isDirty;
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!term) return;
    const differentTerm = seededFor.current !== term.id;
    if (differentTerm || !isDirtyRef.current) {
      seededFor.current = term.id;
      form.reset(termFormDefaults(term));
    }
  }, [term, form]);

  if (detail.isLoading) return <Skeleton className="h-96 w-full" />;
  if (detail.error || !term) {
    return (
      <div className="rounded-md border p-8 text-center">
        <p className="text-sm text-destructive">{describeApiError(detail.error ?? new Error("Term not found"))}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => detail.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const submit = async (values: TermFormValues) => {
    setFormError(null);
    const patch = diffTermPatch(term, toTermPayload(values, "patch"));
    if (Object.keys(patch).length === 0) {
      toast({ title: "No changes to save" });
      return;
    }
    try {
      await update.mutateAsync(patch);
      // The saved values are the new baseline, so the form is clean again (and later refetches may re-seed it).
      form.reset(form.getValues());
      setLocked(false);
      toast({ title: "Settings saved" });
    } catch (err) {
      if (hasCode(err, "LOCKED_BY_PLACEMENTS")) {
        setLocked(true);
      } else if (hasCode(err, "DUPLICATE")) {
        form.setError("academic_year", { type: "server", message: "A term for this year, half and branch already exists" });
      } else if (!applyFieldErrors(err, form.setError, { aliases: TERM_SERVER_FIELD_ALIASES })) {
        setFormError(describeApiError(err));
      }
    }
  };

  return (
    <section aria-label="Term settings" className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Term settings</h2>
        <p className="text-sm text-muted-foreground">Calendar, daily timings, slot lengths and breaks for this term.</p>
      </div>

      {locked && (
        <Alert variant="destructive">
          <LockKeyhole className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Timings are locked</AlertTitle>
          <AlertDescription>
            Sessions are already placed on the timetable, so working days, day start/end, grid, slot lengths and breaks can't change. Remove the placements first, or save only the other fields
            (name, dates).
          </AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-5">
          <TermSettingsFields />
          {formError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {formError}
            </p>
          )}
          <div className="flex gap-3">
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Saving..." : "Save settings"}
            </Button>
            <Button type="button" variant="outline" disabled={update.isPending || !form.formState.isDirty} onClick={() => form.reset(termFormDefaults(term))}>
              Discard changes
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}
