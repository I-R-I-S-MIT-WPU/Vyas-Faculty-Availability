import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useFieldArray, useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Check, ChevronsUpDown, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ConfirmDelete } from "../ConfirmDelete";
import { DataTable, type Column } from "../DataTable";
import { SelectField, SwitchField, TextField } from "../FormFields";
import { FormDialog } from "../FormDialog";
import {
  useCreateOffering,
  useDeleteOffering,
  useDivisions,
  useFaculty,
  useOfferings,
  useSetOfferingFaculty,
  useSubjects,
  useUpdateOffering,
} from "../../hooks";
import { applyFieldErrors, describeApiError, hasCode } from "../../lib/errors";
import { optionalInt } from "../../lib/forms";
import type { DivisionWithBatches, FacultyListItem, Offering, OfferingFacultyInput, Subject } from "../../types";

const ALL_BATCHES = "all";

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const divisionLabel = (d: Pick<DivisionWithBatches, "semester" | "name">) => `${d.name} (Sem ${d.semester})`;
const realBatches = (d: DivisionWithBatches) => d.batches.filter((b) => !b.is_whole).sort((a, b) => byName(a.name, b.name));
const subjectLabel = (s: Pick<Subject, "code" | "name" | "kind">) => `${s.code} - ${s.name}${s.kind === "lab" ? " (lab)" : ""}`;

// ---------------------------------------------------------------------------
// Tab: pick a division, then list / edit its offerings
// ---------------------------------------------------------------------------

