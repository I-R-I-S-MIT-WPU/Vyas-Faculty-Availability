import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDelete } from "../ConfirmDelete";
import { DataTable, type Column } from "../DataTable";
import { SelectField, TextField } from "../FormFields";
import { FormDialog } from "../FormDialog";
import {
  useCreateBatch,
  useCreateDivision,
  useDeleteBatch,
  useDeleteDivision,
  useDivisions,
  useTermRooms,
  useUpdateBatch,
  useUpdateDivision,
} from "../../hooks";
import { applyFieldErrors, describeApiError, hasCode } from "../../lib/errors";
import { requiredInt } from "../../lib/forms";
import type { Batch, DivisionWithBatches, TermRoom } from "../../types";

const NO_ROOM = "none";

const divisionSchema = z.object({
  semester: requiredInt("Semester", 1, 12),
  // Limits mirror the API (Vyas-Backend/services/planner/divisions.js).
  name: z.string().trim().min(1, "Name is required").max(60, "At most 60 characters"),
  student_count: requiredInt("Students", 0, 100000),
  home_room_id: z.string(),
  batches: z.array(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, "Batch name is required")
        .max(40, "At most 40 characters")
        .refine((s) => s.toLowerCase() !== "all", 'The name "ALL" is reserved'),
      student_count: requiredInt("Batch size", 0, 100000),
    }),
  ),
});
type DivisionFormInput = z.input<typeof divisionSchema>;
type DivisionFormValues = z.output<typeof divisionSchema>;

const divisionDefaults = (d?: DivisionWithBatches | null, semester?: number): DivisionFormInput => ({
  semester: (d?.semester ?? semester ?? "") as number, // blank until chosen (coerce input is typed number)
  name: d?.name ?? "",
  student_count: (d?.student_count ?? "") as number,
  home_room_id: d?.home_room_id ?? NO_ROOM,
  batches: [],
});

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const realBatches = (d: DivisionWithBatches) => d.batches.filter((b) => !b.is_whole).sort((a, b) => byName(a.name, b.name));
const roomLabel = (r: Pick<TermRoom, "building_name" | "name">) => `${r.building_name} / ${r.name}`;

