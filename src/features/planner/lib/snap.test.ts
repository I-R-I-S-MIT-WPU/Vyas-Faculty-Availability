import { describe, expect, it } from "vitest";
import { effectiveStep, firstValidStart, gcd, isOnGrid, lcm, snapMinutes, validStarts } from "./snap";

const term = (over: Partial<{ day_start_min: number; day_end_min: number; grid_minutes: number }> = {}) => ({
  day_start_min: 510,
  day_end_min: 1065,
  grid_minutes: 15,
  ...over,
});

describe("gcd / lcm", () => {
  it("computes basics", () => {
    expect(gcd(15, 20)).toBe(5);
    expect(lcm(15, 20)).toBe(60);
    expect(lcm(15, 30)).toBe(30);
    expect(lcm(15, 0)).toBe(0);
  });
});

describe("effectiveStep", () => {
  it("is 15 for a 15-minute grid", () => expect(effectiveStep(term())).toBe(15));
  it("is 30 for a 30-minute grid", () => expect(effectiveStep(term({ grid_minutes: 30 }))).toBe(30));
  it("is lcm for awkward grids", () => {
    expect(effectiveStep(term({ grid_minutes: 20 }))).toBe(60);
    expect(effectiveStep(term({ grid_minutes: 5 }))).toBe(15);
    expect(effectiveStep(term({ grid_minutes: 45 }))).toBe(45);
  });
  it("falls back to 15 for a nonsense grid", () => expect(effectiveStep(term({ grid_minutes: 0 }))).toBe(15));
});

describe("snapMinutes", () => {
  it("snaps to the nearest 15 from day_start 510", () => {
    expect(snapMinutes(510, term())).toBe(510);
    expect(snapMinutes(516, term())).toBe(510);
    expect(snapMinutes(518, term())).toBe(525);
    expect(snapMinutes(525, term())).toBe(525);
  });

  it("rounds an exact tie up", () => {
    expect(snapMinutes(517.5, term())).toBe(525);
  });

  it("uses a 30-minute step measured from day_start 510", () => {
    const t = term({ grid_minutes: 30 });
    expect(snapMinutes(520, t)).toBe(510);
    expect(snapMinutes(526, t)).toBe(540);
    expect(snapMinutes(570, t)).toBe(570);
    // 555 is a multiple of 15 but not on the 30-minute grid from 510
    expect(snapMinutes(555, t)).toBe(570);
  });

  it("measures from an off-hour day start", () => {
    const t = term({ day_start_min: 495, grid_minutes: 30 });
    expect(snapMinutes(500, t)).toBe(495);
    expect(snapMinutes(520, t)).toBe(525);
  });

  it("clamps to the day start", () => {
    expect(snapMinutes(0, term())).toBe(510);
    expect(snapMinutes(-100, term())).toBe(510);
  });

  it("clamps so the session ends inside the day", () => {
    // 1065 - 120 = 945 is on the grid
    expect(snapMinutes(2000, term(), 120)).toBe(945);
    expect(snapMinutes(960, term(), 120)).toBe(945);
    // no duration: last start is the day end itself when on grid
    expect(snapMinutes(2000, term())).toBe(1065);
  });

  it("keeps the upper bound on-grid when the end bound is not", () => {
    // 1065 - 100 = 965 is off-grid; last valid start is 960
    expect(snapMinutes(2000, term(), 100)).toBe(960);
    const t = term({ grid_minutes: 30 });
    // 1065 - 60 = 1005; on the 30 grid from 510 the last start is 990
    expect(snapMinutes(2000, t, 60)).toBe(990);
  });

  it("returns day_start when the session is longer than the day", () => {
    expect(snapMinutes(700, term(), 9999)).toBe(510);
  });

  it("never returns -0", () => {
    expect(Object.is(snapMinutes(-50, term({ day_start_min: 0 })), 0)).toBe(true);
  });
});