export function OfferingsTab({ termId }: { termId: string }) {
  const divisions = useDivisions(termId);
  const [params, setParams] = useSearchParams();
  const paramId = params.get("division");

  const sorted = useMemo(
    () => [...(divisions.data ?? [])].sort((a, b) => a.semester - b.semester || byName(a.name, b.name)),
    [divisions.data],
  );
  const semesters = useMemo(() => Array.from(new Set(sorted.map((d) => d.semester))), [sorted]);
  const division = sorted.find((d) => d.id === paramId) ?? null;

  const setDivision = (id: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("division", id);
        return next;
      },
      { replace: true },
    );

  // No (or a stale) ?division= : fall back to the first division so the tab is useful straight away.
  useEffect(() => {
    if (!division && sorted.length > 0) setDivision(sorted[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [division, sorted]);

  return (
    <section className="space-y-4" aria-label="Offerings">
      <div>
        <h2 className="text-lg font-semibold">Offerings</h2>
        <p className="text-sm text-muted-foreground">Which subjects each division studies, how often, and who teaches them.</p>
      </div>

      {divisions.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : divisions.error ? (
        <div className="rounded-md border p-8 text-center">
          <p className="text-sm text-destructive">{describeApiError(divisions.error)}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => divisions.refetch()}>
            Try again
          </Button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
          Add divisions first (Divisions &amp; batches tab), then attach subjects to them here.
        </div>
      ) : (
        <>
          <div className="max-w-xs space-y-1">
            <Label htmlFor="offerings-division">Division</Label>
            <Select value={division?.id ?? ""} onValueChange={setDivision}>
              <SelectTrigger id="offerings-division">
                <SelectValue placeholder="Choose a division" />
              </SelectTrigger>
              <SelectContent>
                {semesters.map((sem) => (
                  <SelectGroup key={sem}>
                    <SelectLabel>Semester {sem}</SelectLabel>
                    {sorted
                      .filter((d) => d.semester === sem)
                      .map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {divisionLabel(d)} · {d.student_count} students
                        </SelectItem>
                      ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {division && <DivisionOfferings key={division.id} termId={termId} division={division} />}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Offerings of one division
// ---------------------------------------------------------------------------

function DivisionOfferings({ termId, division }: { termId: string; division: DivisionWithBatches }) {
  const offerings = useOfferings(termId, division.id);
  const subjects = useSubjects(termId);
  const [dialog, setDialog] = useState<{ open: boolean; editing: Offering | null }>({ open: false, editing: null });
  const [toDelete, setToDelete] = useState<Offering | null>(null);
  const remove = useDeleteOffering(termId, { silent: true, successMessage: "Offering deleted" });

  const batchName = useMemo(() => new Map(division.batches.map((b) => [b.id, b.name])), [division.batches]);
  const subjectById = useMemo(() => new Map((subjects.data ?? []).map((s) => [s.id, s])), [subjects.data]);

  const rows = useMemo(
    () => [...(offerings.data ?? [])].sort((a, b) => byName(a.subject.code, b.subject.code)),
    [offerings.data],
  );
  const offeredIds = useMemo(() => new Set(rows.map((o) => o.subject_id)), [rows]);
  const available = (subjects.data ?? []).filter((s) => !offeredIds.has(s.id));

  const columns: Column<Offering>[] = [
    {
      key: "subject",
      header: "Subject",
      cell: (o) => (
        <div className="min-w-[8rem]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono font-medium">{o.subject.code}</span>
            <Badge variant={o.subject.kind === "lab" ? "default" : "secondary"}>{o.subject.kind === "lab" ? "Lab" : "Theory"}</Badge>
            {o.per_batch && <Badge variant="outline">Per batch</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">{o.subject.name}</div>
        </div>
      ),
    },
    {
      key: "weekly",
      header: "Per week",
      cell: (o) => {
        const base = subjectById.get(o.subject_id)?.weekly_count;
        return (
          <div className="flex flex-wrap items-center gap-1">
            <span className="tabular-nums">{o.effective_weekly_count}</span>
            {o.weekly_count !== null && (
              <Badge variant="outline" className="font-normal" title={base !== undefined ? `Overrides the subject default of ${base}` : "Overrides the subject default"}>
                override
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: "faculty",
      header: "Faculty",
      cell: (o) => <FacultyBadges offering={o} batchName={batchName} />,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {divisionLabel(division)}: {rows.length} offering{rows.length === 1 ? "" : "s"}
        </p>
        <Button onClick={() => setDialog({ open: true, editing: null })} disabled={subjects.isLoading}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Add offering
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(o) => o.id}
        isLoading={offerings.isLoading}
        error={offerings.error}
        onRetry={() => offerings.refetch()}
        emptyMessage="No offerings for this division yet. Add one, or import an offerings file."
        actions={(o) => (
          <>
            <Button variant="ghost" size="icon" aria-label={`Edit ${o.subject.code}`} onClick={() => setDialog({ open: true, editing: o })}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Delete ${o.subject.code}`} onClick={() => setToDelete(o)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </>
        )}
      />
      {rows.length > 0 && <p className="text-xs text-muted-foreground">Filled badge = lead, outlined = assist. A batch name before the code means that batch only.</p>}

      <OfferingDialog
        termId={termId}
        division={division}
        open={dialog.open}
        editing={dialog.editing}
        subjects={subjects.data ?? []}
        availableSubjects={available}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />

      <ConfirmDelete
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={toDelete ? `Delete ${toDelete.subject.code} from ${divisionLabel(division)}?` : "Delete offering?"}
        description="The subject's faculty assignments and any unplaced sessions for this division are removed. The subject itself stays in the term."
        onConfirm={() => remove.mutateAsync(toDelete!.id)}
        errorText={(err) =>
          hasCode(err, "HAS_PLACED_SESSIONS")
            ? "Some sessions of this offering are already placed on the timetable. Unplace them first."
            : describeApiError(err)
        }
      />
    </div>
  );
}

function FacultyBadges({ offering, batchName }: { offering: Offering; batchName: Map<string, string> }) {
  if (offering.faculty.length === 0) {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500 text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        No faculty
      </Badge>
    );
  }
  const sorted = [...offering.faculty].sort((a, b) => {
    const ba = a.batch_id ? batchName.get(a.batch_id) ?? "" : "";
    const bb = b.batch_id ? batchName.get(b.batch_id) ?? "" : "";
    return byName(ba, bb) || (a.role === b.role ? 0 : a.role === "lead" ? -1 : 1) || byName(a.short_code, b.short_code);
  });
  return (
    <div className="flex flex-wrap gap-1">
      {sorted.map((f) => (
        <Badge
          key={f.id}
          variant={f.role === "lead" ? "secondary" : "outline"}
          className="whitespace-nowrap font-mono font-normal"
          title={`${f.full_name} (${f.role})`}
        >
          {f.batch_id ? `${batchName.get(f.batch_id) ?? "?"} ` : ""}
          {f.short_code}
        </Badge>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add / edit offering
// ---------------------------------------------------------------------------

const offeringSchema = z
  .object({
    subject_id: z.string().min(1, "Choose a subject"),
    weekly_count: optionalInt("Weekly count", 0, 100), // API cap (services/planner/offerings.js)
    per_batch: z.boolean(),
    faculty: z.array(
      z.object({
        batch_id: z.string(),
        faculty_id: z.string().min(1, "Choose a faculty member"),
        role: z.enum(["lead", "assist"]),
      }),
    ),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.faculty.forEach((f, i) => {
      // Without per-batch sessions every row applies to the whole division, whatever batch it says.
      const key = `${v.per_batch ? f.batch_id : ALL_BATCHES}|${f.faculty_id}`;
      if (f.faculty_id && seen.has(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["faculty", i, "faculty_id"], message: "Already added for this batch" });
      }
      seen.add(key);
    });
  });
type OfferingFormInput = z.input<typeof offeringSchema>;
type OfferingFormValues = z.output<typeof offeringSchema>;

const offeringDefaults = (o?: Offering | null): OfferingFormInput => ({
  subject_id: o?.subject_id ?? "",
  weekly_count: o?.weekly_count ?? "",
  per_batch: o?.per_batch ?? false,
  faculty: (o?.faculty ?? []).map((f) => ({ batch_id: f.batch_id ?? ALL_BATCHES, faculty_id: f.faculty_id, role: f.role })),
});

const ROLE_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "assist", label: "Assist" },
];

function OfferingDialog({
  termId,
  division,
  open,
  editing,
  subjects,
  availableSubjects,
  onOpenChange,
}: {
  termId: string;
  division: DivisionWithBatches;
  open: boolean;
  editing: Offering | null;
  subjects: Subject[];
  availableSubjects: Subject[];
  onOpenChange: (open: boolean) => void;
}) {
  const faculty = useFaculty(termId);
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateOffering(termId, { silent: true, successMessage: "Offering added" });
  const update = useUpdateOffering(termId, { silent: true });
  const setFaculty = useSetOfferingFaculty(termId, { silent: true });
  const pending = create.isPending || update.isPending || setFaculty.isPending;

  const form = useForm<OfferingFormInput, unknown, OfferingFormValues>({
    resolver: zodResolver(offeringSchema),
    defaultValues: offeringDefaults(editing),
  });
  const rows = useFieldArray({ control: form.control, name: "faculty" });
  const subjectId = form.watch("subject_id");
  const perBatch = form.watch("per_batch");

  const appliedSubject = useRef("");

  useEffect(() => {
    if (open) {
      form.reset(offeringDefaults(editing));
      setFormError(null);
      appliedSubject.current = "";
    }
  }, [open, editing, form]);

  // New offering: when the subject changes, labs default to per-batch and theory to the whole division.
  useEffect(() => {
    if (editing || !subjectId || appliedSubject.current === subjectId) return;
    const s = subjects.find((x) => x.id === subjectId);
    if (s) {
      appliedSubject.current = subjectId;
      form.setValue("per_batch", s.kind === "lab");
    }
  }, [subjectId, editing, subjects, form]);

  const batches = realBatches(division);
  const batchOptions = [{ value: ALL_BATCHES, label: "All batches" }, ...batches.map((b) => ({ value: b.id, label: `Batch ${b.name}` }))];

  // Active people only, plus anyone already assigned (so an inactive person stays visible while editing).
  const facultyOptions = useMemo(() => {
    const assigned = new Set((editing?.faculty ?? []).map((f) => f.faculty_id));
    return (faculty.data ?? []).filter((f) => f.is_active || assigned.has(f.id));
  }, [faculty.data, editing]);

  const subjectOptions = availableSubjects.map((s) => ({ value: s.id, label: subjectLabel(s) }));
  const editingSubject = editing ? subjects.find((s) => s.id === editing.subject_id) : null;

  const submit = async (v: OfferingFormValues) => {
    setFormError(null);
    const assignments: OfferingFacultyInput[] = v.faculty.map((f) => ({
      batch_id: v.per_batch && f.batch_id !== ALL_BATCHES ? f.batch_id : null,
      faculty_id: f.faculty_id,
      role: f.role,
    }));
    let offeringSaved = false;
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: { weekly_count: v.weekly_count ?? null, per_batch: v.per_batch } });
        offeringSaved = true;
        await setFaculty.mutateAsync({ id: editing.id, faculty: assignments });
      } else {
        await create.mutateAsync({
          division_id: division.id,
          subject_id: v.subject_id,
          weekly_count: v.weekly_count,
          per_batch: v.per_batch,
          faculty: assignments,
        });
      }
      onOpenChange(false);
    } catch (err) {
      if (offeringSaved) {
        setFormError(`The offering settings were saved, but the faculty list was not: ${describeApiError(err)}`);
      } else if (hasCode(err, "DUPLICATE")) {
        form.setError("subject_id", { type: "server", message: "This subject is already offered in this division" });
      } else if (!applyFieldErrors(err, form.setError, { known: ["subject_id", "weekly_count", "per_batch"] })) {
        setFormError(describeApiError(err));
      }
    }
  };

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={editing ? `Edit ${editing.subject.code}` : `Add offering to ${divisionLabel(division)}`}
        description={editing ? "Saving replaces the whole faculty list of this offering." : "Pick a subject, then say who teaches it."}
        submitLabel={editing ? "Save changes" : "Add offering"}
        submitting={pending}
        error={formError}
        onSubmit={form.handleSubmit(submit)}
        widthClass="sm:max-w-[640px]"
      >
        {editing ? (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <span className="font-mono font-medium">{editing.subject.code}</span> {editing.subject.name}
          </div>
        ) : (
          <SelectField
            name="subject_id"
            label="Subject"
            options={subjectOptions}
            placeholder={subjectOptions.length === 0 ? "No subjects left to offer" : "Choose a subject"}
            description={subjectOptions.length === 0 ? "Every subject of the term is already offered here. Add subjects on the Subjects tab." : undefined}
          />
        )}

        <TextField
          name="weekly_count"
          label="Sessions per week (optional override)"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          description={
            editingSubject
              ? `Blank uses the subject's ${editingSubject.weekly_count} per week.`
              : subjectId
                ? `Blank uses the subject's ${subjects.find((s) => s.id === subjectId)?.weekly_count ?? "default"} per week.`
                : "Blank uses the subject's own weekly count."
          }
        />
        <SwitchField
          name="per_batch"
          label="Run per batch"
          description="Each batch gets its own sessions (labs). Off means one session group for the whole division."
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Label>Faculty</Label>
              <p className="text-xs text-muted-foreground">
                {perBatch && batches.length === 0
                  ? "This division has no batches yet, so the whole division is used."
                  : perBatch
                    ? "Pick All batches, or assign someone to a single batch."
                    : "Teaches the whole division."}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => rows.append({ batch_id: ALL_BATCHES, faculty_id: "", role: "lead" })}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              Add
            </Button>
          </div>

          {faculty.isLoading && <Skeleton className="h-10 w-full" />}
          {faculty.error && (
            <p className="text-sm text-destructive">
              {describeApiError(faculty.error)}{" "}
              <button type="button" className="underline" onClick={() => faculty.refetch()}>
                Retry
              </button>
            </p>
          )}
          {!faculty.isLoading && facultyOptions.length === 0 && !faculty.error && (
            <p className="text-sm text-muted-foreground">No faculty exist yet. Add some on the Faculty tab first.</p>
          )}
          {rows.fields.length === 0 && facultyOptions.length > 0 && (
            <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">No faculty assigned. Readiness will flag this offering.</p>
          )}

          {rows.fields.map((f, i) => (
            <div key={f.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_6.5rem_auto]">
              <FacultyPickField name={`faculty.${i}.faculty_id`} options={facultyOptions} />
              {perBatch && batches.length > 0 ? (
                <SelectField name={`faculty.${i}.batch_id`} label="Batch" options={batchOptions} className="space-y-1" />
              ) : (
                <div className="hidden sm:block" aria-hidden="true" />
              )}
              <SelectField name={`faculty.${i}.role`} label="Role" options={ROLE_OPTIONS} className="space-y-1" />
              <Button type="button" variant="ghost" size="icon" className="sm:mt-6" aria-label={`Remove faculty row ${i + 1}`} onClick={() => rows.remove(i)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      </FormDialog>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// Searchable faculty picker (short code / name)
// ---------------------------------------------------------------------------

function FacultyPickField({ name, options }: { name: string; options: FacultyListItem[] }) {
  const { control } = useFormContext();
  const [open, setOpen] = useState(false);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const current = options.find((f) => f.id === field.value);
        return (
          <FormItem className="space-y-1">
            <FormLabel>Faculty</FormLabel>
            {/* modal: lets the list scroll with the wheel while this sits inside a Dialog. */}
            <Popover open={open} onOpenChange={setOpen} modal>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button type="button" variant="outline" role="combobox" aria-expanded={open} className={cn("w-full justify-between font-normal", !current && "text-muted-foreground")}>
                    <span className="truncate">{current ? `${current.short_code} - ${current.full_name}` : "Search faculty"}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[14rem] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Code or name" />
                  <CommandList>
                    <CommandEmpty>No faculty found.</CommandEmpty>
                    <CommandGroup>
                      {options.map((f) => (
                        <CommandItem
                          key={f.id}
                          value={`${f.short_code} ${f.full_name}`}
                          onSelect={() => {
                            field.onChange(f.id);
                            setOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", field.value === f.id ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                          <span className="mr-2 font-mono font-medium">{f.short_code}</span>
                          <span className="truncate text-muted-foreground">{f.full_name}</span>
                          {!f.is_active && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
