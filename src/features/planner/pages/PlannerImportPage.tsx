import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, ClipboardCheck, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PlannerLayout } from "../components/PlannerLayout";
import { ImportStep } from "../components/import/ImportStep";
import { ENTITY_ORDER } from "../components/import/previewModel";
import { useImportTemplates, useTerm } from "../hooks";
import { termLabel } from "../lib/time";
import type { ImportEntity, ImportResult } from "../types";

// Import order matters: offerings reference faculty codes, subject codes and divisions.
const STEPS: Record<ImportEntity, { label: string; title: string; hint: string }> = {
  faculty: {
    label: "Faculty",
    title: "Faculty",
    hint: "One row per person. Faculty is shared by every term; people with the same short code are updated, and anyone whose email matches a Vyas account is linked to it.",
  },
  subjects: {
    label: "Subjects",
    title: "Subjects",
    hint: "One row per subject for this term. Set kind to theory or lab; the duration defaults from the term settings when left blank.",
  },
  divisions: {
    label: "Divisions",
    title: "Divisions and batches",
    hint: "One row per batch. Repeat the division columns on each row; leave batch blank for a division with no batches. home_room is written as Building / Room.",
  },
  offerings: {
    label: "Offerings",
    title: "Subject offerings",
    hint: "Which subject each division studies and who teaches it. Several rows for the same division and subject are merged into one offering. Import faculty, subjects and divisions first.",
  },
};

type StepState = { status: "pending" } | { status: "skipped" } | { status: "imported"; summary: ImportResult["summary"] };

const FINISH = ENTITY_ORDER.length; // index of the closing panel

export default function PlannerImportPage() {
  const { termId = "" } = useParams();
  return (
    <PlannerLayout
      title="Import data"
      description="Load faculty, subjects, divisions and offerings from a CSV or Excel file. Every file is checked first and nothing is saved until you confirm."
      crumbs={[{ label: "Term", to: `/admin/planner/terms/${termId}` }, { label: "Import" }]}
      actions={
        <Button asChild variant="outline">
          <Link to={`/admin/planner/terms/${termId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Back to setup
          </Link>
        </Button>
      }
    >
      <Wizard termId={termId} />
    </PlannerLayout>
  );
}

function Wizard({ termId }: { termId: string }) {
  const term = useTerm(termId).data?.term;
  const templates = useImportTemplates();
  const [active, setActive] = useState(0);
  const [states, setStates] = useState<Record<ImportEntity, StepState>>({
    faculty: { status: "pending" },
    subjects: { status: "pending" },
    divisions: { status: "pending" },
    offerings: { status: "pending" },
  });
  const [epoch, setEpoch] = useState(0);

  const goNext = (index: number) => setActive(Math.min(index + 1, FINISH));
  const setState = (entity: ImportEntity, s: StepState) => setStates((prev) => ({ ...prev, [entity]: s }));

  return (
    <div className="space-y-4">
      {term && <p className="text-sm text-muted-foreground">Importing into {termLabel(term)}.</p>}

      <nav aria-label="Import steps">
        <ol className="flex gap-2 overflow-x-auto pb-1">
          {ENTITY_ORDER.map((entity, i) => {
            const state = states[entity];
            const current = active === i;
            return (
              <li key={entity} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex w-full min-w-[7rem] items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    current && "border-primary bg-primary/5 font-medium",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
                      state.status === "imported" && "border-transparent bg-emerald-600 text-white",
                      state.status === "skipped" && "border-dashed text-muted-foreground",
                      current && state.status === "pending" && "border-primary text-primary",
                    )}
                  >
                    {state.status === "imported" ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : state.status === "skipped" ? (
                      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{STEPS[entity].label}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {state.status === "imported" ? "Imported" : state.status === "skipped" ? "Skipped" : "Not done"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {ENTITY_ORDER.map((entity, i) => (
        <ImportStep
          key={entity}
          termId={termId}
          entity={entity}
          title={STEPS[entity].title}
          hint={STEPS[entity].hint}
          template={templates.data?.[entity]}
          templateLoading={templates.isLoading}
          templateError={templates.error}
          onRetryTemplate={() => templates.refetch()}
          active={active === i}
          epoch={epoch}
          alreadyImported={states[entity].status === "imported"}
          onApplied={(summary) => {
            setState(entity, { status: "imported", summary });
            setEpoch((n) => n + 1);
          }}
          onSkip={() => {
            if (states[entity].status !== "imported") setState(entity, { status: "skipped" });
            goNext(i);
          }}
          onNext={() => goNext(i)}
          nextLabel={i === ENTITY_ORDER.length - 1 ? "Finish" : `Next: ${STEPS[ENTITY_ORDER[i + 1]].label}`}
        />
      ))}

      {active === FINISH && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Import finished</CardTitle>
            <CardDescription>Here is what happened in each step.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="divide-y rounded-md border text-sm">
              {ENTITY_ORDER.map((entity) => {
                const s = states[entity];
                return (
                  <li key={entity} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="font-medium">{STEPS[entity].label}</span>
                    <span className="text-muted-foreground">
                      {s.status === "imported"
                        ? `${s.summary.create} created, ${s.summary.update} updated`
                        : s.status === "skipped"
                          ? "Skipped"
                          : "Not imported"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to={`/admin/planner/terms/${termId}`}>
                  <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                  Back to setup
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to={`/admin/planner/terms/${termId}`}>
                  <ClipboardCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                  Check readiness
                </Link>
              </Button>
              <Button variant="ghost" onClick={() => setActive(0)}>
                Import more files
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