export function DivisionsTab({ termId }: { termId: string }) {
  const divisions = useDivisions(termId);
  const rooms = useTermRooms(termId);
  const [semester, setSemester] = useState<number | "all">("all");
  const [dialog, setDialog] = useState<{ open: boolean; editing: DivisionWithBatches | null }>({ open: false, editing: null });
  const [batchesFor, setBatchesFor] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<DivisionWithBatches | null>(null);
  const remove = useDeleteDivision(termId, { silent: true, successMessage: "Division deleted" });

  const semesters = useMemo(() => Array.from(new Set((divisions.data ?? []).map((d) => d.semester))).sort((a, b) => a - b), [divisions.data]);

  // Drop a stale filter (e.g. the last division of that semester was deleted).
  useEffect(() => {
    if (semester !== "all" && divisions.data && !semesters.includes(semester)) setSemester("all");
  }, [semester, semesters, divisions.data]);

  const rows = useMemo(() => {
    const list = (divisions.data ?? []).filter((d) => semester === "all" || d.semester === semester);
    return [...list].sort((a, b) => a.semester - b.semester || byName(a.name, b.name));
  }, [divisions.data, semester]);

  const roomById = useMemo(() => new Map((rooms.data ?? []).map((r) => [r.room_id, r])), [rooms.data]);
  const batchesDivision = divisions.data?.find((d) => d.id === batchesFor) ?? null;

  const columns: Column<DivisionWithBatches>[] = [
    { key: "semester", header: "Sem", cell: (d) => <span className="tabular-nums">{d.semester}</span> },
    { key: "name", header: "Division", cell: (d) => <span className="font-medium">{d.name}</span> },
    { key: "students", header: "Students", cell: (d) => <span className="tabular-nums">{d.student_count}</span> },
    {
      key: "room",
      header: "Home room",
      cell: (d) => {
        if (!d.home_room_id) return <span className="text-muted-foreground">-</span>;
        const r = roomById.get(d.home_room_id);
        if (r) return roomLabel(r);
        return rooms.data ? <span className="text-xs text-amber-700 dark:text-amber-400">Not in room pool</span> : <span className="text-muted-foreground">...</span>;
      },
      className: "hidden md:table-cell",
    },
    {
      key: "batches",
      header: "Batches",
      cell: (d) => {
        const bs = realBatches(d);
        if (bs.length === 0) return <span className="text-xs text-muted-foreground">No batches</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {bs.map((b) => (
              <Badge key={b.id} variant="secondary" className="whitespace-nowrap font-normal">
                {b.name} ({b.student_count})
              </Badge>
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <section className="space-y-4" aria-label="Divisions and batches">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Divisions &amp; batches</h2>
          <p className="text-sm text-muted-foreground">Each division can be split into lab batches. Theory runs for the whole division.</p>
        </div>
        <Button onClick={() => setDialog({ open: true, editing: null })}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Add division
        </Button>
      </div>

      {semesters.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by semester">
          <Button size="sm" variant={semester === "all" ? "default" : "outline"} onClick={() => setSemester("all")}>
            All
          </Button>
          {semesters.map((s) => (
            <Button key={s} size="sm" variant={semester === s ? "default" : "outline"} onClick={() => setSemester(s)}>
              Semester {s}
            </Button>
          ))}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(d) => d.id}
        isLoading={divisions.isLoading}
        error={divisions.error}
        onRetry={() => divisions.refetch()}
        emptyMessage="No divisions yet. Add one, or import a divisions file."
        actions={(d) => (
          <>
            <Button variant="ghost" size="icon" aria-label={`Manage batches of ${d.semester}${d.name}`} title="Manage batches" onClick={() => setBatchesFor(d.id)}>
              <Layers className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Edit ${d.semester}${d.name}`} onClick={() => setDialog({ open: true, editing: d })}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Delete ${d.semester}${d.name}`} onClick={() => setToDelete(d)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </>
        )}
      />

      <DivisionDialog
        termId={termId}
        open={dialog.open}
        editing={dialog.editing}
        defaultSemester={semester === "all" ? undefined : semester}
        poolRooms={rooms.data ?? []}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />

      <BatchesDialog termId={termId} division={batchesDivision} onClose={() => setBatchesFor(null)} />

      <ConfirmDelete
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={toDelete ? `Delete division ${toDelete.semester}${toDelete.name}?` : "Delete division?"}
        description="This also deletes its batches, offerings and any generated sessions that haven't been placed on the timetable."
        onConfirm={() => remove.mutateAsync(toDelete!.id)}
        errorText={(err) =>
          hasCode(err, "HAS_PLACED_SESSIONS")
            ? "Some of this division's sessions are already placed on the timetable. Unplace them first, then delete the division."
            : describeApiError(err)
        }
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Add / edit division
// ---------------------------------------------------------------------------

function DivisionDialog({
  termId,
  open,
  editing,
  defaultSemester,
  poolRooms,
  onOpenChange,
}: {
  termId: string;
  open: boolean;
  editing: DivisionWithBatches | null;
  defaultSemester?: number;
  poolRooms: TermRoom[];
  onOpenChange: (open: boolean) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateDivision(termId, { silent: true, successMessage: "Division added" });
  const update = useUpdateDivision(termId, { silent: true, successMessage: "Division saved" });
  const pending = create.isPending || update.isPending;

  const form = useForm<DivisionFormInput, unknown, DivisionFormValues>({
    resolver: zodResolver(divisionSchema),
    defaultValues: divisionDefaults(editing, defaultSemester),
  });
  const batchFields = useFieldArray({ control: form.control, name: "batches" });

  useEffect(() => {
    if (open) {
      form.reset(divisionDefaults(editing, defaultSemester));
      setFormError(null);
    }
    // defaultSemester is read only at open time on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, form]);

  const roomOptions = useMemo(() => {
    const opts = [{ value: NO_ROOM, label: "No home room" }, ...poolRooms.map((r) => ({ value: r.room_id, label: roomLabel(r) }))];
    // Keep a saved room that has since left the pool selectable, so saving doesn't silently clear it.
    if (editing?.home_room_id && !poolRooms.some((r) => r.room_id === editing.home_room_id)) {
      opts.push({ value: editing.home_room_id, label: "Current room (not in the term's pool)" });
    }
    return opts;
  }, [poolRooms, editing]);

  const submit = async (v: DivisionFormValues) => {
    setFormError(null);
    const homeRoom = v.home_room_id === NO_ROOM ? null : v.home_room_id;
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          patch: { semester: v.semester, name: v.name, student_count: v.student_count, home_room_id: homeRoom },
        });
      } else {
        await create.mutateAsync({
          semester: v.semester,
          name: v.name,
          student_count: v.student_count,
          home_room_id: homeRoom,
          batches: v.batches.length > 0 ? v.batches.map((b) => ({ name: b.name, student_count: b.student_count })) : undefined,
        });
      }
      onOpenChange(false);
    } catch (err) {
      if (hasCode(err, "DUPLICATE")) {
        form.setError("name", { type: "server", message: "This semester already has a division with this name (or two batches share a name)" });
      } else if (!applyFieldErrors(err, form.setError, { known: ["semester", "name", "student_count", "home_room_id"] })) {
        setFormError(describeApiError(err));
      }
    }
  };

  const batchErrors = form.formState.errors.batches;

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={editing ? "Edit division" : "Add division"}
        description={editing ? "Use Manage batches on the list to change its batches." : "A division is one class group, e.g. semester 3, division A."}
        submitLabel={editing ? "Save changes" : "Add division"}
        submitting={pending}
        error={formError}
        onSubmit={form.handleSubmit(submit)}
        widthClass="sm:max-w-[560px]"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField name="semester" label="Semester" type="number" inputMode="numeric" min={1} max={12} autoFocus />
          <TextField name="name" label="Division" placeholder="A" />
          <TextField name="student_count" label="Students" type="number" inputMode="numeric" min={0} />
        </div>
        <SelectField
          name="home_room_id"
          label="Home room"
          options={roomOptions}
          description={poolRooms.length === 0 ? "Add rooms to the room pool first to pick a home room." : "The classroom this division normally uses for theory."}
        />

        {!editing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label>Batches (optional)</Label>
                <p className="text-xs text-muted-foreground">Lab groups such as A1, A2. You can change them later.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => batchFields.append({ name: "", student_count: "" as unknown as number })}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                Add batch
              </Button>
            </div>
            {batchFields.fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[1fr_6rem_auto] items-start gap-2">
                <TextField name={`batches.${i}.name`} label="Name" placeholder={`A${i + 1}`} className="space-y-1" />
                <TextField name={`batches.${i}.student_count`} label="Size" type="number" inputMode="numeric" min={0} className="space-y-1" />
                <Button type="button" variant="ghost" size="icon" className="mt-8" aria-label={`Remove batch ${i + 1}`} onClick={() => batchFields.remove(i)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            {batchErrors?.root?.message && <p className="text-sm font-medium text-destructive">{batchErrors.root.message}</p>}
          </div>
        )}
      </FormDialog>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// Manage batches of one division (the hidden whole-division batch is never listed)
// ---------------------------------------------------------------------------

function BatchesDialog({ termId, division, onClose }: { termId: string; division: DivisionWithBatches | null; onClose: () => void }) {
  const [toDelete, setToDelete] = useState<Batch | null>(null);
  const remove = useDeleteBatch(termId, { silent: true, successMessage: "Batch deleted" });
  // Keep the last division while the dialog animates closed.
  const [shown, setShown] = useState<DivisionWithBatches | null>(null);
  useEffect(() => {
    if (division) setShown(division);
  }, [division]);
  const d = division ?? shown;
  const batches = d ? realBatches(d) : [];
  const total = batches.reduce((n, b) => n + b.student_count, 0);

  return (
    <Dialog open={!!division} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl sm:max-w-[560px] sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{d ? `Batches of ${d.semester}${d.name}` : "Batches"}</DialogTitle>
          <DialogDescription>
            Lab groups of this division. {d ? `Batches total ${total} of ${d.student_count} students.` : ""}
          </DialogDescription>
        </DialogHeader>
        {d && (
          <div className="space-y-3">
            {batches.length === 0 && <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No batches yet. Labs will run for the whole division until you add some.</p>}
            {batches.map((b) => (
              <BatchRow key={b.id} termId={termId} divisionId={d.id} batch={b} onDelete={() => setToDelete(b)} />
            ))}
            <div className="border-t pt-3">
              <p className="mb-2 text-sm font-medium">Add a batch</p>
              <BatchRow termId={termId} divisionId={d.id} batch={null} />
            </div>
          </div>
        )}
        <ConfirmDelete
          open={!!toDelete}
          onOpenChange={(open) => !open && setToDelete(null)}
          title={toDelete ? `Delete batch ${toDelete.name}?` : "Delete batch?"}
          description="Its lab assignments and unplaced sessions are removed too."
          onConfirm={() => remove.mutateAsync({ divisionId: d!.id, batchId: toDelete!.id })}
          errorText={(err) =>
            hasCode(err, "HAS_PLACED_SESSIONS")
              ? "This batch has sessions placed on the timetable. Unplace them first."
              : describeApiError(err)
          }
        />
      </DialogContent>
    </Dialog>
  );
}

/** One editable batch line; with `batch = null` it is the "add" line. */
function BatchRow({ termId, divisionId, batch, onDelete }: { termId: string; divisionId: string; batch: Batch | null; onDelete?: () => void }) {
  const [name, setName] = useState(batch?.name ?? "");
  const [size, setSize] = useState(batch ? String(batch.student_count) : "");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateBatch(termId, { silent: true, successMessage: "Batch added" });
  const update = useUpdateBatch(termId, { silent: true, successMessage: "Batch saved" });
  const pending = create.isPending || update.isPending;

  // Follow server data after a save or a refetch.
  useEffect(() => {
    if (batch) {
      setName(batch.name);
      setSize(String(batch.student_count));
    }
  }, [batch?.name, batch?.student_count]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = batch ? name.trim() !== batch.name || size.trim() !== String(batch.student_count) : true;

  const save = async () => {
    setError(null);
    const trimmed = name.trim();
    const count = Number(size);
    if (!trimmed) return setError("Enter a batch name");
    if (trimmed.length > 40) return setError("Batch name must be at most 40 characters");
    if (trimmed.toLowerCase() === "all") return setError('The name "ALL" is reserved');
    if (size.trim() === "") return setError("Batch size is required");
    if (!Number.isInteger(count) || count < 0 || count > 100000) return setError("Enter the batch size as a whole number from 0 to 100000");
    try {
      if (batch) {
        await update.mutateAsync({ divisionId, batchId: batch.id, patch: { name: trimmed, student_count: count } });
      } else {
        await create.mutateAsync({ divisionId, input: { name: trimmed, student_count: count } });
        setName("");
        setSize("");
      }
    } catch (err) {
      setError(hasCode(err, "DUPLICATE") ? "This division already has a batch with that name" : describeApiError(err));
    }
  };

  const label = batch ? batch.name : "new batch";
  return (
    <div className="space-y-1">
      <form
        className="grid grid-cols-[1fr_5.5rem_auto] items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) void save();
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. A1" aria-label={`Name of ${label}`} disabled={pending} />
        <Input value={size} onChange={(e) => setSize(e.target.value)} placeholder="Size" type="number" inputMode="numeric" min={0} aria-label={`Size of ${label}`} disabled={pending} />
        <div className="flex gap-1">
          <Button type="submit" size="sm" variant={batch ? "secondary" : "default"} disabled={pending || !dirty}>
            {batch ? "Save" : "Add"}
          </Button>
          {batch && onDelete && (
            <Button type="button" variant="ghost" size="icon" aria-label={`Delete batch ${batch.name}`} onClick={onDelete} disabled={pending}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </form>
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
