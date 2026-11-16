// Pure helpers for the editor's diagnostics panel, issue highlighting and status badges. No React.
//
// Exports:
//   plural(n, one, many?)                    "1 hard issue" / "3 hard issues" style helper: plural(3, "issue") -> "3 issues"
//   SeverityFilter                           'all' | 'hard' | 'soft' ('hard' also covers blocking)
//   filterIssues(issues, {severity, divisionId})
//                                            issues for the chosen severity and scope. divisionId null = every division. With a
//                                            division, issues that have NO division (they span divisions) are kept, so they stay visible.
//   groupBySeverity(issues)                  [{severity, issues}] in blocking, hard, soft order; empty groups left out
//   diagnosticsSummary(diagnostics)          {ready, pending, hard (blocking + hard), soft, readyText, notReadyText, warningsText}
//   defaultPanelOpen(diagnostics)            true when there is a blocking or hard issue (the panel opens by itself then)
//   diagnosticsBehind(diagRev, snapshotRev)  true when the diagnostics answer is older than the snapshot (it should be refetched)
//   issueWord(severity, count?)              "rule violation" / "warning" / "blocking issue", pluralised for count > 1
//   sessionIssueCounts(issues)               Map<session_id, number of issues the session is part of>
//   pickIssueSelection(issue, existing, divisionOf, currentDivisionId?)
//                                            {selectId, highlightIds}: which session to select and which to highlight when an issue is
//                                            clicked. Only sessions that still exist count; one in the issue's own division wins, and for
//                                            an issue without a division one in the currently shown division.
//   hasIssue(issues, id)                     the issue id is still in the list (the editor drops its highlight when it is not)
//   toggleIssueId(current, next)             next, or null when it is already the active one (click again clears)
//   sameIds(a, b)                            same set of ids, ignoring order

import type { DiagnosticsResponse, Issue, RuleSeverity } from "../types";
import { severityRank } from "./diagnostics";

export const plural = (n: number, one: string, many?: string): string => `${n} ${n === 1 ? one : many ?? `${one}s`}`;

export type SeverityFilter = "all" | "hard" | "soft";

export function filterIssues(
  issues: Issue[],
  { severity, divisionId }: { severity: SeverityFilter; divisionId: string | null },
): Issue[] {
  return issues.filter((i) => {
    if (severity === "hard" && i.severity === "soft") return false;
    if (severity === "soft" && i.severity !== "soft") return false;
    if (divisionId != null && i.division_id != null && i.division_id !== divisionId) return false;
    return true;
  });
}

export function groupBySeverity(issues: Issue[]): { severity: RuleSeverity; issues: Issue[] }[] {
  const order: RuleSeverity[] = ["blocking", "hard", "soft"];
  const buckets = new Map<RuleSeverity, Issue[]>();
  for (const issue of issues) {
    const list = buckets.get(issue.severity);
    if (list) list.push(issue);
    else buckets.set(issue.severity, [issue]);
  }
  return order.filter((s) => buckets.has(s)).map((severity) => ({ severity, issues: buckets.get(severity)! }));
}

export interface DiagnosticsSummary {
  /** No answer from the server yet. */
  pending: boolean;
  /** Publishable: no blocking and no hard issue (the server's own flag when present). */
  ready: boolean;
  /** Blocking plus hard issues. */
  hard: number;
  soft: number;
  readyText: string;
  notReadyText: string;
  warningsText: string;
}

export function diagnosticsSummary(diagnostics: Pick<DiagnosticsResponse, "counts"> & Partial<Pick<DiagnosticsResponse, "publishable">> | null | undefined): DiagnosticsSummary {
  const hard = (diagnostics?.counts?.blocking ?? 0) + (diagnostics?.counts?.hard ?? 0);
  const soft = diagnostics?.counts?.soft ?? 0;
  const ready = diagnostics ? (typeof diagnostics.publishable === "boolean" ? diagnostics.publishable : hard === 0) : false;
  return {
    pending: !diagnostics,
    ready,
    hard,
    soft,
    readyText: "Ready to publish",
    notReadyText: `Not ready: ${plural(hard, "hard issue")}`,
    warningsText: plural(soft, "warning"),
  };
}

export function defaultPanelOpen(diagnostics: Pick<DiagnosticsResponse, "counts"> | null | undefined): boolean {
  return ((diagnostics?.counts?.blocking ?? 0) + (diagnostics?.counts?.hard ?? 0)) > 0;
}

export function diagnosticsBehind(diagnosticsRev: number | null | undefined, snapshotRev: number | null | undefined): boolean {
  if (diagnosticsRev == null || snapshotRev == null) return false;
  return diagnosticsRev < snapshotRev;
}

export function issueWord(severity: RuleSeverity, count = 1): string {
  const many = count !== 1;
  if (severity === "blocking") return many ? "blocking issues" : "blocking issue";
  if (severity === "hard") return many ? "rule violations" : "rule violation";
  return many ? "warnings" : "warning";
}

export function sessionIssueCounts(issues: Issue[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const issue of issues) {
    for (const sid of new Set(issue.session_ids)) map.set(sid, (map.get(sid) ?? 0) + 1);
  }
  return map;
}

export function pickIssueSelection(
  issue: Pick<Issue, "session_ids" | "division_id">,
  existing: { has(id: string): boolean },
  divisionOf: (sessionId: string) => string | undefined,
  currentDivisionId?: string | null,
): { selectId: string | null; highlightIds: string[] } {
  const highlightIds = [...new Set(issue.session_ids)].filter((id) => existing.has(id));
  const wanted = issue.division_id ?? currentDivisionId ?? null;
  const inDivision = wanted ? highlightIds.find((id) => divisionOf(id) === wanted) : undefined;
  return { selectId: inDivision ?? highlightIds[0] ?? null, highlightIds };
}

/** True while an issue with this id is in the (refreshed) list; false for a null id. */
export const hasIssue = (issues: readonly Pick<Issue, "id">[] | null | undefined, id: string | null): boolean =>
  id !== null && !!issues?.some((i) => i.id === id);

export const toggleIssueId = (current: string | null, next: string): string | null => (current === next ? null : next);

export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id)) && set.size === new Set(b).size;
}

/** Worse severity first; exported for sorting groups of rows that are not issues themselves. */
export const bySeverity = (a: RuleSeverity, b: RuleSeverity): number => severityRank(a) - severityRank(b);
