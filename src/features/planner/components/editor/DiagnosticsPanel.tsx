// Collapsible issues panel under the editor grid, plus the readiness badges the status bar reuses.
//
//   DiagnosticsPanel({ diagnostics, loading, error, updating?, onRetry?, divisionId, divisionLabel?, activeIssueId, onSelectIssue })
//     diagnostics     GET /versions/:id/diagnostics answer (null until it arrives)
//     activeIssueId   the issue the user picked (aria-pressed on its row); onSelectIssue(issue) is called on click, the board
//                     decides what that means (switch division, select + highlight the sessions, or clear when clicked again)
//   Open by default when there is a blocking or hard issue, closed otherwise; once the user toggles it the choice sticks (local state).
//   Filters: All / Hard / Soft (Hard includes blocking) and This division / All divisions. Issues are grouped by severity. The counts
//   are announced politely (aria-live) so a screen reader hears "Not ready: 2 hard issues" after an edit, once.
//
//   DiagnosticsBadges({ diagnostics, className? })
//     'Ready to publish' (green) or 'Not ready: N hard issues' (red), plus 'N warnings' (amber) when there are soft issues.
//     Always icon + text, never colour alone.

import { useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Info, Lightbulb, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { countIssues, issueLabel, sortIssues } from "../../lib/diagnostics";
import {
  defaultPanelOpen,
  diagnosticsSummary,
  filterIssues,
  groupBySeverity,
  plural,
  type SeverityFilter,
} from "../../lib/editorHighlights";
import type { DiagnosticsResponse, Issue, RuleSeverity } from "../../types";

const READY_STYLE = "border-status-success-border bg-status-success text-status-success-foreground";
const NOT_READY_STYLE = "border-status-danger-border bg-status-danger text-status-danger-foreground";
const WARN_STYLE = "border-status-lunch-border bg-status-lunch text-status-lunch-foreground";

export function DiagnosticsBadges({
  diagnostics,
  className,
}: {
  diagnostics: Pick<DiagnosticsResponse, "counts"> & Partial<Pick<DiagnosticsResponse, "publishable">> | null | undefined;
  className?: string;
}) {
  const s = diagnosticsSummary(diagnostics);
  if (s.pending) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Checking rules
      </span>
    );
  }
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {s.ready ? (
        <Badge variant="outline" className={cn("gap-1", READY_STYLE)}>
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          {s.readyText}
        </Badge>
      ) : (
        <Badge variant="outline" className={cn("gap-1", NOT_READY_STYLE)}>
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
          {s.notReadyText}
        </Badge>
      )}
      {s.soft > 0 && (
        <Badge variant="outline" className={cn("gap-1", WARN_STYLE)}>
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          {s.warningsText}
        </Badge>
      )}
    </span>
  );
}

const GROUP_TITLE: Record<RuleSeverity, string> = {
  blocking: "Blocking",
  hard: "Hard rule violations",
  soft: "Warnings",
};

function SeverityIcon({ severity, className }: { severity: RuleSeverity; className?: string }) {
  if (severity === "blocking") return <XCircle className={cn("text-status-danger-foreground", className)} aria-hidden="true" />;
  if (severity === "hard") return <AlertTriangle className={cn("text-status-danger-foreground", className)} aria-hidden="true" />;
  return <Info className={cn("text-status-lunch-foreground", className)} aria-hidden="true" />;
}

function SegButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export interface DiagnosticsPanelProps {
  diagnostics: DiagnosticsResponse | null;
  loading: boolean;
  error: boolean;
  /** A newer answer is being fetched while the previous one is shown. */
  updating?: boolean;
  onRetry?: () => void;
  divisionId: string | null;
  divisionLabel?: (divisionId: string) => string;
  activeIssueId: string | null;
  onSelectIssue: (issue: Issue) => void;
  className?: string;
}

