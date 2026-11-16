import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ConfirmDelete } from "../ConfirmDelete";
import { DataTable, type Column } from "../DataTable";
import { SelectField, SwitchField, TextField } from "../FormFields";
import { FormDialog } from "../FormDialog";
import { useCreateSubject, useDeleteSubject, useSubjects, useUpdateSubject } from "../../hooks";
import { applyFieldErrors, describeApiError, hasCode } from "../../lib/errors";
import { optionalInt, requiredInt } from "../../lib/forms";
import type { Subject } from "../../types";

const subjectSchema = z.object({
  // Limits mirror the API (Vyas-Backend/services/planner/subjects.js) so anything the import accepts can be edited here.
  code: z.string().trim().min(1, "Code is required").max(40, "At most 40 characters"),
  name: z.string().trim().min(1, "Name is required").max(200, "At most 200 characters"),
  kind: z.enum(["theory", "lab"]),
  duration_min: optionalInt("Duration", 1, 1440),
  weekly_count: requiredInt("Weekly count", 0, 100),
  semester_total: optionalInt("Semester total", 0, 10000),
  allow_second_lab: z.boolean(),
});
type SubjectFormInput = z.input<typeof subjectSchema>;
type SubjectFormValues = z.output<typeof subjectSchema>;

const subjectDefaults = (s?: Subject | null): SubjectFormInput => ({
  code: s?.code ?? "",
  name: s?.name ?? "",
  kind: s?.kind ?? "theory",
  duration_min: s?.duration_min ?? "",
  weekly_count: s?.weekly_count ?? 1,
  semester_total: s?.semester_total ?? "",
  allow_second_lab: s?.allow_second_lab ?? false,
});

const KIND_OPTIONS = [
  { value: "theory", label: "Theory" },
  { value: "lab", label: "Lab" },
];

