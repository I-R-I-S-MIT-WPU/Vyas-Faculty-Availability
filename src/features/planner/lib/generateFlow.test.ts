import { describe, expect, it } from "vitest";
import { sampleRunFailed, sampleRunSucceeded } from "../components/editor/fixtures/samplePhase3";
import {
  buildGenerateRequest,
  clampSeeds,
  divisionLabel,
  finishedToast,
  formatDuration,
  generationErrorText,
  PARTLY_SAVED,
  cancelNote,
  needsConfirm,
  quickActions,
  runSummary,
  scopeSummary,
  toggleId,
  undoCounts,
  undoToast,
  unplacedPreview,
} from "./generateFlow";

describe("clampSeeds", () => {
  it("clamps to 1..5 and defaults to 3", () => {
    expect(clampSeeds(0)).toBe(1);
    expect(clampSeeds(9)).toBe(5);
    expect(clampSeeds(2.6)).toBe(3);
    expect(clampSeeds("4")).toBe(4);
    expect(clampSeeds("")).toBe(3);
    expect(clampSeeds("abc")).toBe(3);
    expect(clampSeeds(undefined)).toBe(3);
    expect(clampSeeds(null)).toBe(3);
  });
});

describe("buildGenerateRequest", () => {
  it("omits division_ids when the scope is empty (all divisions) and never confirms a fill", () => {
    expect(buildGenerateRequest({ mode: "fill_unplaced", divisionIds: [], confirmed: true })).toEqual({ mode: "fill_unplaced", seeds: 3 });
  });
  it("sends the scope, de-duplicated", () => {
    expect(buildGenerateRequest({ mode: "fill_unplaced", divisionIds: ["a", "b", "a"], seeds: 5 })).toEqual({
      mode: "fill_unplaced",
      seeds: 5,
      division_ids: ["a", "b"],
    });
  });
  it("sends confirm only for a confirmed regenerate", () => {
    expect(buildGenerateRequest({ mode: "regenerate_unlocked" }).confirm).toBeUndefined();
    expect(buildGenerateRequest({ mode: "regenerate_unlocked", confirmed: true }).confirm).toBe(true);
    expect(needsConfirm("regenerate_unlocked")).toBe(true);
    expect(needsConfirm("fill_unplaced")).toBe(false);
  });
});

describe("quickActions", () => {
  it("offers three actions for a division, regenerate needing confirmation", () => {
    const a = quickActions("div-a", "CSE-A");
    expect(a.map((x) => x.id)).toEqual(["fill_division", "fill_all", "regenerate_division"]);
    expect(a[0].label).toBe("Fill unplaced in CSE-A");
    expect(a[0].request).toEqual({ mode: "fill_unplaced", divisionIds: ["div-a"] });
    expect(a[1].request.divisionIds).toEqual([]);
    expect(a[2].confirm).toBe(true);
    expect(a[2].request.mode).toBe("regenerate_unlocked");
    expect(a.filter((x) => x.confirm)).toHaveLength(1);
  });
  it("falls back to generic wording without a name, and to one action without a division", () => {
    expect(quickActions("d")[0].label).toBe("Fill unplaced in this division");
    expect(quickActions("d")[2].label).toBe("Regenerate this division (unlocked)");
    expect(quickActions(null).map((x) => x.id)).toEqual(["fill_all"]);
  });
});

describe("generationErrorText", () => {
  it("explains each start error and points NOT_READY at the right place", () => {
    expect(generationErrorText("NOT_READY", "x", "setup")).toMatch(/readiness report above/);
    expect(generationErrorText("NOT_READY", "x", "editor")).toMatch(/Term setup/);
    expect(generationErrorText("GENERATION_RUNNING", "x")).toMatch(/already running/);
    expect(generationErrorText("CONFIRM_REQUIRED", "x")).toMatch(/confirmation/);
    expect(generationErrorText("NOT_DRAFT", "x")).toMatch(/draft/);
  });
  it("uses the fallback for other codes", () => {
    expect(generationErrorText("INTERNAL_ERROR", "Boom")).toBe("Boom");
    expect(generationErrorText(undefined, "")).toBe("Could not start the generation.");
  });
});

describe("formatDuration", () => {
  it("formats ms, seconds and minutes", () => {
    expect(formatDuration(850)).toBe("850 ms");
    expect(formatDuration(3200)).toBe("3.2 s");
    expect(formatDuration(25_400)).toBe("25 s");
    expect(formatDuration(65_000)).toBe("1 min 5 s");
    expect(formatDuration(120_000)).toBe("2 min");
    expect(formatDuration(null)).toBe("-");
    expect(formatDuration(-1)).toBe("-");
  });
});

