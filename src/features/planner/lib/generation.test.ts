import { describe, expect, it } from "vitest";
import type { GenerationRun, UnplacedItem } from "../types";
import {
  sampleRunFailed,
  sampleRunRunning,
  sampleRunSucceeded,
} from "../components/editor/fixtures/samplePhase3";
import {
  POLL_FAST_MS,
  POLL_SLOW_MS,
  STAGE_ORDER,
  STALL_AFTER_MS,
  canUndo,
  committedChanges,
  isActive,
  isStalled,
  latestRun,
  modeLabel,
  pollDelay,
  progressPercent,
  progressSignature,
  progressText,
  stageLabel,
  summariseUnplaced,
  undoTarget,
  unplacedReasonLabel,
} from "./generation";

const run = (over: Partial<GenerationRun>): GenerationRun => ({ ...sampleRunSucceeded, ...over });

describe("isActive", () => {
  it("is true for queued and running only", () => {
    expect(isActive(run({ status: "queued" }))).toBe(true);
    expect(isActive(sampleRunRunning)).toBe(true);
    expect(isActive(sampleRunSucceeded)).toBe(false);
    expect(isActive(sampleRunFailed)).toBe(false);
    expect(isActive(run({ status: "cancelled" }))).toBe(false);
  });
});

describe("labels", () => {
  it("names every stage", () => {
    for (const s of STAGE_ORDER) expect(stageLabel(s).length).toBeGreaterThan(0);
    expect(stageLabel("labs")).toBe("Placing lab sessions");
    expect(stageLabel("nonsense")).toBe("Working");
  });
  it("names the modes", () => {
    expect(modeLabel("fill_unplaced")).toBe("Fill unplaced sessions");
    expect(modeLabel("regenerate_unlocked")).toBe("Regenerate all unlocked sessions");
    expect(modeLabel("other")).toBe("other");
  });
});

describe("progress", () => {
  it("clamps the percent and reports 100 for a succeeded run", () => {
    expect(progressPercent(run({ status: "running", progress_percent: 140 }))).toBe(100);
    expect(progressPercent(run({ status: "running", progress_percent: -3 }))).toBe(0);
    expect(progressPercent(run({ status: "running", progress_percent: 32.4 }))).toBe(32);
    expect(progressPercent(run({ status: "succeeded", progress_percent: 90 }))).toBe(100);
  });
  it("writes one line per state", () => {
    expect(progressText(run({ status: "queued", stage: "queued" }))).toBe("Waiting to start");
    expect(progressText(sampleRunRunning)).toBe("Placing lab sessions (32%)");
    expect(progressText(sampleRunSucceeded)).toBe("Placed 118 of 121 sessions, 3 could not be placed");
    expect(progressText(run({ stats: { ...sampleRunSucceeded.stats!, unplaced: 0, placed: 121 } }))).toBe("Placed 121 of 121 sessions");
    expect(progressText(run({ stats: null }))).toBe("Finished");
    expect(progressText(run({ status: "cancelled" }))).toBe("Cancelled");
    expect(progressText(sampleRunFailed)).toBe("Failed: The server restarted while the run was in progress.");
    expect(progressText(run({ status: "failed", error_message: null }))).toBe("Failed");
  });
});

describe("summariseUnplaced", () => {
  const item = (code: UnplacedItem["code"], id: string): UnplacedItem => ({
    session_id: id,
    key: id,
    division_id: "d",
    subject_code: "X",
    batch_name: "ALL",
    kind: "theory",
    code,
    text: "t",
  });
  it("groups by code, biggest first, with human labels", () => {
    const groups = summariseUnplaced([
      item("NO_ROOM", "1"),
      item("FACULTY_BUSY", "2"),
      item("NO_ROOM", "3"),
      item("TRY_LIMIT", "4"),
    ]);
    expect(groups.map((g) => [g.code, g.count])).toEqual([
      ["NO_ROOM", 2],
      ["FACULTY_BUSY", 1],
      ["TRY_LIMIT", 1],
    ]);
    expect(groups[0].label).toBe("No suitable room free");
    expect(groups[0].items.map((i) => i.session_id)).toEqual(["1", "3"]);
  });
  it("handles empty input and unknown codes", () => {
    expect(summariseUnplaced([])).toEqual([]);
    expect(summariseUnplaced(null)).toEqual([]);
    const g = summariseUnplaced([item("NEW_CODE" as UnplacedItem["code"], "1")]);
    expect(g[0].label).toBe("Other reason");
    expect(unplacedReasonLabel("LOCKED")).toBe("Session is locked");
  });
  it("summarises the sample run", () => {
    expect(summariseUnplaced(sampleRunSucceeded.unplaced).map((g) => g.code).sort()).toEqual([
      "FACULTY_BUSY",
      "NO_ROOM",
      "SERVER_REFUSED",
    ]);
  });
});

