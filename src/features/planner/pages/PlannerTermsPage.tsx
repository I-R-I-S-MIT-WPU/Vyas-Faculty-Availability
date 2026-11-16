import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarRange, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { NewTermDialog } from "../components/NewTermDialog";
import { PlannerLayout } from "../components/PlannerLayout";
import { useDeleteTerm, useTerms } from "../hooks";
import { describeApiError } from "../lib/errors";
import { minToTime, termLabel, toDateInput, weekdaysLabel } from "../lib/time";
import type { TermListItem } from "../types";

export default function PlannerTermsPage() {
  const [newOpen, setNewOpen] = useState(false);

  return (
    <PlannerLayout
      title="Timetable Planner"
      description="Set up a term, import its data, check readiness and generate sessions."
      actions={
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          New term
        </Button>
      }
    >
      <TermList onCreate={() => setNewOpen(true)} />
      <NewTermDialog open={newOpen} onOpenChange={setNewOpen} />
    </PlannerLayout>
  );
}

function TermList({ onCreate }: { onCreate: () => void }) {
  const terms = useTerms();
  const [toDelete, setToDelete] = useState<TermListItem | null>(null);
  const remove = useDeleteTerm({ silent: true, successMessage: "Term deleted" });

  if (terms.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-44 w-full" />
        ))}
      </div>
    );
  }

  if (terms.error) {
    return (
      <div className="rounded-md border p-8 text-center">
        <p className="text-sm text-destructive">{describeApiError(terms.error)}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => terms.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!terms.data?.length) {
    return (
      <div className="flex flex-col items-center rounded-md border border-dashed p-12 text-center">
        <CalendarRange className="mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-lg font-semibold">No terms yet</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">Create a term for an odd or even half of the year to start setting up its timetables.</p>
        <Button className="mt-4" onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          New term
        </Button>
      </div>
    );
  }

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {terms.data.map((term) => (
          <li key={term.id}>
            <TermCard term={term} onDelete={() => setToDelete(term)} />
          </li>
        ))}
      </ul>

      <ConfirmDelete
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={toDelete ? `Delete ${termLabel(toDelete)}?` : "Delete term?"}
        description="This permanently deletes the term with all its divisions, subjects, offerings, room pool and sessions. Faculty are shared across terms and are kept. You will be asked for an emailed confirmation code."
        confirmLabel="Delete term"
        onConfirm={() => remove.mutateAsync(toDelete!.id)}
      />
    </>
  );
}

function TermCard({ term, onDelete }: { term: TermListItem; onDelete: () => void }) {
  const dates = term.start_date && term.end_date ? `${toDateInput(term.start_date)} to ${toDateInput(term.end_date)}` : "Dates not set";

  return (
    <Card className="relative h-full transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted/40">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">
            {/* Stretched link: the whole card is clickable; the delete button sits above it. */}
            <Link to={`/admin/planner/terms/${term.id}`} className="outline-none after:absolute after:inset-0 after:content-['']">
              {term.academic_year} &middot; {term.half === "odd" ? "Odd" : "Even"} sem
            </Link>
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="relative z-10 -mr-2 -mt-2 h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${termLabel(term)}`}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{term.branch}</Badge>
          <Badge variant={term.draft_version_id ? "default" : "outline"}>{term.draft_version_id ? "Draft" : "No draft"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {weekdaysLabel(term.working_days)}, {minToTime(term.day_start_min)}-{minToTime(term.day_end_min)}
          <br />
          {dates}
        </p>
        <dl className="grid grid-cols-5 gap-2 text-center">
          <Count label="Divisions" value={term.counts.divisions} />
          <Count label="Subjects" value={term.counts.subjects} />
          <Count label="Offerings" value={term.counts.offerings} />
          <Count label="Rooms" value={term.counts.rooms} />
          <Count label="Sessions" value={term.counts.sessions} />
        </dl>
      </CardContent>
    </Card>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}
