import { describe, expect, it } from "vitest";
import type { Issue } from "../types";
import { sampleDiagnostics, sampleDiagnosticsBlocking, sampleDiagnosticsClean } from "../components/editor/fixtures/samplePhase3";
import {
  defaultPanelOpen,
  diagnosticsBehind,
  hasIssue,
  diagnosticsSummary,
  filterIssues,
  groupBySeverity,
  issueWord,
  pickIssueSelection,
  plural,
  sameIds,
  sessionIssueCounts,
  toggleIssueId,
} from "./editorHighlights";

const issue = (over: Partial<Issue> & { id: string }): Issue => ({
  rule_key: "time_of_day",
  severity: "soft",
  message: "m",
  session_ids: [],
  division_id: "div-a",
  faculty_id: null,
  weekday: null,
  ...over,
});

describe("plural", () => {
  it("pluralises", () => {
    expect(plural(1, "issue")).toBe("1 issue");
    expect(plural(0, "issue")).toBe("0 issues");
    expect(plural(2, "hard issue")).toBe("2 hard issues");
    expect(plural(2, "match", "matches")).toBe("2 matches");
  });
});

describe("filterIssues", () => {
  const all = sampleDiagnostics.issues;
  it("all / hard / soft", () => {
    expect(filterIssues(all, { severity: "all", divisionId: null })).toHaveLength(3);
    expect(filterIssues(all, { severity: "hard", divisionId: null }).map((i) => i.severity)).toEqual(["hard"]);
    expect(filterIssues(all, { severity: "soft", divisionId: null })).toHaveLength(2);
  });
  it("hard includes blocking", () => {
    expect(filterIssues(sampleDiagnosticsBlocking.issues, { severity: "hard", divisionId: null })).toHaveLength(1);
    expect(filterIssues(sampleDiagnosticsBlocking.issues, { severity: "soft", divisionId: null })).toHaveLength(0);
  });
  it("scopes to a division but keeps issues without a division", () => {
    const list = [issue({ id: "a", division_id: "div-a" }), issue({ id: "b", division_id: "div-b" }), issue({ id: "c", division_id: null })];
    expect(filterIssues(list, { severity: "all", divisionId: "div-a" }).map((i) => i.id)).toEqual(["a", "c"]);
    expect(filterIssues(list, { severity: "all", divisionId: null })).toHaveLength(3);
  });
  it("does not mutate", () => {
    const copy = [...all];
    filterIssues(all, { severity: "soft", divisionId: "x" });
    expect(all).toEqual(copy);
  });
});

describe("groupBySeverity", () => {
  it("orders blocking, hard, soft and drops empty groups", () => {
    const list = [issue({ id: "1", severity: "soft" }), issue({ id: "2", severity: "blocking" }), issue({ id: "3", severity: "soft" })];
    const groups = groupBySeverity(list);
    expect(groups.map((g) => g.severity)).toEqual(["blocking", "soft"]);
    expect(groups[1].issues.map((i) => i.id)).toEqual(["1", "3"]);
    expect(groupBySeverity([])).toEqual([]);
  });
});

describe("diagnosticsSummary", () => {
  it("not ready with hard issues", () => {
    const s = diagnosticsSummary(sampleDiagnostics);
    expect(s).toMatchObject({ ready: false, pending: false, hard: 1, soft: 2, notReadyText: "Not ready: 1 hard issue", warningsText: "2 warnings" });
  });
  it("blocking counts as hard", () => {
    expect(diagnosticsSummary(sampleDiagnosticsBlocking)).toMatchObject({ ready: false, hard: 1, notReadyText: "Not ready: 1 hard issue" });
  });
  it("ready when clean", () => {
    expect(diagnosticsSummary(sampleDiagnosticsClean)).toMatchObject({ ready: true, hard: 0, soft: 0, readyText: "Ready to publish", warningsText: "0 warnings" });
  });
  it("warnings only is still ready", () => {
    expect(diagnosticsSummary({ counts: { blocking: 0, hard: 0, soft: 3 }, publishable: true }).ready).toBe(true);
  });
  it("falls back to the counts when publishable is absent", () => {
    expect(diagnosticsSummary({ counts: { blocking: 0, hard: 2, soft: 0 } }).ready).toBe(false);
    expect(diagnosticsSummary({ counts: { blocking: 0, hard: 0, soft: 0 } }).ready).toBe(true);
  });
  it("no answer yet is pending and not ready", () => {
    expect(diagnosticsSummary(null)).toMatchObject({ pending: true, ready: false, hard: 0 });
    expect(diagnosticsSummary(undefined).pending).toBe(true);
  });
});

