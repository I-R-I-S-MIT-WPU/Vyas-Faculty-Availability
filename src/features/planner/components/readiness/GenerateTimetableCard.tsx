import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, Loader2, Sparkles, Undo2, XCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDivisions, useReadiness } from "../../hooks";
import {
  SEEDS_DEFAULT,
  SEEDS_MAX,
  SEEDS_MIN,
  PARTLY_SAVED,
  buildGenerateRequest,
  cancelNote,
  clampSeeds,
  divisionLabel,
  needsConfirm,
  regenerateWarning,
  runSummary,
  scopeSummary,
  toggleId,
  unplacedPreview,
} from "../../lib/generateFlow";
import { STALLED_HINT, committedChanges, modeLabel, progressPercent, progressText, stageLabel, summariseUnplaced } from "../../lib/generation";
import { describeApiError } from "../../lib/errors";
import { sortDivisions } from "../../lib/sessionFilters";
import type { GenerationMode, GenerationRun } from "../../types";
import { useGenerateFlow } from "./useGenerateFlow";

/** Unplaced sessions listed per reason before "and N more" (the API caps the run at 200 anyway). */
const UNPLACED_LIST_LIMIT = 30;

export interface GenerateTimetableCardProps {
  termId: string;
  versionId: string;
}

export default function GenerateTimetableCard({ termId, versionId }: GenerateTimetableCardProps) {
  const flow = useGenerateFlow(versionId, { where: "setup" });
  const divisions = useDivisions(termId);
  const readiness = useReadiness(termId);

  const [mode, setMode] = useState<GenerationMode>("fill_unplaced");
  const [scope, setScope] = useState<string[]>([]);
  const [seedsText, setSeedsText] = useState(String(SEEDS_DEFAULT));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);

  const divisionList = useMemo(() => sortDivisions(divisions.data ?? []), [divisions.data]);
  const readinessErrors = readiness.data?.counts.errors ?? 0;
  const { active, latestFinished, undoable } = flow;
  // The run an Undo would undo is not always the one shown under "Last run" (a newer run may have changed nothing).
  const undoIsLast = !!undoable && undoable.id === latestFinished?.id;

  const run = async (confirmed: boolean) => {
    setConfirmRegenerate(false);
    await flow.start(buildGenerateRequest({ mode, divisionIds: scope, seeds: seedsText, confirmed }));
  };
  const onGenerate = () => {
    if (needsConfirm(mode)) setConfirmRegenerate(true);
    else void run(false);
  };

  const doUndo = async () => {
    setConfirmUndo(false);
    if (undoable) await flow.undoRun(undoable);
  };

  const scopeText = scopeSummary(scope, divisionList);

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-xl">Generate timetable</CardTitle>
        <CardDescription>
          Places the sessions on the grid for you, using the rules in the Rules tab. Locked sessions never move, and the editor lets
          you adjust the result afterwards.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {readinessErrors > 0 && (
          <Alert className="border-amber-500/50">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            <AlertTitle>
              The readiness report has {readinessErrors} {readinessErrors === 1 ? "error" : "errors"}
            </AlertTitle>
            <AlertDescription>Generation is refused until they are fixed. See the readiness report above.</AlertDescription>
          </Alert>
        )}

        <fieldset className="space-y-3" disabled={flow.busy}>
          <legend className="text-sm font-medium">What to generate</legend>
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as GenerationMode)} className="gap-3" aria-label="Generation mode">
            <div className="flex items-start gap-2">
              <RadioGroupItem value="fill_unplaced" id="gen-mode-fill" className="mt-0.5" />
              <div className="space-y-0.5">
                <Label htmlFor="gen-mode-fill" className="font-medium">
                  {modeLabel("fill_unplaced")}
                </Label>
                <p className="text-xs text-muted-foreground">Sessions already on the grid stay exactly where they are.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="regenerate_unlocked" id="gen-mode-regen" className="mt-0.5" />
              <div className="space-y-0.5">
                <Label htmlFor="gen-mode-regen" className="font-medium">
                  {modeLabel("regenerate_unlocked")}
                </Label>
                <p className="text-xs text-muted-foreground">Clears every unlocked placed session in scope and plans them again.</p>
              </div>
            </div>
          </RadioGroup>

          {mode === "regenerate_unlocked" && (
            <Alert className="border-amber-500/50">
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>{regenerateWarning}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <span id="gen-scope-label" className="text-sm font-medium">
              Divisions
            </span>
            <DivisionScope
              divisions={divisionList}
              loading={divisions.isLoading}
              error={divisions.error}
              value={scope}
              onChange={setScope}
              summary={scopeText}
              disabled={flow.busy}
            />
            <p className="text-xs text-muted-foreground">Leave empty to cover every division. Divisions outside the scope are left alone.</p>
          </div>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 rounded text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Advanced options"
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform", !advancedOpen && "-rotate-90")} aria-hidden="true" />
                Advanced
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1.5 pt-2">
              <Label htmlFor="gen-seeds">Seeds to try ({SEEDS_MIN} to {SEEDS_MAX})</Label>
              <Input
                id="gen-seeds"
                type="number"
                inputMode="numeric"
                min={SEEDS_MIN}
                max={SEEDS_MAX}
                step={1}
                value={seedsText}
                onChange={(e) => setSeedsText(e.target.value)}
                onBlur={() => setSeedsText(String(clampSeeds(seedsText)))}
                className="w-24"
                aria-label="Number of seeds"
                aria-describedby="gen-seeds-help"
              />
              <p id="gen-seeds-help" className="text-xs text-muted-foreground">
                Each seed is a different attempt; the best result is kept. More seeds can give a better timetable but take longer.
              </p>
            </CollapsibleContent>
          </Collapsible>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onGenerate} disabled={flow.busy}>
            {flow.busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />}
            {flow.starting ? "Starting..." : active ? "Generating..." : "Generate timetable"}
          </Button>
          <Button asChild variant="outline">
            <Link to={`/admin/planner/terms/${termId}/editor`}>
              <CalendarDays className="mr-2 h-4 w-4" aria-hidden="true" />
              Open editor
            </Link>
          </Button>
          {undoable && !active && (
            <Button variant="outline" onClick={() => setConfirmUndo(true)} disabled={flow.undoing}>
              {flow.undoing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />}
              {undoIsLast ? "Undo last generation" : "Undo last run that saved changes"}
            </Button>
          )}
        </div>

        {flow.error && (
          <Alert variant="destructive" role="alert">
            <XCircle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Could not start the generation</AlertTitle>
            <AlertDescription>{flow.error}</AlertDescription>
          </Alert>
        )}

        {flow.runs.isLoading && (
          <div className="space-y-2" role="status" aria-label="Loading generation runs">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {flow.runs.error && !flow.runs.data && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Could not load the generation history</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{describeApiError(flow.runs.error)}</p>
              <Button variant="outline" size="sm" onClick={() => flow.runs.refetch()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {active && <ActiveRun run={active} onCancel={flow.cancelActive} cancelling={flow.cancelling} stalled={flow.stalled} />}
        {!active && latestFinished && <FinishedRun run={latestFinished} />}
        {!active && !latestFinished && flow.runs.data && (
          <p className="text-sm text-muted-foreground">Nothing generated yet. Choose what to generate and press the button.</p>
        )}
      </CardContent>

      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate unlocked sessions?</AlertDialogTitle>
            <AlertDialogDescription>
              {regenerateWarning} Scope: {scopeText.toLowerCase()}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void run(true)}>Regenerate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmUndo} onOpenChange={setConfirmUndo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo the last generation?</AlertDialogTitle>
            <AlertDialogDescription>
              Sessions that run placed go back to where they were before. Sessions you moved or changed since then are left as they are,
              and you will be told how many. Sessions the server cannot put back are reported separately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doUndo()}>Undo generation</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// =============================================================================

function DivisionScope({
  divisions,
  loading,
  error,
  value,
  onChange,
  summary,
  disabled,
}: {
  divisions: { id: string; semester: number; name: string }[];
  loading: boolean;
  error: unknown;
  value: string[];
  onChange: (ids: string[]) => void;
  summary: string;
  disabled?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between sm:w-64"
          disabled={disabled || loading || divisions.length === 0}
          aria-label={`Divisions to generate: ${summary}`}
        >
          <span className="truncate">{loading ? "Loading divisions..." : divisions.length === 0 ? "No divisions yet" : summary}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {divisions.map((d) => {
            const id = `gen-div-${d.id}`;
            return (
              <div key={d.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent">
                <Checkbox id={id} checked={value.includes(d.id)} onCheckedChange={() => onChange(toggleId(value, d.id))} />
                <Label htmlFor={id} className="flex-1 cursor-pointer font-normal">
                  {divisionLabel(d)}
                </Label>
              </div>
            );
          })}
        </div>
        <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => onChange([])} disabled={value.length === 0}>
          Clear (all divisions)
        </Button>
        {error ? <p className="px-2 pt-1 text-xs text-destructive">{describeApiError(error)}</p> : null}
      </PopoverContent>
    </Popover>
  );
}

function ActiveRun({
  run,
  onCancel,
  cancelling,
  stalled,
}: {
  run: GenerationRun;
  onCancel: () => void;
  cancelling: boolean;
  stalled: boolean;
}) {
  const pct = progressPercent(run);
  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="active-run">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {run.status === "queued" ? progressText(run) : stageLabel(run.stage)}
        </p>
        <span className="text-sm tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <Progress value={pct} aria-label={`Generation progress: ${progressText(run)}`} />
      {stalled && (
        <Alert className="border-amber-500/50" data-testid="stalled-run">
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
          <AlertDescription>{STALLED_HINT}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {modeLabel(run.mode)}. {cancelNote(run.stage)}
        </p>
        <Button variant={stalled ? "destructive" : "outline"} size="sm" onClick={onCancel} disabled={cancelling}>
          {cancelling ? "Cancelling..." : "Cancel"}
        </Button>
      </div>
    </div>
  );
}

const STATUS_BADGE: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  succeeded: { label: "Finished", className: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200", icon: CheckCircle2 },
  failed: { label: "Failed", className: "border-transparent bg-destructive/10 text-destructive", icon: XCircle },
  cancelled: { label: "Cancelled", className: "text-muted-foreground", icon: AlertTriangle },
};

function FinishedRun({ run }: { run: GenerationRun }) {
  const s = runSummary(run);
  const groups = useMemo(() => summariseUnplaced(run.unplaced), [run.unplaced]);
  const badge = STATUS_BADGE[run.status] ?? STATUS_BADGE.cancelled;
  const BadgeIcon = badge.icon;
  const when = new Date(run.finished_at ?? run.created_at);
  const unplacedTotal = run.unplaced_total ?? run.unplaced.length;

  return (
    <section className="space-y-3 rounded-md border p-3" aria-label="Latest generation run">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Last run</h3>
        <Badge variant="outline" className={cn("gap-1", badge.className)}>
          <BadgeIcon className="h-3 w-3" aria-hidden="true" />
          {badge.label}
        </Badge>
        {run.undone_at && <Badge variant="outline">Undone</Badge>}
        <span className="text-xs text-muted-foreground">
          {modeLabel(run.mode)}
          {Number.isNaN(when.getTime()) ? "" : `, ${when.toLocaleString()}`}
        </span>
      </div>

      {run.status === "failed" && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>The run failed</AlertTitle>
          <AlertDescription>
            {run.error_message || "Something went wrong."} {committedChanges(run) ? `${PARTLY_SAVED}.` : "Nothing was changed."}
          </AlertDescription>
        </Alert>
      )}
      {run.status === "cancelled" && (
        <p className="text-sm text-muted-foreground">
          {committedChanges(run) ? `The run was cancelled. ${PARTLY_SAVED}.` : "The run was cancelled. Nothing was changed."}
        </p>
      )}

      {s && (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Placed" value={`${s.placed} of ${s.requested}`} />
          <Stat label="Not placed" value={String(s.unplaced)} />
          <Stat label="Time taken" value={s.duration} />
          <Stat label="Seeds tried" value={s.bestSeed === null ? String(s.seedsTried) : `${s.seedsTried} (best: ${s.bestSeed})`} />
          <Stat label="Lab sessions" value={`${s.lab.placed} of ${s.lab.total}`} />
          <Stat label="Theory sessions" value={`${s.theory.placed} of ${s.theory.total}`} />
        </dl>
      )}

      {groups.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">
            Could not place {unplacedTotal} {unplacedTotal === 1 ? "session" : "sessions"}
          </h4>
          {groups.map((g) => (
            <UnplacedGroupView key={g.code} group={g} />
          ))}
          {unplacedTotal > run.unplaced.length && (
            <p className="text-xs text-muted-foreground">Showing the first {run.unplaced.length} of {unplacedTotal}.</p>
          )}
        </div>
      )}
      {s && s.unplaced === 0 && run.status === "succeeded" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          Every requested session was placed.
        </p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function UnplacedGroupView({ group }: { group: ReturnType<typeof summariseUnplaced>[number] }) {
  const [open, setOpen] = useState(false);
  const { shown, hidden } = unplacedPreview(group.items, UNPLACED_LIST_LIMIT);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${group.label}: ${group.count} sessions`}
        >
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", !open && "-rotate-90")} aria-hidden="true" />
          <span className="font-medium">{group.label}</span>
          <Badge variant="secondary" className="tabular-nums">
            {group.count}
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1 divide-y rounded-md border">
          {shown.map((u) => (
            <li key={u.session_id} className="space-y-0.5 px-3 py-2 text-sm">
              <p className="break-all font-mono text-xs text-muted-foreground">{u.key}</p>
              <p className="break-words">{u.text}</p>
            </li>
          ))}
        </ul>
        {hidden > 0 && <p className="mt-1 text-xs text-muted-foreground">and {hidden} more</p>}
      </CollapsibleContent>
    </Collapsible>
  );
}

export { GenerateTimetableCard };