describe("isOnGrid", () => {
  it("accepts grid starts and rejects off-grid ones (15-minute grid)", () => {
    expect(isOnGrid(510, term())).toBe(true);
    expect(isOnGrid(525, term())).toBe(true);
    expect(isOnGrid(520, term())).toBe(false);
    expect(isOnGrid(525.5, term())).toBe(false);
  });

  it("honours the 30-minute grid from day_start 510", () => {
    const t = term({ grid_minutes: 30 });
    expect(isOnGrid(540, t)).toBe(true);
    expect(isOnGrid(525, t)).toBe(false);
  });

  it("matches snapMinutes output", () => {
    for (const grid of [15, 30, 45, 60]) {
      const t = term({ grid_minutes: grid });
      for (let v = 400; v < 1100; v += 7) expect(isOnGrid(snapMinutes(v, t, 60), t)).toBe(true);
    }
  });
});

describe("day_start that is not a multiple of 15 (server rule: start % 15 === 0 AND (start - day_start) % grid === 0)", () => {
  it("has no valid start for day_start 490 with a 15-minute grid", () => {
    const t = term({ day_start_min: 490 });
    expect(firstValidStart(t)).toBeNull();
    expect(validStarts(t)).toEqual([]);
    expect(isOnGrid(495, t)).toBe(false);
    expect(isOnGrid(490, t)).toBe(false);
    expect(snapMinutes(600, t)).toBe(490); // callers check firstValidStart first
  });

  it("has no valid start for day_start 490 with a 30-minute grid", () => {
    const t = term({ day_start_min: 490, grid_minutes: 30 });
    expect(firstValidStart(t)).toBeNull();
    expect(validStarts(t)).toEqual([]);
  });

  it("starts at 510 and steps by 60 for day_start 490 with a 20-minute grid", () => {
    const t = term({ day_start_min: 490, grid_minutes: 20 });
    expect(firstValidStart(t)).toBe(510);
    expect(effectiveStep(t)).toBe(60);
    const starts = validStarts(t);
    expect(starts.slice(0, 4)).toEqual([510, 570, 630, 690]);
    for (const s of starts) {
      expect(s % 15).toBe(0);
      expect((s - 490) % 20).toBe(0);
      expect(isOnGrid(s, t)).toBe(true);
    }
    // 525 is a multiple of 15 but 35 minutes from day start: not on the 20-minute grid
    expect(isOnGrid(525, t)).toBe(false);
  });

  it("snaps from the first valid start, never below it", () => {
    const t = term({ day_start_min: 490, grid_minutes: 20 });
    expect(snapMinutes(0, t)).toBe(510);
    expect(snapMinutes(490, t)).toBe(510);
    expect(snapMinutes(545, t)).toBe(570);
    expect(snapMinutes(539, t)).toBe(510);
    for (let v = 400; v < 1100; v += 11) expect(isOnGrid(snapMinutes(v, t, 60), t)).toBe(true);
  });

  it("clamps the upper bound onto the valid starts", () => {
    const t = term({ day_start_min: 490, grid_minutes: 20, day_end_min: 1065 });
    // 1065 - 60 = 1005 raw; valid starts are 510 + 60n -> 990
    expect(snapMinutes(5000, t, 60)).toBe(990);
  });

  it("an aligned day start keeps the old behaviour (first start = day start)", () => {
    expect(firstValidStart(term())).toBe(510);
    expect(firstValidStart(term({ grid_minutes: 30 }))).toBe(510);
    expect(firstValidStart(term({ day_start_min: 495, grid_minutes: 30 }))).toBe(495);
  });

  it("finds a later start for a 5-minute grid from 490", () => {
    const t = term({ day_start_min: 490, grid_minutes: 5 });
    expect(firstValidStart(t)).toBe(495);
    expect(validStarts(t).slice(0, 3)).toEqual([495, 510, 525]);
  });

  it("has no start when the first valid one is past the day end", () => {
    expect(firstValidStart(term({ day_start_min: 505, grid_minutes: 20, day_end_min: 509 }))).toBeNull();
  });
});