describe("scope helpers", () => {
  const divs = [
    { id: "a", semester: 3, name: "A" },
    { id: "b", semester: 3, name: "B" },
  ];
  it("summarises the scope", () => {
    expect(scopeSummary([], divs)).toBe("All divisions");
    expect(scopeSummary(["a"], divs)).toBe("Sem 3 - A");
    expect(scopeSummary(["a", "b"], divs)).toBe("2 divisions");
    expect(scopeSummary(["zzz"], divs)).toBe("1 division");
    expect(divisionLabel(divs[1])).toBe("Sem 3 - B");
  });
  it("toggles ids without mutating", () => {
    const ids = ["a"];
    expect(toggleId(ids, "b")).toEqual(["a", "b"]);
    expect(toggleId(ids, "a")).toEqual([]);
    expect(ids).toEqual(["a"]);
  });
});

describe("runSummary", () => {
  it("is null without stats and maps the numbers otherwise", () => {
    expect(runSummary(sampleRunFailed)).toBeNull();
    const s = runSummary(sampleRunSucceeded)!;
    expect(s).toMatchObject({ requested: 121, placed: 118, unplaced: 3, seedsTried: 3, bestSeed: 7, duration: "4.2 s", repairMoves: 12 });
    expect(s.lab).toEqual({ placed: 40, total: 40 });
    expect(s.theory).toEqual({ placed: 78, total: 81 });
  });
});

describe("finishedToast", () => {
  it("reports a succeeded run with undo", () => {
    const t = finishedToast(sampleRunSucceeded);
    expect(t.title).toMatch(/some sessions left/);
    expect(t.description).toBe("Placed 118 of 121 sessions, 3 could not be placed (4.2 s).");
    expect(t.undoable).toBe(true);
    expect(t.destructive).toBeUndefined();
  });
  it("is plain and not undoable when nothing was placed", () => {
    const run = {
      ...sampleRunSucceeded,
      after_rev: null,
      stats: { ...sampleRunSucceeded.stats!, placed: 0, unplaced: 0, requested: 0 },
    };
    expect(finishedToast(run).title).toBe("Timetable generated");
    expect(finishedToast(run).undoable).toBe(false);
  });
  it("flags a failed run and mentions a cancelled one", () => {
    const f = finishedToast(sampleRunFailed);
    expect(f.destructive).toBe(true);
    expect(f.description).toMatch(/server restarted/);
    expect(finishedToast({ ...sampleRunSucceeded, status: "cancelled" }).title).toBe("Generation cancelled");
  });
  it("a cancelled or failed run that saved chunks says so and offers Undo", () => {
    const cancelled = finishedToast({ ...sampleRunSucceeded, status: "cancelled", after_rev: 9 });
    expect(cancelled.description).toBe(PARTLY_SAVED);
    expect(cancelled.description).toBe("Part of the plan was already saved; you can undo it");
    expect(cancelled.undoable).toBe(true);
    const failed = finishedToast({ ...sampleRunFailed, after_rev: 9 });
    expect(failed.undoable).toBe(true);
    expect(failed.destructive).toBe(true);
    expect(failed.description).toContain(PARTLY_SAVED);
  });
  it("a cancelled or failed run that saved nothing does not offer Undo", () => {
    const cancelled = finishedToast({ ...sampleRunSucceeded, status: "cancelled", after_rev: null });
    expect(cancelled.undoable).toBeUndefined();
    expect(cancelled.description).toBe("Nothing was changed.");
    expect(finishedToast(sampleRunFailed).undoable).toBeUndefined();
  });
});

describe("undoToast and unplacedPreview", () => {
  it("mentions skipped sessions only when there are some", () => {
    expect(undoToast(1, 0)).toEqual({ title: "Generation undone: 1 session restored" });
    expect(undoToast(12, 2)).toEqual({
      title: "Generation undone: 12 sessions restored",
      description: "2 sessions you changed since were left as they are.",
    });
  });
  it("reports refused sessions separately from changed ones", () => {
    expect(undoToast(5, 0, 3)).toEqual({
      title: "Generation undone: 5 sessions restored",
      description: "3 sessions could not be restored.",
    });
    expect(undoToast(5, 1, 1).description).toBe("1 session you changed since were left as they are. 1 session could not be restored.");
  });
  it("undoCounts splits the refused sessions out of the skipped ones", () => {
    const refused = [{ session_id: "b", code: "CLASH", message: "m" }];
    expect(undoCounts({ skipped_session_ids: ["a", "b", "c"], refused })).toEqual({ changed: 2, refused: 1 });
    expect(undoCounts({ skipped_session_ids: [], refused: [] })).toEqual({ changed: 0, refused: 0 });
    expect(undoCounts({ skipped_session_ids: ["b"], refused: undefined as never })).toEqual({ changed: 1, refused: 0 });
  });
  it("cancelNote tells what cancelling keeps", () => {
    expect(cancelNote("labs")).toBe("Cancelling before the saving step changes nothing.");
    expect(cancelNote("committing")).toBe("Cancelling now keeps what was already saved; you can undo it afterwards.");
  });
  it("limits the listed unplaced items", () => {
    const { shown, hidden } = unplacedPreview(sampleRunSucceeded.unplaced, 2);
    expect(shown).toHaveLength(2);
    expect(hidden).toBe(1);
    expect(unplacedPreview([], 5)).toEqual({ shown: [], hidden: 0 });
  });
});
