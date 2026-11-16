import { describe, expect, it } from "vitest";
import type { PlannerSession } from "../types";
import { sampleSessions, sampleTerm } from "../components/editor/fixtures/sampleSnapshot";
import { breakBands, gridHeight, layoutDay, minToY, pxPerMinute, workingDayColumns, yToMin } from "./gridLayout";

const term = sampleTerm;

let n = 0;
const sess = (start: number, end: number, batch = "ALL", over: Partial<PlannerSession> = {}): PlannerSession => ({
  id: `s${++n}`,
  offering_id: "o",
  batch_id: `b-${batch}`,
  seq: 1,
  weekday: 0,
  start_min: start,
  end_min: end,
  room_id: "r",
  locked: false,
  subject_code: "X",
  subject_name: "X",
  kind: "theory",
  duration_min: end - start,
  batch_name: batch,
  faculty: [],
  ...over,
});

describe("scale", () => {
  it("is 20px per 15 minutes", () => {
    expect(pxPerMinute).toBeCloseTo(20 / 15);
    expect(minToY(525, term)).toBe(20);
    expect(minToY(510, term)).toBe(0);
  });

  it("round-trips y and minutes", () => {
    for (const m of [510, 525, 600, 1065]) expect(yToMin(minToY(m, term), term)).toBeCloseTo(m, 9);
    expect(yToMin(20, term)).toBe(525);
  });

  it("computes the grid height from the day length", () => {
    // 555 minutes = 37 steps of 15
    expect(gridHeight(term)).toBe(740);
  });
});

describe("breakBands", () => {
  it("lays out the three default breaks", () => {
    const bands = breakBands(term);
    expect(bands).toEqual([
      { start_min: 630, end_min: 645, label: "Short break 1", top: 160, height: 20 },
      { start_min: 765, end_min: 810, label: "Lunch", top: 340, height: 60 },
      { start_min: 930, end_min: 945, label: "Short break 2", top: 560, height: 20 },
    ]);
  });

  it("labels unlabeled breaks, sorts, and clips to the day", () => {
    const bands = breakBands({
      ...term,
      breaks: [
        { start_min: 1000, end_min: 1100 },
        { start_min: 400, end_min: 520, label: "Early" },
        { start_min: 1100, end_min: 1200, label: "After hours" },
      ],
    });
    expect(bands.map((b) => [b.label, b.start_min, b.end_min])).toEqual([
      ["Early", 510, 520],
      ["Break", 1000, 1065],
    ]);
    expect(bands[0].top).toBe(0);
  });
});

describe("workingDayColumns", () => {
  it("returns sorted labeled columns", () => {
    expect(workingDayColumns({ working_days: [0, 1, 2, 3, 4] }).map((c) => c.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(workingDayColumns({ working_days: [5, 0, 0, 2] })).toEqual([
      { weekday: 0, label: "Mon" },
      { weekday: 2, label: "Wed" },
      { weekday: 5, label: "Sat" },
    ]);
  });
});

describe("layoutDay", () => {
  it("gives a lone session the full width", () => {
    const [p] = layoutDay([sess(570, 630)], term);
    expect(p).toMatchObject({ top: 80, height: 80, lane: 0, lanes: 1 });
  });

  it("packs three parallel batch labs side by side", () => {
    const labs = ["A1", "A2", "A3"].map((b) => sess(645, 765, b, { kind: "lab" }));
    const out = layoutDay(labs, term);
    expect(out).toHaveLength(3);
    expect(out.map((p) => p.lane).sort()).toEqual([0, 1, 2]);
    expect(out.every((p) => p.lanes === 3)).toBe(true);
    expect(out.every((p) => p.height === 160)).toBe(true);
  });

  it("puts a lecture beside an overlapping lab", () => {
    const lecture = sess(570, 630, "ALL");
    const lab = sess(600, 720, "A1");
    const out = layoutDay([lab, lecture], term);
    const byId = new Map(out.map((p) => [p.session.id, p]));
    expect(byId.get(lecture.id)).toMatchObject({ lane: 0, lanes: 2 });
    expect(byId.get(lab.id)).toMatchObject({ lane: 1, lanes: 2 });
  });

  it("does not treat back-to-back sessions as overlapping", () => {
    const a = sess(570, 630);
    const b = sess(630, 690);
    const out = layoutDay([b, a], term);
    expect(out.map((p) => [p.lane, p.lanes])).toEqual([[0, 1], [0, 1]]);
  });

  it("handles unsorted input and independent clusters", () => {
    const late = sess(900, 960);
    const x = sess(570, 660, "A1");
    const y = sess(600, 700, "A2");
    const z = sess(700, 760, "A3"); // starts after both end, back-to-back with y
    const out = layoutDay([late, y, z, x], term);
    const get = (s: PlannerSession) => out.find((p) => p.session.id === s.id)!;
    expect(get(x)).toMatchObject({ lane: 0, lanes: 2 });
    expect(get(y)).toMatchObject({ lane: 1, lanes: 2 });
    expect(get(z)).toMatchObject({ lane: 0, lanes: 1 });
    expect(get(late)).toMatchObject({ lane: 0, lanes: 1 });
    // sorted by start
    expect(out.map((p) => p.session.start_min)).toEqual([570, 600, 700, 900]);
  });

  it("reuses a freed lane inside a cluster", () => {
    const long = sess(570, 750, "A1"); // lane 0 the whole time
    const s1 = sess(570, 630, "A2"); // lane 1
    const s2 = sess(630, 690, "A3"); // lane 1 again (s1 ended)
    const out = layoutDay([long, s1, s2], term);
    expect(out.every((p) => p.lanes === 2)).toBe(true);
    expect(out.find((p) => p.session.id === s2.id)!.lane).toBe(1);
  });

  it("skips unplaced sessions", () => {
    const out = layoutDay(sampleSessions.filter((s) => s.weekday === null), term);
    expect(out).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = [sess(600, 660), sess(570, 630)];
    const copy = JSON.stringify(input);
    layoutDay(input, term);
    expect(JSON.stringify(input)).toBe(copy);
  });

  it("lays out the sample Tuesday as three lanes", () => {
    const tuesday = sampleSessions.filter((s) => s.weekday === 1);
    const out = layoutDay(tuesday, term);
    expect(out).toHaveLength(3);
    expect(out.every((p) => p.lanes === 3)).toBe(true);
  });
});