describe("latestRun", () => {
  it("finds the newest run", () => {
    const older = run({ id: "old", created_at: "2026-11-16T08:00:00Z" });
    const newer = run({ id: "new", created_at: "2026-11-16T09:00:00Z" });
    expect(latestRun([older, newer])?.id).toBe("new");
    expect(latestRun([])).toBeNull();
  });
});

describe("canUndo / undoTarget (mirrors the server)", () => {
  const older = run({ id: "old", created_at: "2026-11-16T08:00:00Z", after_rev: 5 });
  const newer = run({ id: "new", created_at: "2026-11-16T09:00:00Z", after_rev: 9 });
  const undone = (r: GenerationRun) => ({ ...r, undone_at: "2026-11-16T10:00:00Z" });

  it("targets the newest run that committed placements", () => {
    expect(undoTarget([newer, older])?.id).toBe("new");
    expect(canUndo(newer, [newer, older])).toBe(true);
    expect(canUndo(older, [newer, older])).toBe(false); // not the newest
    expect(canUndo(older, [undone(newer), older])).toBe(true);
    expect(undoTarget([])).toBeNull();
  });
  it("a failed or cancelled run that committed chunks (after_rev set) is undoable and blocks the older run", () => {
    const failedPartial = run({ id: "f", status: "failed", stage: "committing", after_rev: 11, created_at: "2026-11-16T09:30:00Z" });
    const cancelledPartial = run({ id: "c", status: "cancelled", stage: "committing", after_rev: 12, created_at: "2026-11-16T09:40:00Z" });
    expect(canUndo(failedPartial, [failedPartial, older])).toBe(true);
    expect(canUndo(older, [failedPartial, older])).toBe(false);
    expect(undoTarget([cancelledPartial, failedPartial, newer])?.id).toBe("c");
    expect(committedChanges(cancelledPartial)).toBe(true);
  });
  it("ignores no-op runs (after_rev null), whatever their status or age", () => {
    const failedNoop = run({ id: "fn", status: "failed", after_rev: null, created_at: "2026-11-16T09:30:00Z" });
    const succeededNoop = run({ id: "sn", status: "succeeded", after_rev: null, created_at: "2026-11-16T09:45:00Z" });
    expect(canUndo(failedNoop, [failedNoop])).toBe(false);
    expect(canUndo(sampleRunFailed, [sampleRunFailed])).toBe(false);
    expect(canUndo(succeededNoop, [succeededNoop, newer])).toBe(false);
    expect(canUndo(newer, [succeededNoop, failedNoop, newer, older])).toBe(true); // an older committed run stays the target
    expect(committedChanges(failedNoop)).toBe(false);
  });
  it("refuses undone, active and non-draft cases", () => {
    expect(canUndo(undone(newer), [undone(newer)])).toBe(false);
    expect(canUndo(newer, [sampleRunRunning, newer])).toBe(false);
    expect(canUndo(newer, [run({ id: "q", status: "queued", stage: "queued", after_rev: null }), newer])).toBe(false);
    expect(canUndo(newer, [newer], { isDraft: false })).toBe(false);
    expect(canUndo(newer, [newer], { isDraft: true })).toBe(true);
    expect(undoTarget([newer], { isDraft: false })).toBeNull();
  });
  it("breaks a created_at tie like the server (lower id first)", () => {
    const a = run({ id: "a", created_at: "2026-11-16T09:00:00Z", after_rev: 3 });
    const b = run({ id: "b", created_at: "2026-11-16T09:00:00Z", after_rev: 4 });
    expect(undoTarget([b, a])?.id).toBe("a");
  });
});

describe("stalled hint and polling back-off", () => {
  it("is stalled after two minutes without change", () => {
    expect(isStalled(0, STALL_AFTER_MS - 1)).toBe(false);
    expect(isStalled(0, STALL_AFTER_MS)).toBe(true);
    expect(isStalled(1_000, 1_000 + 30_000)).toBe(false);
  });
  it("polls every second, then every 5 s after a minute without change", () => {
    expect(pollDelay(0, 0)).toBe(POLL_FAST_MS);
    expect(pollDelay(0, 60_000)).toBe(POLL_FAST_MS);
    expect(pollDelay(0, 60_001)).toBe(POLL_SLOW_MS);
  });
  it("the progress signature changes with stage, percent and status only", () => {
    const base = run({ status: "running", stage: "labs", progress_percent: 10 });
    const unrelated: GenerationRun = { ...base, started_at: "x", stats: null };
    expect(progressSignature(base)).toBe(progressSignature(unrelated));
    expect(progressSignature(base)).not.toBe(progressSignature({ ...base, progress_percent: 11 }));
    expect(progressSignature(base)).not.toBe(progressSignature({ ...base, stage: "theory" }));
    expect(progressSignature(base)).not.toBe(progressSignature({ ...base, status: "failed" }));
  });
});