export function DiagnosticsPanel({
  diagnostics,
  loading,
  error,
  updating,
  onRetry,
  divisionId,
  divisionLabel,
  activeIssueId,
  onSelectIssue,
  className,
}: DiagnosticsPanelProps) {
  const [openPref, setOpenPref] = useState<boolean | null>(null);
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [scope, setScope] = useState<"division" | "all">("division");
  const open = openPref ?? defaultPanelOpen(diagnostics);
  const scopedToDivision = scope === "division" && divisionId != null;

  const issues = diagnostics?.issues ?? [];
  const inScope = filterIssues(issues, { severity: "all", divisionId: scopedToDivision ? divisionId : null });
  const scopeCounts = countIssues(inScope);
  const visible = sortIssues(filterIssues(issues, { severity, divisionId: scopedToDivision ? divisionId : null }));
  const groups = groupBySeverity(visible);
  const summary = diagnosticsSummary(diagnostics);
  const otherDivisions = issues.length - inScope.length;

  const Chevron = open ? ChevronDown : ChevronRight;
  const bodyId = "planner-diagnostics-body";

  return (
    <section aria-label="Diagnostics" className={cn("rounded-md border bg-card", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpenPref(!open)}
          className="flex items-center gap-1.5 rounded text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Chevron className="h-4 w-4" aria-hidden="true" />
          Issues
        </button>
        <DiagnosticsBadges diagnostics={diagnostics} />
        {/* One polite announcement of the result; the badges above are not live themselves. */}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {summary.pending
            ? ""
            : `${summary.ready ? summary.readyText : summary.notReadyText}. ${summary.warningsText}.`}
        </span>
        {(updating || loading) && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Updating
          </span>
        )}
      </div>

      {open && (
        <div id={bodyId} className="space-y-3 border-t px-3 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div role="group" aria-label="Show issues of severity" className="flex items-center gap-0.5 rounded-md border p-0.5">
              <SegButton active={severity === "all"} onClick={() => setSeverity("all")}>
                All ({scopeCounts.total})
              </SegButton>
              <SegButton active={severity === "hard"} onClick={() => setSeverity("hard")}>
                Hard ({scopeCounts.blocking + scopeCounts.hard})
              </SegButton>
              <SegButton active={severity === "soft"} onClick={() => setSeverity("soft")}>
                Soft ({scopeCounts.soft})
              </SegButton>
            </div>
            {divisionId != null && (
              <div role="group" aria-label="Scope" className="flex items-center gap-0.5 rounded-md border p-0.5">
                <SegButton active={scope === "division"} onClick={() => setScope("division")}>
                  This division
                </SegButton>
                <SegButton active={scope === "all"} onClick={() => setScope("all")}>
                  All divisions
                </SegButton>
              </div>
            )}
          </div>

          {loading && !diagnostics ? (
            <div className="space-y-2" aria-hidden="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error && !diagnostics ? (
            <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              The issues could not be loaded.
              {onRetry && (
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                  Retry
                </Button>
              )}
            </p>
          ) : groups.length === 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                No issues
                {severity === "all" ? "" : " of this severity"}
                {scopedToDivision && otherDivisions > 0 ? `. ${plural(otherDivisions, "issue")} in other divisions.` : "."}
              </span>
              {scopedToDivision && otherDivisions > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setScope("all")}>
                  Show all divisions
                </Button>
              )}
            </div>
          ) : (
            <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
              {groups.map((g) => (
                <div key={g.severity} className="space-y-1">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <SeverityIcon severity={g.severity} className="h-3.5 w-3.5" />
                    {GROUP_TITLE[g.severity]} ({g.issues.length})
                  </h4>
                  <ul className="space-y-1">
                    {g.issues.map((issue) => {
                      const active = issue.id === activeIssueId;
                      const divisionName = issue.division_id && divisionLabel ? divisionLabel(issue.division_id) : null;
                      return (
                        <li key={issue.id}>
                          <button
                            type="button"
                            aria-pressed={active}
                            onClick={() => onSelectIssue(issue)}
                            className={cn(
                              "flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors",
                              "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              active ? "border-primary bg-accent ring-1 ring-primary" : "border-transparent bg-background",
                            )}
                          >
                            <SeverityIcon severity={issue.severity} className="mt-0.5 h-4 w-4 shrink-0" />
                            <span className="min-w-0 flex-1 space-y-0.5">
                              <span className="flex flex-wrap items-baseline gap-x-2">
                                <span className="font-medium">{issueLabel(issue.rule_key)}</span>
                                {divisionName && !scopedToDivision && (
                                  <span className="text-xs text-muted-foreground">{divisionName}</span>
                                )}
                              </span>
                              <span className="block">{issue.message}</span>
                              {issue.fix_hint && (
                                <span className="flex items-start gap-1 text-xs text-muted-foreground">
                                  <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                                  {issue.fix_hint}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {groups.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Click an issue to show its sessions on the grid. Click it again or press Escape to clear.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
