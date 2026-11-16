import { describe, expect, it } from "vitest";
import type { PlannerSession } from "../types";
import {
  applyChanged,
  countByDivision,
  groupUnplacedBySubject,
  optimisticLock,
  optimisticPlace,
  optimisticUnplace,
} from "./patch";

const make = (id: string, over: Partial<PlannerSession> = {}): PlannerSession =>
  Object.freeze({
    id,
    offering_id: "o1",
    batch_id: "b1",
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
    faculty: Object.freeze([]) as unknown as PlannerSession["faculty"],
    ...over,
  }) as PlannerSession;

const placed = { weekday: 0, start_min: 570, end_min: 630, room_id: "r1" };

describe("applyChanged", () => {
  it("replaces by id and keeps order without mutating", () => {
    const list = Object.freeze([make("a"), make("b"), make("c")]) as PlannerSession[];
    const changed = Object.freeze([make("b", placed)]) as PlannerSession[];
    const next = applyChanged(list, changed);
    expect(next.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(next[1].weekday).toBe(0);
    expect(next[0]).toBe(list[0]);
    expect(list[1].weekday).toBeNull();
    expect(next).not.toBe(list);
  });

  it("ignores unknown ids by default and appends on request", () => {
    const list = [make("a")];
    const extra = make("z", placed);
    expect(applyChanged(list, [extra]).map((s) => s.id)).toEqual(["a"]);
    expect(applyChanged(list, [extra], { append: true }).map((s) => s.id)).toEqual(["a", "z"]);
  });

  it("returns a copy for an empty change list", () => {
    const list = [make("a")];
    const next = applyChanged(list, []);
    expect(next).toEqual(list);
    expect(next).not.toBe(list);
  });
});

describe("optimistic helpers", () => {
  it("places with end = start + duration and does not mutate", () => {
    const s = make("a");
    const next = optimisticPlace(s, { weekday: 2, start_min: 645, room_id: "lab" }, 120);
    expect(next).toMatchObject({ weekday: 2, start_min: 645, end_min: 765, room_id: "lab" });
    expect(s.weekday).toBeNull();
    expect(next).not.toBe(s);
  });

  it("keeps the current room when none is given, and honours an explicit null", () => {
    const s = make("a", placed);
    expect(optimisticPlace(s, { weekday: 1, start_min: 600 }, 60).room_id).toBe("r1");
    expect(optimisticPlace(s, { weekday: 1, start_min: 600, room_id: null }, 60).room_id).toBeNull();
  });

  it("unplaces", () => {
    const s = make("a", placed);
    const next = optimisticUnplace(s);
    expect(next).toMatchObject({ weekday: null, start_min: null, end_min: null, room_id: null });
    expect(s.weekday).toBe(0);
  });

  it("locks and unlocks", () => {
    const s = make("a");
    expect(optimisticLock(s, true).locked).toBe(true);
    expect(s.locked).toBe(false);
    expect(optimisticLock(optimisticLock(s, true), false).locked).toBe(false);
  });
});

describe("countByDivision", () => {
  const sessions = [
    make("a", { ...placed, batch_id: "b1" }),
    make("b", { batch_id: "b1" }),
    make("c", { batch_id: "b2" }),
    make("d", { ...placed, batch_id: "b3" }),
    make("e", { batch_id: "ghost" }),
  ];

  it("counts per division from a record or a map", () => {
    const expected = {
      d1: { placed: 1, unplaced: 2, total: 3 },
      d2: { placed: 1, unplaced: 0, total: 1 },
    };
    expect(countByDivision(sessions, { b1: "d1", b2: "d1", b3: "d2" })).toEqual(expected);
    expect(countByDivision(sessions, new Map([["b1", "d1"], ["b2", "d1"], ["b3", "d2"]]))).toEqual(expected);
  });
});

describe("groupUnplacedBySubject", () => {
  it("groups unplaced sessions, sorted by subject then batch then seq", () => {
    const input = Object.freeze([
      make("1", { subject_code: "OS", batch_name: "B", seq: 2 }),
      make("2", { subject_code: "DSA", subject_name: "Data Structures", batch_name: "ALL" }),
      make("3", { subject_code: "OS", batch_name: "A", seq: 1 }),
      make("4", { subject_code: "OS", batch_name: "B", seq: 1 }),
      make("5", { subject_code: "OS", ...placed }),
      make("6", { subject_code: "DSAL", kind: "lab", batch_name: "A10" }),
      make("7", { subject_code: "DSAL", kind: "lab", batch_name: "A2" }),
    ]) as PlannerSession[];
    const groups = groupUnplacedBySubject(input);
    expect(groups.map((g) => [g.subject_code, g.remaining])).toEqual([["DSA", 1], ["DSAL", 2], ["OS", 3]]);
    expect(groups[1].kind).toBe("lab");
    expect(groups[1].items.map((s) => s.batch_name)).toEqual(["A2", "A10"]); // natural order
    expect(groups[2].items.map((s) => s.id)).toEqual(["3", "4", "1"]);
    expect(input.map((s) => s.id)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("returns an empty list when everything is placed", () => {
    expect(groupUnplacedBySubject([make("a", placed)])).toEqual([]);
  });
});
