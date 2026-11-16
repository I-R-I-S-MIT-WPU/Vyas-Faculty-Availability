// Pure helpers over diagnostics issues (contract 9.3) for the editor's panels and card badges. No React.
//
// Exports:
//   severityRank(severity)                 blocking 0, hard 1, soft 2 (lower = worse)
//   worseOf(a, b)                          the more severe of two severities (either may be null)
//   sortIssues(issues)                     blocking, hard, soft; then division, weekday (none last), message, id. New array.
//   issuesBySession(issues)                Map<session_id, Issue[]> (an issue is listed under each of its sessions)
//   issuesByDivision(issues)               Map<division_id, Issue[]> (issues without a division are left out)
//   countIssues(issues)                    {blocking, hard, soft, total}
//   divisionCounts(issues)                 Map<division_id, {hard, soft}> (blocking counts as hard, like the server's by_division)
//   worstSeverity(issues)                  the worst severity present, or null
//   worstSeverityBySession(issues)         Map<session_id, severity> for card badges
//   issueLabel(rule_key)                   friendly rule name, e.g. "faculty_idle_gap" -> "Teacher idle gap"
//   isPublishable(diagnostics)             false when there is no answer yet; else the server's flag, else no blocking/hard

import type { DiagnosticsResponse, Issue, RuleSeverity } from "../types";

const RANK: Record<RuleSeverity, number> = { blocking: 0, hard: 1, soft: 2 };

export const severityRank = (severity: RuleSeverity | string): number => RANK[severity as RuleSeverity] ?? 3;

export function worseOf(a: RuleSeverity | null, b: RuleSeverity | null): RuleSeverity | null {
  if (!a) return b;
  if (!b) return a;
  return severityRank(a) <= severityRank(b) ? a : b;
}

const natural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      natural(a.division_id ?? "￿", b.division_id ?? "￿") ||
      (a.weekday ?? 99) - (b.weekday ?? 99) ||
      natural(a.message, b.message) ||
      natural(a.id, b.id),
  );
}

export function issuesBySession(issues: Issue[]): Map<string, Issue[]> {
  const map = new Map<string, Issue[]>();
  for (const issue of issues) {
    for (const sid of new Set(issue.session_ids)) {
      const list = map.get(sid);
      if (list) list.push(issue);
      else map.set(sid, [issue]);
    }
  }
  return map;
}

export function issuesByDivision(issues: Issue[]): Map<string, Issue[]> {
  const map = new Map<string, Issue[]>();
  for (const issue of issues) {
    if (!issue.division_id) continue;
    const list = map.get(issue.division_id);
    if (list) list.push(issue);
    else map.set(issue.division_id, [issue]);
  }
  return map;
}

export function countIssues(issues: Issue[]): { blocking: number; hard: number; soft: number; total: number } {
  const c = { blocking: 0, hard: 0, soft: 0, total: 0 };
  for (const i of issues) {
    if (i.severity === "blocking" || i.severity === "hard" || i.severity === "soft") c[i.severity] += 1;
    c.total += 1;
  }
  return c;
}

export function divisionCounts(issues: Issue[]): Map<string, { hard: number; soft: number }> {
  const map = new Map<string, { hard: number; soft: number }>();
  for (const i of issues) {
    if (!i.division_id) continue;
    const c = map.get(i.division_id) ?? { hard: 0, soft: 0 };
    if (i.severity === "soft") c.soft += 1;
    else c.hard += 1;
    map.set(i.division_id, c);
  }
  return map;
}

export function worstSeverity(issues: Issue[]): RuleSeverity | null {
  let worst: RuleSeverity | null = null;
  for (const i of issues) worst = worseOf(worst, i.severity);
  return worst;
}

export function worstSeverityBySession(issues: Issue[]): Map<string, RuleSeverity> {
  const map = new Map<string, RuleSeverity>();
  for (const issue of issues) {
    for (const sid of issue.session_ids) {
      const next = worseOf(map.get(sid) ?? null, issue.severity);
      if (next) map.set(sid, next);
    }
  }
  return map;
}

const RULE_LABELS: Record<string, string> = {
  faculty_clash: "Teacher double-booked",
  room_clash: "Room double-booked",
  batch_clash: "Class double-booked",
  working_hours: "Outside working hours",
  break_overlap: "Overlaps a break",
  grid: "Off the time grid",
  duration: "Wrong duration",
  room_type: "Wrong type of room",
  room_capacity: "Room too small",
  all_placed: "Session not placed",
  lab_per_day: "Too many labs in a day",
  lab_weekly: "Lab count per week",
  faculty_daily_load: "Teacher daily load",
  faculty_weekly_load: "Teacher weekly load",
  faculty_consecutive: "Teacher back-to-back hours",
  faculty_idle_gap: "Teacher idle gap",
  student_consecutive: "Class back-to-back hours",
  student_idle_gap: "Class idle gap",
  subject_spread: "Subject repeated in a day",
  room_change: "Class changes room",
  day_balance: "Uneven days",
  division_daily_hours: "Class daily hours",
  time_of_day: "Time of day",
};

/** Friendly name of a rule; an unknown key is humanised ("some_new_rule" -> "Some new rule"). */
export function issueLabel(ruleKey: string): string {
  const known = RULE_LABELS[ruleKey];
  if (known) return known;
  const text = ruleKey.replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Issue";
}

export function isPublishable(
  diagnostics: Pick<DiagnosticsResponse, "counts"> & Partial<Pick<DiagnosticsResponse, "publishable">> | null | undefined,
): boolean {
  if (!diagnostics) return false;
  if (typeof diagnostics.publishable === "boolean") return diagnostics.publishable;
  return (diagnostics.counts?.blocking ?? 0) + (diagnostics.counts?.hard ?? 0) === 0;
}
