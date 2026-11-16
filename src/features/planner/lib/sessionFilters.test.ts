import { describe, expect, it } from "vitest";
import type { PlannerOp, PlannerSession } from "../types";
import {
  applyOpsToSessions,
  batchToDivisionMap,
  groupBySemester,
  percentPlaced,
  sessionsOfDivision,
  sortDivisions,
  touchedSessionIds,
} from "./sessionFilters";

const make = (id: string, over: Partial<PlannerSession> = {}): PlannerSession =>
  Object.freeze({
    id,
    offering_id: "o1",
    batch_id: "b-a",
    seq: 1,
    weekday: null,
    start_min: null,
    end_min: null,
    room_id: null,
    locked: false,
    subject_code: "OS",
    subject_name: "Operating Systems",
    kind: "theory",
    duration_min: 60,
    batch_name: "ALL",
    faculty: Object.freeze([{ faculty_id: "f1", short_code: "SKS", full_name: "S K Sharma" }]) as unknown as PlannerSession["faculty"],
    ...over,
  }) as PlannerSession;

describe("division helpers", () => {
  const divisions = [
    { id: "d3", semester: 5, name: "B", batches: [{ id: "b-d3", division_id: "d3", name: "ALL", student_count: 1, is_whole: true }] },
    { id: "d1", semester: 3, name: "A", batches: [{ id: "b-a", division_id: "d1", name: "ALL", student_count: 1, is_whole: true }, { id: "b-a1", division_id: "d1", name: "A1", student_count: 1, is_whole: false }] },
    { id: "d2", semester: 3, name: "A10", batches: [] },
    { id: "d4", semester: 3, name: "A2", batches: [] },
  ];

  it("sorts by semester then natural name", () => {
    expect(sortDivisions(divisions).map((d) => d.id)).toEqual(["d1", "d4", "d2", "d3"]);
  });

  it("does not mutate its input", () => {
    const copy = [...divisions];
    sortDivisions(divisions);
    expect(divisions).toEqual(copy);
  });

  it("groups by semester in order", () => {
    const g = groupBySemester(divisions);
    expect(g.map((x) => x.semester)).toEqual([3, 5]);
    expect(g[0].divisions.map((d) => d.name)).toEqual(["A", "A2", "A10"]);
  });

  it("maps batches to divisions and filters sessions by division", () => {
    const map = batchToDivisionMap(divisions);
    expect(map.get("b-a1")).toBe("d1");
    const sessions = [make("s1"), make("s2", { batch_id: "b-a1" }), make("s3", { batch_id: "b-d3" }), make("s4", { batch_id: "ghost" })];
    expect(sessionsOfDivision(sessions, "d1", map).map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(sessionsOfDivision(sessions, "d3", map).map((s) => s.id)).toEqual(["s3"]);
    expect(sessionsOfDivision(sessions, "nope", map)).toEqual([]);
  });
});

describe("percentPlaced", () => {
  it("rounds to whole percents", () => {
    expect(percentPlaced(1, 3)).toBe(33);
    expect(percentPlaced(2, 3)).toBe(67);
    expect(percentPlaced(5, 5)).toBe(100);
  });
  it("is 0 for an empty division and clamps nonsense", () => {
    expect(percentPlaced(0, 0)).toBe(0);
    expect(percentPlaced(3, 0)).toBe(0);
    expect(percentPlaced(9, 3)).toBe(100);
    expect(percentPlaced(-1, 3)).toBe(0);
  });
});

describe("applyOpsToSessions", () => {
  const faculty = [
    { id: "f1", short_code: "SKS", full_name: "S K Sharma" },
    { id: "f2", short_code: "APM", full_name: "A P Mehta" },
  ];

  it("place uses the session duration and keeps the room when none is given", () => {
    const sessions = [make("s1"), make("s2", { duration_min: 120 })];
    const out = applyOpsToSessions(sessions, [{ op: "place", session_id: "s2", weekday: 1, start_min: 600 }], faculty);
    expect(out[1]).toMatchObject({ weekday: 1, start_min: 600, end_min: 720, room_id: null });
    expect(out[0]).toBe(sessions[0]);
    expect(out).not.toBe(sessions);
  });

  it("move keeps the current room unless one is given", () => {
    const placed = make("s1", { weekday: 0, start_min: 570, end_min: 630, room_id: "r1" });
    expect(applyOpsToSessions([placed], [{ op: "move", session_id: "s1", weekday: 2, start_min: 660 }])[0]).toMatchObject({ weekday: 2, start_min: 660, end_min: 720, room_id: "r1" });
    expect(applyOpsToSessions([placed], [{ op: "move", session_id: "s1", weekday: 2, start_min: 660, room_id: "r2" }])[0].room_id).toBe("r2");
  });

  it("unplace clears placement and room", () => {
    const placed = make("s1", { weekday: 0, start_min: 570, end_min: 630, room_id: "r1" });
    expect(applyOpsToSessions([placed], [{ op: "unplace", session_id: "s1" }])[0]).toMatchObject({ weekday: null, start_min: null, end_min: null, room_id: null });
  });

  it("lock, unlock and set_room", () => {
    const s = make("s1", { weekday: 0, start_min: 570, end_min: 630, room_id: "r1" });
    const locked = applyOpsToSessions([s], [{ op: "lock", session_id: "s1" }]);
    expect(locked[0].locked).toBe(true);
    expect(applyOpsToSessions(locked, [{ op: "unlock", session_id: "s1" }])[0].locked).toBe(false);
    expect(applyOpsToSessions([s], [{ op: "set_room", session_id: "s1", room_id: "r9" }])[0].room_id).toBe("r9");
  });

  it("set_faculty keeps known entries and looks up new ones", () => {
    const s = make("s1");
    const out = applyOpsToSessions([s], [{ op: "set_faculty", session_id: "s1", faculty_ids: ["f2", "f1", "zz"] }], faculty);
    expect(out[0].faculty.map((f) => f.short_code)).toEqual(["APM", "SKS", "?"]);
  });

  it("applies several ops in order and ignores unknown sessions", () => {
    const ops: PlannerOp[] = [
      { op: "place", session_id: "s1", weekday: 0, start_min: 540 },
      { op: "move", session_id: "s1", weekday: 1, start_min: 600 },
      { op: "lock", session_id: "nope" },
    ];
    const out = applyOpsToSessions([make("s1")], ops);
    expect(out[0]).toMatchObject({ weekday: 1, start_min: 600, end_min: 660 });
  });

  it("returns the same array when nothing matches", () => {
    const sessions = [make("s1")];
    expect(applyOpsToSessions(sessions, [{ op: "lock", session_id: "nope" }])).toBe(sessions);
  });

  it("never mutates frozen input", () => {
    const sessions = Object.freeze([make("s1")]) as unknown as PlannerSession[];
    expect(() => applyOpsToSessions(sessions, [{ op: "place", session_id: "s1", weekday: 0, start_min: 540 }])).not.toThrow();
  });
});

describe("touchedSessionIds", () => {
  it("dedupes", () => {
    expect(touchedSessionIds([{ op: "lock", session_id: "a" }, { op: "unlock", session_id: "a" }, { op: "lock", session_id: "b" }])).toEqual(["a", "b"]);
  });
});
