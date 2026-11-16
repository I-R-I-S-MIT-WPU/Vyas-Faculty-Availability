import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Loader2, RefreshCw, Wand2, XCircle } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { plannerKeys, useReadiness, useSessionsSummary, useSyncSessions, useTerm } from "../../hooks";
import { describeApiError } from "../../lib/errors";
import type { IssueNavTarget, IssueSeverity, ReadinessIssue, ReadinessReport, SessionsSummary, SyncSessionsResult } from "../../types";
import GenerateTimetableCard from "./GenerateTimetableCard";

export interface ReadinessPanelProps {
  termId: string;
  /**
   * Called when the user clicks an issue; `tab` is the contract's entity.tab (settings|faculty|subjects|divisions|offerings|rooms).
   * The optional second argument says which entity the issue is about (entity type/id and the issue's meta), so the
   * host can open the right row (e.g. the offending division). Callers that only take `tab` keep working.
   */
  onNavigateTab?: (tab: string, target?: IssueNavTarget) => void;
}

/** Issues shown per group before "Show all": a bad import can produce hundreds of the same issue. */
const ISSUE_PREVIEW = 25;

export default function ReadinessPanel({ termId, onNavigateTab }: ReadinessPanelProps) {
  return (
    <section className="space-y-4" aria-label="Readiness">
      <ReadinessReportCard termId={termId} onNavigateTab={onNavigateTab} />
      <GenerateSessionsCard termId={termId} />
      <GenerateTimetableSection termId={termId} />
    </section>
  );
}

/** The generator needs the draft version; GenerateSessionsCard already explains a term without one. */
function GenerateTimetableSection({ termId }: { termId: string }) {
  const term = useTerm(termId);
  const versionId = term.data?.draft_version_id ?? null;
  if (!versionId) return null;
  return <GenerateTimetableCard termId={termId} versionId={versionId} />;
}

// =============================================================================
// Readiness report
// =============================================================================

