import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDelete } from "../ConfirmDelete";
import { DataTable, type Column } from "../DataTable";
import { SwitchField, TextField } from "../FormFields";
import { FormDialog } from "../FormDialog";
import { useCreateFaculty, useDeleteFaculty, useFaculty, useUpdateFaculty } from "../../hooks";
import { applyFieldErrors, describeApiError, hasCode } from "../../lib/errors";
import { blankToNull, blankToUndefined, optionalEmail, optionalInt } from "../../lib/forms";
import type { FacultyListItem } from "../../types";

// =============================================================================
// REFERENCE TAB. Other config tabs copy this shape:
//   1. a zod schema + FormIn/FormOut types and a defaults() function,
//   2. a list query hook + DataTable with an actions column,
//   3. an add/edit dialog (FormDialog + useForm + zodResolver) whose mutations are
//      built with `silent: true` so errors land on fields / inside the dialog,
//   4. a ConfirmDelete whose rejection is turned into friendly text.
// =============================================================================

const facultySchema = z.object({
  // Limits mirror the API (Vyas-Backend/services/planner/faculty.js).
  short_code: z
    .string()
    .trim()
    .min(1, "Short code is required")
    .max(40, "At most 40 characters")
    .refine((s) => !/[|,;:]/.test(s), "Cannot contain | , ; or :"),
  full_name: z.string().trim().min(1, "Name is required").max(120, "At most 120 characters"),
  email: optionalEmail,
  department: z.string().trim().max(120, "At most 120 characters"),
  max_per_day: optionalInt("Max per day", 1, 100),
  max_per_week: optionalInt("Max per week", 1, 1000),
  is_active: z.boolean(),
});
type FacultyFormInput = z.input<typeof facultySchema>;
type FacultyFormValues = z.output<typeof facultySchema>;

const facultyDefaults = (f?: FacultyListItem | null): FacultyFormInput => ({
  short_code: f?.short_code ?? "",
  full_name: f?.full_name ?? "",
  email: f?.email ?? "",
  department: f?.department ?? "",
  max_per_day: f?.max_per_day ?? "",
  max_per_week: f?.max_per_week ?? "",
  is_active: f?.is_active ?? true,
});