describe("defaultPanelOpen", () => {
  it("opens for hard or blocking, not for soft only or clean", () => {
    expect(defaultPanelOpen(sampleDiagnostics)).toBe(true);
    expect(defaultPanelOpen(sampleDiagnosticsBlocking)).toBe(true);
    expect(defaultPanelOpen(sampleDiagnosticsClean)).toBe(false);
    expect(defaultPanelOpen({ counts: { blocking: 0, hard: 0, soft: 4 } })).toBe(false);
    expect(defaultPanelOpen(null)).toBe(false);
  });
});

describe("hasIssue", () => {
  it("is true only while the id is in the refreshed list", () => {
    const issues = [{ id: "a" }, { id: "b" }];
    expect(hasIssue(issues, "a")).toBe(true);
    expect(hasIssue(issues, "gone")).toBe(false);
    expect(hasIssue([], "a")).toBe(false);
    expect(hasIssue(undefined, "a")).toBe(false);
    expect(hasIssue(issues, null)).toBe(false);
  });
});

describe("diagnosticsBehind", () => {
  it("is true only when diagnostics are older than the snapshot", () => {
    expect(diagnosticsBehind(11, 12)).toBe(true);
    expect(diagnosticsBehind(12, 12)).toBe(false);
    expect(diagnosticsBehind(13, 12)).toBe(false);
    expect(diagnosticsBehind(undefined, 12)).toBe(false);
    expect(diagnosticsBehind(12, null)).toBe(false);
  });
});

describe("issueWord", () => {
  it("words per severity and count", () => {
    expect(issueWord("blocking")).toBe("blocking issue");
    expect(issueWord("blocking", 2)).toBe("blocking issues");
    expect(issueWord("hard", 1)).toBe("rule violation");
    expect(issueWord("hard", 3)).toBe("rule violations");
    expect(issueWord("soft", 1)).toBe("warning");
    expect(issueWord("soft", 2)).toBe("warnings");
  });
});

describe("sessionIssueCounts", () => {
  it("counts each issue once per session", () => {
    const m = sessionIssueCounts([
      issue({ id: "1", session_ids: ["a", "b", "a"] }),
      issue({ id: "2", session_ids: ["a"] }),
      issue({ id: "3", session_ids: [] }),
    ]);
    expect(m.get("a")).toBe(2);
    expect(m.get("b")).toBe(1);
    expect(m.size).toBe(2);
  });
});

describe("pickIssueSelection", () => {
  const existing = new Map([["s1", 1], ["s2", 1], ["s3", 1]]);
  const divisionOf = (id: string) => ({ s1: "div-b", s2: "div-a", s3: "div-a" })[id];
  it("prefers the first session of the issue's division and highlights every existing one", () => {
    const r = pickIssueSelection({ session_ids: ["s1", "s2", "s3"], division_id: "div-a" }, existing, divisionOf);
    expect(r).toEqual({ selectId: "s2", highlightIds: ["s1", "s2", "s3"] });
  });
  it("falls back to the first existing session", () => {
    expect(pickIssueSelection({ session_ids: ["gone", "s1"], division_id: "div-z" }, existing, divisionOf)).toEqual({ selectId: "s1", highlightIds: ["s1"] });
    expect(pickIssueSelection({ session_ids: ["s1", "s2"], division_id: null }, existing, divisionOf).selectId).toBe("s1");
  });
  it("for an issue without a division prefers the current division", () => {
    const issueNoDiv = { session_ids: ["s1", "s2"], division_id: null };
    expect(pickIssueSelection(issueNoDiv, existing, divisionOf, "div-a").selectId).toBe("s2");
    expect(pickIssueSelection(issueNoDiv, existing, divisionOf, "div-b").selectId).toBe("s1");
    expect(pickIssueSelection(issueNoDiv, existing, divisionOf, "div-z").selectId).toBe("s1");
  });
  it("selects nothing when no session exists any more, and dedupes", () => {
    expect(pickIssueSelection({ session_ids: ["x", "y"], division_id: "div-a" }, existing, divisionOf)).toEqual({ selectId: null, highlightIds: [] });
    expect(pickIssueSelection({ session_ids: ["s2", "s2"], division_id: "div-a" }, new Set(["s2"]), divisionOf).highlightIds).toEqual(["s2"]);
  });
});

describe("toggleIssueId / sameIds", () => {
  it("click again clears", () => {
    expect(toggleIssueId(null, "a")).toBe("a");
    expect(toggleIssueId("a", "a")).toBeNull();
    expect(toggleIssueId("a", "b")).toBe("b");
  });
  it("compares as sets", () => {
    expect(sameIds(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameIds(["a"], ["a", "b"])).toBe(false);
    expect(sameIds([], [])).toBe(true);
    expect(sameIds(["a", "a"], ["a", "b"])).toBe(false);
  });
});