function ReadinessReportCard({ termId, onNavigateTab }: ReadinessPanelProps) {
  const readiness = useReadiness(termId);
  const report = readiness.data;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
            Readiness
            {report && <StatusBadge report={report} />}
          </CardTitle>
          <CardDescription>Checks that the setup is complete enough to build a timetable from.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => readiness.refetch()} disabled={readiness.isFetching}>
          <RefreshCw className={cn("mr-2 h-4 w-4", readiness.isFetching && "animate-spin")} aria-hidden="true" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {readiness.isLoading && (
          <div className="space-y-3" role="status" aria-label="Loading readiness report">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {readiness.error && !readiness.isLoading ? (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Could not load the readiness report</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{describeApiError(readiness.error)}</p>
              <Button variant="outline" size="sm" onClick={() => readiness.refetch()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {report && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <CountChip icon={XCircle} label="errors" count={report.counts.errors} tone="error" />
              <CountChip icon={AlertTriangle} label="warnings" count={report.counts.warnings} tone="warning" />
              <CountChip icon={Info} label="info" count={report.counts.info} tone="info" />
            </div>

            <StatsGrid stats={report.stats} />

            {report.counts.errors + report.counts.warnings + report.counts.info === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                No issues found.
              </p>
            ) : (
              <div className="space-y-5">
                <IssueGroup title="Errors" severity="error" issues={report.errors} onNavigateTab={onNavigateTab} />
                <IssueGroup title="Warnings" severity="warning" issues={report.warnings} onNavigateTab={onNavigateTab} />
                <IssueGroup title="Info" severity="info" issues={report.info} onNavigateTab={onNavigateTab} collapsible />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ report }: { report: ReadinessReport }) {
  if (report.ready) {
    return (
      <Badge className="gap-1 border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        Ready for scheduling
      </Badge>
    );
  }
  const n = report.counts.errors;
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="h-3 w-3" aria-hidden="true" />
      {n} {n === 1 ? "error" : "errors"}
    </Badge>
  );
}

const TONE: Record<IssueSeverity, string> = {
  error: "text-destructive",
  warning: "text-amber-700 dark:text-amber-300",
  info: "text-sky-700 dark:text-sky-300",
};

function CountChip({ icon: Icon, label, count, tone }: { icon: typeof Info; label: string; count: number; tone: IssueSeverity }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1",
        count > 0 ? TONE[tone] : "text-muted-foreground",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="font-semibold tabular-nums">{count}</span> {label}
    </span>
  );
}

/** 450 -> "7h 30m" */
function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function StatsGrid({ stats }: { stats: ReadinessReport["stats"] }) {
  const items: { label: string; value: string }[] = [
    { label: "Divisions", value: String(stats.divisions) },
    { label: "Subjects", value: String(stats.subjects) },
    { label: "Offerings", value: String(stats.offerings) },
    { label: "Faculty assigned", value: String(stats.faculty_assigned) },
    { label: "Rooms", value: String(stats.rooms) },
    { label: "Lab rooms", value: String(stats.lab_rooms) },
    { label: "Sessions required", value: String(stats.sessions_required) },
    { label: "Teachable per day", value: formatMinutes(stats.teachable_minutes_per_day) },
    {
      label: "Term weeks",
      value: stats.term_weeks === null || stats.term_weeks === undefined ? "Not set" : String(stats.term_weeks),
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => (
        <div key={it.label} className="rounded-md border px-3 py-2">
          <dt className="text-xs text-muted-foreground">{it.label}</dt>
          <dd className="text-lg font-semibold tabular-nums">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const SEVERITY_ICON = { error: XCircle, warning: AlertTriangle, info: Info } as const;

function IssueGroup({
  title,
  severity,
  issues,
  onNavigateTab,
  collapsible,
}: {
  title: string;
  severity: IssueSeverity;
  issues: ReadinessIssue[];
  onNavigateTab?: (tab: string, target?: IssueNavTarget) => void;
  /** Start collapsed (used for info). */
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);
  const [showAll, setShowAll] = useState(false);
  if (issues.length === 0) return null;

  const Icon = SEVERITY_ICON[severity];
  const shown = showAll ? issues : issues.slice(0, ISSUE_PREVIEW);

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", !open && "-rotate-90")} aria-hidden="true" />
        <Icon className={cn("h-4 w-4 shrink-0", TONE[severity])} aria-hidden="true" />
        <h3 className="font-semibold">
          {title} <span className="font-normal text-muted-foreground">({issues.length})</span>
        </h3>
      </button>

      {open && (
        <>
          <ul className="divide-y rounded-md border">
            {shown.map((issue, i) => (
              <li
                key={`${issue.code}-${issue.entity?.id}-${i}`}
                className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5"
              >
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONE[severity])} aria-hidden="true" />
                  <p className="min-w-0 break-words text-sm">
                    <span className="sr-only">{title.replace(/s$/, "")}: </span>
                    {issue.message}
                  </p>
                </div>
                {onNavigateTab && issue.entity?.tab && (
                  <Button variant="outline" size="sm" onClick={() => onNavigateTab(issue.entity.tab, { type: issue.entity.type, id: issue.entity.id, meta: issue.meta })}>
                    Fix
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {issues.length > ISSUE_PREVIEW && (
            <Button variant="ghost" size="sm" onClick={() => setShowAll((s) => !s)}>
              {showAll ? "Show fewer" : `Show all ${issues.length}`}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

// =============================================================================
// Generate sessions
// =============================================================================

function GenerateSessionsCard({ termId }: { termId: string }) {
  const qc = useQueryClient();
  const term = useTerm(termId);
  const readiness = useReadiness(termId);
  const versionId = term.data?.draft_version_id ?? null;
  const summary = useSessionsSummary(versionId);
  const sync = useSyncSessions({
    successMessage: (data) => {
      const r = data as SyncSessionsResult;
      return `Added ${r.added}, removed ${r.removed}, kept ${r.kept}`;
    },
  });
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<SyncSessionsResult | null>(null);

  const errorCount = readiness.data?.counts.errors ?? 0;

  const run = async () => {
    if (!versionId) return;
    setConfirming(false);
    try {
      const r = await sync.mutateAsync(versionId);
      setResult(r as SyncSessionsResult);
      // The hook refreshes the version's data; readiness (sessions_required) is a term-scoped query.
      await Promise.all([
        qc.invalidateQueries({ queryKey: plannerKeys.readiness(termId) }),
        qc.invalidateQueries({ queryKey: plannerKeys.sessionsSummary(versionId) }),
      ]);
    } catch {
      // The hook already toasted the error.
    }
  };

  const onClick = () => {
    if (errorCount > 0) setConfirming(true);
    else void run();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-xl">Generate sessions</CardTitle>
          <CardDescription>
            Creates one unplaced session for every class the offerings require. Safe to run again: it only adds what is missing
            and never removes a placed session.
          </CardDescription>
        </div>
        <Button onClick={onClick} disabled={!versionId || sync.isPending || term.isLoading}>
          {sync.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Wand2 className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {sync.isPending ? "Generating..." : "Generate sessions"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {term.error ? (
          <p className="text-sm text-destructive">{describeApiError(term.error)}</p>
        ) : !term.isLoading && !versionId ? (
          <p className="text-sm text-muted-foreground">This term has no draft version to generate sessions into.</p>
        ) : null}

        {result && <SyncResult result={result} />}

        <SummaryByDivision
          loading={summary.isLoading || term.isLoading}
          error={summary.error}
          onRetry={() => summary.refetch()}
          data={summary.data}
          enabled={!!versionId}
        />
      </CardContent>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate sessions anyway?</AlertDialogTitle>
            <AlertDialogDescription>
              There {errorCount === 1 ? "is 1 error" : `are ${errorCount} errors`}; generate anyway? Sessions will be created from
              the offerings that exist now, and the errors may stop the timetable from being completed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void run()}>Generate anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function SyncResult({ result }: { result: SyncSessionsResult }) {
  const surplus = result.placed_surplus ?? [];
  const surplusTotal = surplus.reduce((n, s) => n + s.count, 0);
  return (
    <div className="space-y-2" role="status">
      <Alert>
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        <AlertTitle>
          Added {result.added}, removed {result.removed}, kept {result.kept}
        </AlertTitle>
      </Alert>
      {surplus.length > 0 && (
        <Alert className="border-amber-500/50">
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
          <AlertTitle>
            {surplusTotal} placed session{surplusTotal === 1 ? "" : "s"} kept beyond what is now required
          </AlertTitle>
          <AlertDescription className="space-y-1">
            <p>
              These sessions are already on the timetable, so they were not removed. Unplace or delete them yourself if they are
              no longer needed.
            </p>
            <ul className="list-disc pl-5 text-xs">
              {surplus.map((s, i) => (
                <li key={`${s.offering_id}-${s.batch_id}-${i}`}>
                  {s.count} extra for offering {s.offering_id.slice(0, 8)}, batch {s.batch_id.slice(0, 8)}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function SummaryByDivision({
  loading,
  error,
  onRetry,
  data,
  enabled,
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  data: (SessionsSummary & { success?: boolean }) | undefined;
  enabled: boolean;
}) {
  if (!enabled && !loading) return null;

  if (loading) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading sessions summary">
        <Skeleton className="h-5 w-1/4" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Could not load the sessions summary</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{describeApiError(error)}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const divisions = data?.divisions ?? [];
  if (divisions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No divisions yet. Add divisions and offerings, then generate sessions.</p>
    );
  }

  const semesters = [...new Set(divisions.map((d) => d.semester))].sort((a, b) => a - b);
  const total = divisions.reduce(
    (t, d) => ({ required: t.required + d.required, placed: t.placed + d.placed, unplaced: t.unplaced + d.unplaced }),
    { required: 0, placed: 0, unplaced: 0 },
  );
  const stale = divisions.filter((d) => d.placed + d.unplaced !== d.required).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">Sessions in the draft</span>
        <span className="text-muted-foreground">
          {total.required} required, {total.placed} placed, {total.unplaced} unplaced
        </span>
        {stale > 0 && (
          <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-300">
            {stale} division{stale === 1 ? "" : "s"} out of date: generate to sync
          </Badge>
        )}
      </div>

      {semesters.map((sem) => {
        const rows = divisions.filter((d) => d.semester === sem);
        return (
          <div key={sem} className="max-w-full overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <caption className="bg-muted/40 px-3 py-2 text-left font-medium">Semester {sem}</caption>
              <thead>
                <tr className="border-y text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-3 py-1.5 font-medium">
                    Division
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">
                    Required
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">
                    Placed
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">
                    Unplaced
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((d) => (
                  <tr key={d.division_id}>
                    <th scope="row" className="px-3 py-1.5 text-left font-medium">
                      {d.name}
                    </th>
                    <td className="px-3 py-1.5 text-right tabular-nums">{d.required}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{d.placed}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{d.unplaced}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