export function FacultyTab({ termId }: { termId: string }) {
  const faculty = useFaculty(termId);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; editing: FacultyListItem | null }>({ open: false, editing: null });
  const [toDelete, setToDelete] = useState<FacultyListItem | null>(null);
  const remove = useDeleteFaculty({ silent: true, successMessage: "Faculty deleted" });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return faculty.data;
    return faculty.data?.filter((f) => [f.short_code, f.full_name, f.email ?? "", f.department ?? ""].some((v) => v.toLowerCase().includes(q)));
  }, [faculty.data, search]);

  const columns: Column<FacultyListItem>[] = [
    { key: "short_code", header: "Code", cell: (f) => <span className="font-mono font-medium">{f.short_code}</span> },
    {
      key: "name",
      header: "Name",
      cell: (f) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{f.full_name}</span>
            {!f.is_active && <Badge variant="outline">Inactive</Badge>}
          </div>
          {f.email && <div className="truncate text-xs text-muted-foreground">{f.email}</div>}
        </div>
      ),
    },
    { key: "department", header: "Department", cell: (f) => f.department ?? <span className="text-muted-foreground">-</span>, className: "hidden md:table-cell" },
    {
      key: "account",
      header: "Vyas account",
      cell: (f) =>
        f.linked_profile ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="gap-1">
                <Link2 className="h-3 w-3" aria-hidden="true" />
                Linked
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {f.linked_profile.full_name} ({f.linked_profile.email})
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-xs text-muted-foreground">Not linked</span>
        ),
      className: "hidden sm:table-cell",
    },
    {
      key: "limits",
      header: "Max / day, week",
      cell: (f) => (
        <span className="tabular-nums text-muted-foreground">
          {f.max_per_day ?? "-"} / {f.max_per_week ?? "-"}
        </span>
      ),
      className: "hidden lg:table-cell",
    },
    { key: "assigned", header: "In this term", cell: (f) => <span className="tabular-nums">{f.assigned_in_term ?? 0}</span> },
  ];

  return (
    <section className="space-y-4" aria-label="Faculty">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Faculty</h2>
          <p className="text-sm text-muted-foreground">Shared by every term. Linking to a Vyas account happens automatically by email.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search faculty"
            aria-label="Search faculty"
            className="w-48"
          />
          <Button onClick={() => setDialog({ open: true, editing: null })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add faculty
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(f) => f.id}
        isLoading={faculty.isLoading}
        error={faculty.error}
        onRetry={() => faculty.refetch()}
        emptyMessage={search ? "No faculty match your search." : "No faculty yet. Add one, or import a faculty file."}
        actions={(f) => (
          <>
            <Button variant="ghost" size="icon" aria-label={`Edit ${f.full_name}`} onClick={() => setDialog({ open: true, editing: f })}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Delete ${f.full_name}`} onClick={() => setToDelete(f)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </>
        )}
      />

      <FacultyDialog open={dialog.open} editing={dialog.editing} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />

      <ConfirmDelete
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={toDelete ? `Delete ${toDelete.full_name}?` : "Delete faculty?"}
        description="This removes the person from the shared faculty list for every term."
        onConfirm={() => remove.mutateAsync(toDelete!.id)}
        errorText={(err) =>
          hasCode(err, "IN_USE")
            ? "This person is still assigned to offerings or generated sessions. Remove them from those offerings first (and clear any generated sessions), or edit them and switch off Active instead."
            : describeApiError(err)
        }
      />
    </section>
  );
}

function FacultyDialog({
  open,
  editing,
  onOpenChange,
}: {
  open: boolean;
  editing: FacultyListItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateFaculty({ silent: true, successMessage: "Faculty added" });
  const update = useUpdateFaculty({ silent: true, successMessage: "Faculty saved" });
  const pending = create.isPending || update.isPending;

  const form = useForm<FacultyFormInput, unknown, FacultyFormValues>({
    resolver: zodResolver(facultySchema),
    defaultValues: facultyDefaults(editing),
  });

  // Reset whenever the dialog opens (for a different row, or after a cancelled edit).
  useEffect(() => {
    if (open) {
      form.reset(facultyDefaults(editing));
      setFormError(null);
    }
  }, [open, editing, form]);

  const submit = async (v: FacultyFormValues) => {
    setFormError(null);
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          // null clears a column on PATCH.
          patch: {
            short_code: v.short_code,
            full_name: v.full_name,
            email: blankToNull(v.email),
            department: blankToNull(v.department),
            max_per_day: v.max_per_day ?? null,
            max_per_week: v.max_per_week ?? null,
            is_active: v.is_active,
          },
        });
      } else {
        // Optional keys are omitted on POST.
        await create.mutateAsync({
          short_code: v.short_code,
          full_name: v.full_name,
          email: blankToUndefined(v.email),
          department: blankToUndefined(v.department),
          max_per_day: v.max_per_day,
          max_per_week: v.max_per_week,
        });
      }
      onOpenChange(false);
    } catch (err) {
      if (hasCode(err, "DUPLICATE")) {
        form.setError("short_code", { type: "server", message: "This short code is already used (codes are not case-sensitive)" });
      } else if (!applyFieldErrors(err, form.setError, { known: Object.keys(facultyDefaults()) })) {
        setFormError(describeApiError(err));
      }
    }
  };

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={editing ? "Edit faculty" : "Add faculty"}
        description="The short code is what shows on the timetable and in import files."
        submitLabel={editing ? "Save changes" : "Add faculty"}
        submitting={pending}
        error={formError}
        onSubmit={form.handleSubmit(submit)}
      >
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <TextField name="short_code" label="Short code" placeholder="ABC" autoFocus />
          <TextField name="full_name" label="Full name" placeholder="Dr. A. B. Chauhan" />
        </div>
        <TextField
          name="email"
          label="Email"
          type="email"
          placeholder="name@college.edu"
          description="If it matches a Vyas account, the faculty is linked to it automatically."
        />
        <TextField name="department" label="Department" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="max_per_day" label="Max sessions per day" type="number" inputMode="numeric" min={1} max={100} description="Blank means no limit." />
          <TextField name="max_per_week" label="Max sessions per week" type="number" inputMode="numeric" min={1} max={1000} description="Blank means no limit." />
        </div>
        {editing && <SwitchField name="is_active" label="Active" description="Switch off to retire someone without deleting them or their assignments." />}
      </FormDialog>
    </Form>
  );
}
