import { describe, expect, it } from "vitest";
import type { Issue } from "../types";
import {
  sampleDiagnostics,
  sampleDiagnosticsBlocking,
  sampleDiagnosticsClean,
} from "../components/editor/fixtures/samplePhase3";
import {
  countIssues,
  divisionCounts,
  isPublishable,
  issueLabel,
  issuesByDivision,
  issuesBySession,
  severityRank,
  sortIssues,
  worseOf,
  worstSeverity,
  worstSeverityBySession,
} from "./diagnostics";

const issue = (over: Partial<Issue>): Issue => ({
  id: "x",
  rule_key: "all_placed",
  severity: "hard",
  message: "m",
  session_ids: [],
  division_id: "d1",
  faculty_id: null,
  weekday: null,
  ...over,
});

describe("severityRank / worseOf", () => {
  it("ranks blocking < hard < soft", () => {
    expect(severityRank("blocking")).toBeLessThan(severityRank("hard"));
    expect(severityRank("hard")).toBeLessThan(severityRank("soft"));
    expect(severityRank("weird")).toBeGreaterThan(severityRank("soft"));
  });
  it("picks the worse severity and tolerates null", () => {
    expect(worseOf("soft", "hard")).toBe("hard");
    expect(worseOf("blocking", "soft")).toBe("blocking");
    expect(worseOf(null, "soft")).toBe("soft");
    expect(worseOf(null, null)).toBeNull();
  });
});

describe("sortIssues", () => {
  it("orders by severity, then division, then weekday (none last), and does not mutate", () => {
    const input = [
      issue({ id: "a", severity: "soft", division_id: "d1", weekday: 0 }),
      issue({ id: "b", severity: "hard", division_id: "d2", weekday: 1 }),
      issue({ id: "c", severity: "hard", division_id: "d1", weekday: null }),
      issue({ id: "d", severity: "hard", division_id: "d1", weekday: 3 }),
      issue({ id: "e", severity: "blocking", division_id: "d9", weekday: 4 }),
    ];
    const copy = [...input];
    expect(sortIssues(input).map((i) => i.id)).toEqual(["e", "d", "c", "b", "a"]);
    expect(input).toEqual(copy);
  });
  it("puts issues without a division after those with one within a severity", () => {
    const out = sortIssues([issue({ id: "n", division_id: null }), issue({ id: "y", division_id: "d1" })]);
    expect(out.map((i) => i.id)).toEqual(["y", "n"]);
  });
});

describe("grouping", () => {
  const issues = [
    issue({ id: "1", session_ids: ["s1", "s2"], division_id: "d1", severity: "hard" }),
    issue({ id: "2", session_ids: ["s2"], division_id: "d1", severity: "soft" }),
    issue({ id: "3", session_ids: ["s3", "s3"], division_id: "d2", severity: "blocking" }),
    issue({ id: "4", session_ids: [], division_id: null, severity: "soft" }),
  ];
  it("issuesBySession lists an issue under each session once", () => {
    const m = issuesBySession(issues);
    expect(m.get("s1")?.map((i) => i.id)).toEqual(["1"]);
    expect(m.get("s2")?.map((i) => i.id)).toEqual(["1", "2"]);
    expect(m.get("s3")?.map((i) => i.id)).toEqual(["3"]);
    expect(m.has("s4")).toBe(false);
  });
  it("issuesByDivision skips issues without a division", () => {
    const m = issuesByDivision(issues);
    expect([...m.keys()].sort()).toEqual(["d1", "d2"]);
    expect(m.get("d1")).toHaveLength(2);
  });
  it("countIssues and divisionCounts", () => {
    expect(countIssues(issues)).toEqual({ blocking: 1, hard: 1, soft: 2, total: 4 });
    expect(countIssues([])).toEqual({ blocking: 0, hard: 0, soft: 0, total: 0 });
    const dc = divisionCounts(issues);
    expect(dc.get("d1")).toEqual({ hard: 1, soft: 1 });
    expect(dc.get("d2")).toEqual({ hard: 1, soft: 0 }); // blocking counts as hard
  });
  it("worstSeverity / worstSeverityBySession", () => {
    expect(worstSeverity(issues)).toBe("blocking");
    expect(worstSeverity([])).toBeNull();
    const m = worstSeverityBySession(issues);
    expect(m.get("s1")).toBe("hard");
    expect(m.get("s2")).toBe("hard");
    expect(m.get("s3")).toBe("blocking");
  });
});

describe("issueLabel", () => {
  it("has a friendly name for every known rule key", () => {
    expect(issueLabel("faculty_idle_gap")).toBe("Teacher idle gap");
    expect(issueLabel("room_clash")).toBe("Room double-booked");
  });
  it("humanises unknown keys", () => {
    expect(issueLabel("some_new_rule")).toBe("Some new rule");
    expect(issueLabel("")).toBe("Issue");
  });
});

describe("isPublishable", () => {
  it("is false without an answer", () => {
    expect(isPublishable(null)).toBe(false);
    expect(isPublishable(undefined)).toBe(false);
  });
  it("follows the server's flag", () => {
    expect(isPublishable(sampleDiagnosticsClean)).toBe(true);
    expect(isPublishable(sampleDiagnostics)).toBe(false);
    expect(isPublishable(sampleDiagnosticsBlocking)).toBe(false);
  });
  it("falls back to the counts when the flag is missing", () => {
    expect(isPublishable({ counts: { blocking: 0, hard: 0, soft: 4 } })).toBe(true);
    expect(isPublishable({ counts: { blocking: 0, hard: 1, soft: 0 } })).toBe(false);
  });
});

describe("fixtures", () => {
  it("sampleDiagnostics counts match its issues", () => {
    const c = countIssues(sampleDiagnostics.issues);
    expect(c).toMatchObject(sampleDiagnostics.counts);
    expect(sortIssues(sampleDiagnostics.issues).map((i) => i.id)).toEqual(sampleDiagnostics.issues.map((i) => i.id));
  });
});