export function SubjectsTab({ termId }: { termId: string }) {
  const subjects = useSubjects(termId);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; editing: Subject | null }>({ open: false, editing: null });
  const [toDelete, setToDelete] = useState<Subject | null>(null);
  const remove = useDeleteSubject(termId, { silent: true, successMessage: "Subject deleted" });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subjects.data;
    return subjects.data?.filter((s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }, [subjects.data, search]);

  const columns: Column<Subject>[] = [
    { key: "code", header: "Code", cell: (s) => <span className="font-mono font-medium">{s.code}</span> },
    { key: "name", header: "Name", cell: (s) => <span className="font-medium">{s.name}</span> },
    {
      key: "kind",
      header: "Kind",
      cell: (s) => <Badge variant={s.kind === "lab" ? "default" : "secondary"}>{s.kind === "lab" ? "Lab" : "Theory"}</Badge>,
    },
    { key: "duration", header: "Duration", cell: (s) => <span className="tabular-nums">{s.duration_min} min</span> },
    { key: "weekly", header: "Per week", cell: (s) => <span className="tabular-nums">{s.weekly_count}</span> },
    {
      key: "total",
      header: "Semester total",
      cell: (s) => <span className="tabular-nums">{s.semester_total ?? <span className="text-muted-foreground">-</span>}</span>,
      className: "hidden md:table-cell",
    },
    {
      key: "second_lab",
      header: "2nd lab",
      cell: (s) =>
        s.kind === "lab" ? (
          s.allow_second_lab ? (
            <Badge variant="outline">Allowed</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">No</span>
          )
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
      className: "hidden lg:table-cell",
    },
  ];

  return (
    <section className="space-y-4" aria-label="Subjects">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Subjects</h2>
          <p className="text-sm text-muted-foreground">The subjects taught in this term. Offerings attach a subject to a division.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search subjects" aria-label="Search subjects" className="w-40 sm:w-48" />
          <Button onClick={() => setDialog({ open: true, editing: null })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add subject
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(s) => s.id}
        isLoading={subjects.isLoading}
        error={subjects.error}
        onRetry={() => subjects.refetch()}
        emptyMessage={search ? "No subjects match your search." : "No subjects yet. Add one, or import a subjects file."}
        actions={(s) => (
          <>
            <Button variant="ghost" size="icon" aria-label={`Edit ${s.code}`} onClick={() => setDialog({ open: true, editing: s })}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Delete ${s.code}`} onClick={() => setToDelete(s)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </>
        )}
      />

      <SubjectDialog termId={termId} open={dialog.open} editing={dialog.editing} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />

      <ConfirmDelete
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={toDelete ? `Delete ${toDelete.code}?` : "Delete subject?"}
        description="This removes the subject from the term."
        onConfirm={() => remove.mutateAsync(toDelete!.id)}
        errorText={(err) =>
          hasCode(err, "IN_USE")
            ? "This subject is used by one or more offerings. Delete those offerings (Offerings tab) first."
            : describeApiError(err)
        }
      />
    </section>
  );
}

function SubjectDialog({
  termId,
  open,
  editing,
  onOpenChange,
}: {
  termId: string;
  open: boolean;
  editing: Subject | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateSubject(termId, { silent: true, successMessage: "Subject added" });
  const update = useUpdateSubject(termId, { silent: true, successMessage: "Subject saved" });
  const pending = create.isPending || update.isPending;

  const form = useForm<SubjectFormInput, unknown, SubjectFormValues>({
    resolver: zodResolver(subjectSchema),
    defaultValues: subjectDefaults(editing),
  });
  const kind = form.watch("kind");

  useEffect(() => {
    if (open) {
      form.reset(subjectDefaults(editing));
      setFormError(null);
    }
  }, [open, editing, form]);

  const submit = async (v: SubjectFormValues) => {
    setFormError(null);
    const allowSecondLab = v.kind === "lab" && v.allow_second_lab;
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          patch: {
            code: v.code,
            name: v.name,
            kind: v.kind,
            // Blank on edit keeps the stored duration.
            ...(v.duration_min !== undefined ? { duration_min: v.duration_min } : {}),
            weekly_count: v.weekly_count,
            semester_total: v.semester_total ?? null,
            allow_second_lab: allowSecondLab,
          },
        });
      } else {
        await create.mutateAsync({
          code: v.code,
          name: v.name,
          kind: v.kind,
          duration_min: v.duration_min, // undefined -> the term default for this kind
          weekly_count: v.weekly_count,
          semester_total: v.semester_total,
          allow_second_lab: allowSecondLab,
        });
      }
      onOpenChange(false);
    } catch (err) {
      if (hasCode(err, "DUPLICATE")) {
        form.setError("code", { type: "server", message: "This term already has a subject with this code" });
      } else if (!applyFieldErrors(err, form.setError, { known: Object.keys(subjectDefaults()) })) {
        setFormError(describeApiError(err));
      }
    }
  };

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={editing ? "Edit subject" : "Add subject"}
        description="Labs are split by batch; theory subjects run for the whole division."
        submitLabel={editing ? "Save changes" : "Add subject"}
        submitting={pending}
        error={formError}
        onSubmit={form.handleSubmit(submit)}
      >
        <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
          <TextField name="code" label="Code" placeholder="CS301" autoFocus />
          <TextField name="name" label="Name" placeholder="Data Structures" />
        </div>
        <SelectField name="kind" label="Kind" options={KIND_OPTIONS} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="duration_min"
            label="Session length (minutes)"
            type="number"
            inputMode="numeric"
            min={1}
            max={1440}
            description={editing ? "Blank keeps the current length." : "Blank uses the term default for this kind."}
          />
          <TextField name="weekly_count" label="Sessions per week" type="number" inputMode="numeric" min={0} max={100} />
        </div>
        <TextField
          name="semester_total"
          label="Semester total (optional)"
          type="number"
          inputMode="numeric"
          min={0}
          description="Total sessions over the semester. Only used to warn when it doesn't match the weekly count."
        />
        {kind === "lab" && <SwitchField name="allow_second_lab" label="Allow a second lab session per week" description="A lab normally runs once per batch per week. Turn this on only if a second session is needed to reach the semester total." />}
      </FormDialog>
    </Form>
  );
}
