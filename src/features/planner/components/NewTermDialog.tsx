import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@/components/ui/form";
import { useCreateTerm } from "../hooks";
import { applyFieldErrors, describeApiError, hasCode } from "../lib/errors";
import {
  TERM_SERVER_FIELD_ALIASES,
  termFormDefaults,
  termFormSchema,
  toTermPayload,
  type TermFormInput,
  type TermFormValues,
} from "../lib/termForm";
import { FormDialog } from "./FormDialog";
import { TermSettingsFields } from "./TermSettingsFields";

interface NewTermDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Reference pattern for a create dialog: useForm + zodResolver, defaults reset on open,
// mutation built with `silent: true`, server errors mapped onto fields or shown in the dialog.
export function NewTermDialog({ open, onOpenChange }: NewTermDialogProps) {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateTerm({ silent: true });

  const form = useForm<TermFormInput, unknown, TermFormValues>({
    resolver: zodResolver(termFormSchema),
    defaultValues: termFormDefaults(),
  });

  useEffect(() => {
    if (open) {
      form.reset(termFormDefaults());
      setFormError(null);
    }
  }, [open, form]);

  const submit = async (values: TermFormValues) => {
    setFormError(null);
    try {
      const { term } = await create.mutateAsync(toTermPayload(values, "create"));
      onOpenChange(false);
      navigate(`/admin/planner/terms/${term.id}`);
    } catch (err) {
      if (hasCode(err, "DUPLICATE")) {
        form.setError("academic_year", { type: "server", message: "A term for this year, half and branch already exists" });
      } else if (!applyFieldErrors(err, form.setError, { aliases: TERM_SERVER_FIELD_ALIASES })) {
        setFormError(describeApiError(err));
      }
    }
  };

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="New term"
        description="One term covers every semester of one branch for an odd or even half of the year, so faculty and rooms are shared across all its divisions. You can change these settings later until sessions are placed."
        submitLabel="Create term"
        submitting={create.isPending}
        error={formError}
        widthClass="sm:max-w-[680px]"
        onSubmit={form.handleSubmit(submit)}
      >
        <TermSettingsFields />
      </FormDialog>
    </Form>
  );
}
