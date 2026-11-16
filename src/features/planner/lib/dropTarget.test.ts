import { describe, expect, it } from "vitest";
import { preflightPlacement, resolveDrop, type DayColumnRect } from "./dropTarget";
import { gridHeight, pxPerMinute } from "./gridLayout";
import type { Term } from "../types";

const term = {
  day_start_min: 510,
  day_end_min: 1065,
  grid_minutes: 15,
  working_days: [0, 1, 2, 3, 4],
  breaks: [
    { start_min: 630, end_min: 645, label: "Short break 1" },
    { start_min: 765, end_min: 810, label: "Lunch" },
    { start_min: 930, end_min: 945 },
  ],
} as Term;

const H = gridHeight(term);
// Five 176px columns starting at x=100, top of the day at y=200.
const columns: DayColumnRect[] = [0, 1, 2, 3, 4].map((weekday) => ({
  weekday,
  left: 100 + weekday * 176,
  top: 200,
  width: 176,
  height: H,
  dayStart: term.day_start_min,
  pxPerMinute,
}));

const rect = (left: number, top: number, width = 150, height = 80) => ({ left, top, width, height });

describe("resolveDrop", () => {
  it("picks the column holding the horizontal centre", () => {
    // centre x = 120 + 75 = 195 -> Monday (100..276)
    expect(resolveDrop(rect(120, 200), columns, 60, term)?.weekday).toBe(0);
    // centre x = 280 + 20 = 300 -> Tuesday
    expect(resolveDrop(rect(280, 200, 40), columns, 60, term)?.weekday).toBe(1);
  });

  it("uses the centre, not the left edge, when the card straddles two columns", () => {
    // left edge in Monday, but centre (260 + 75 = 335) in Tuesday (276..452)
    expect(resolveDrop(rect(260, 300), columns, 60, term)?.weekday).toBe(1);
    // centre (200 + 50 = 250) still in Monday
    expect(resolveDrop(rect(200, 300, 100), columns, 60, term)?.weekday).toBe(0);
  });

  it("treats the right edge of a column as the next column", () => {
    // centre exactly at x = 276
    expect(resolveDrop(rect(276 - 75, 300), columns, 60, term)?.weekday).toBe(1);
  });

  it("returns null when no column contains the centre", () => {
    expect(resolveDrop(rect(0, 300, 50), columns, 60, term)).toBeNull(); // left of the grid
    expect(resolveDrop(rect(1200, 300), columns, 60, term)).toBeNull(); // right of the grid (100 + 880 = 980)
    expect(resolveDrop(rect(0, 300), [], 60, term)).toBeNull();
  });

  it("returns null when the vertical centre is outside the column body", () => {
    expect(resolveDrop(rect(120, 20), columns, 60, term)).toBeNull(); // far above
    expect(resolveDrop(rect(120, 200 + H + 100), columns, 60, term)).toBeNull(); // far below
  });

  it("maps the rect top to minutes: top of the column is the day start", () => {
    expect(resolveDrop(rect(120, 200), columns, 60, term)).toEqual({ weekday: 0, start_min: 510 });
  });

  it("snaps to the nearest 15-minute step (20px = 15 min)", () => {
    // +30px = 22.5 min -> 532.5 -> nearest step 525 (exact tie rounds up in snap: 22.5/15 = 1.5 -> 2 -> 540)
    expect(resolveDrop(rect(120, 230), columns, 60, term)?.start_min).toBe(540);
    // +29px = 21.75 min -> rounds to 525
    expect(resolveDrop(rect(120, 229), columns, 60, term)?.start_min).toBe(525);
    // +100px = 75 min -> 585 (09:45)
    expect(resolveDrop(rect(120, 300), columns, 60, term)?.start_min).toBe(585);
  });

  it("clamps so the session still ends inside the day", () => {
    // dropped at the very bottom with a 120 minute lab: latest start is 1065 - 120 = 945
    expect(resolveDrop(rect(120, 200 + H - 30, 150, 20), columns, 120, term)?.start_min).toBe(945);
    // a tall card whose centre has fallen below the grid is not a drop at all
    expect(resolveDrop(rect(120, 200 + H - 10), columns, 120, term)).toBeNull();
  });

  it("clamps a rect that starts above the column to the day start", () => {
    // top 30px above the column but the centre (top + 40) is inside it
    expect(resolveDrop(rect(120, 170), columns, 60, term)).toEqual({ weekday: 0, start_min: 510 });
  });

  it("respects a 30-minute term grid", () => {
    const t30 = { ...term, grid_minutes: 30 } as Term;
    // lcm(15, 30) = 30. +20px = 15 min from 510 -> tie rounds up to 540
    expect(resolveDrop(rect(120, 220), columns, 60, t30)?.start_min).toBe(540);
    // +10px = 7.5 min -> 510
    expect(resolveDrop(rect(120, 210), columns, 60, t30)?.start_min).toBe(510);
    // +100px = 75 min -> 585 is off the 30 grid; 75/30 = 2.5 -> 3 -> 600
    expect(resolveDrop(rect(120, 300), columns, 60, t30)?.start_min).toBe(600);
  });

  it("honours a column's own scale and day start", () => {
    const cols: DayColumnRect[] = [
      { weekday: 2, left: 0, top: 0, width: 100, height: 1000, dayStart: 480, pxPerMinute: 2 },
    ];
    const t = { day_start_min: 480, day_end_min: 1080, grid_minutes: 15 };
    // 120px / 2 = 60 min -> 540
    expect(resolveDrop({ left: 10, top: 120, width: 50, height: 40 }, cols, 60, t)).toEqual({ weekday: 2, start_min: 540 });
  });

  it("ignores zero-width columns and bad scales", () => {
    const cols: DayColumnRect[] = [{ ...columns[0], width: 0 }, { ...columns[1], pxPerMinute: 0 }];
    expect(resolveDrop(rect(120, 300), cols, 60, term)).toBeNull();
    expect(resolveDrop(rect(300, 300), cols, 60, term)).toBeNull();
  });
});

describe("preflightPlacement", () => {
  it("accepts a normal slot", () => {
    expect(preflightPlacement(term, 0, 570, 60)).toBeNull();
  });

  it("allows back-to-back with a break (half-open) and ending exactly at day end", () => {
    expect(preflightPlacement(term, 0, 570, 60)).toBeNull(); // ends 630, break starts 630
    expect(preflightPlacement(term, 0, 645, 60)).toBeNull(); // starts when break ends
    expect(preflightPlacement(term, 4, 1005, 60)).toBeNull(); // ends 1065
  });

  it("refuses a non-working day", () => {
    expect(preflightPlacement(term, 5, 570, 60)).toMatch(/Saturday is not a working day/);
  });

  it("refuses overlap with a break and names it", () => {
    expect(preflightPlacement(term, 0, 600, 60)).toMatch(/overlaps Short break 1/);
    expect(preflightPlacement(term, 0, 720, 120)).toMatch(/overlaps Lunch/);
    expect(preflightPlacement(term, 0, 915, 60)).toMatch(/overlaps a break/); // unlabeled break
  });

  it("refuses outside teaching hours", () => {
    expect(preflightPlacement(term, 0, 1020, 60)).toMatch(/outside teaching hours/);
    expect(preflightPlacement(term, 0, 480, 60)).toMatch(/outside teaching hours/);
  });

  it("refuses off-grid starts", () => {
    expect(preflightPlacement(term, 0, 575, 60)).toMatch(/time grid/);
    const t30 = { ...term, grid_minutes: 30 } as Term;
    expect(preflightPlacement(t30, 0, 525, 60)).toMatch(/time grid/);
    expect(preflightPlacement(t30, 0, 540, 60)).toBeNull();
  });
});

describe("a day start that is not a multiple of 15", () => {
  it("returns null for day_start 490 with a 15- or 30-minute grid (no valid start exists)", () => {
    for (const grid_minutes of [15, 30]) {
      const t = { ...term, day_start_min: 490, grid_minutes } as Term;
      expect(resolveDrop(rect(120, 300), columns.map((c) => ({ ...c, dayStart: 490 })), 60, t)).toBeNull();
    }
  });

  it("snaps to starts that satisfy both rules for day_start 490 with a 20-minute grid", () => {
    const t = { ...term, day_start_min: 490, grid_minutes: 20 } as Term;
    const cols = columns.map((c) => ({ ...c, dayStart: 490 }));
    for (let top = 190; top < 600; top += 13) {
      const hit = resolveDrop(rect(120, top, 150, 80), cols, 60, t);
      if (!hit) continue;
      expect(hit.start_min % 15).toBe(0);
      expect((hit.start_min - 490) % 20).toBe(0);
      expect(preflightPlacement(t, hit.weekday, hit.start_min, 60)?.includes("time grid") ?? false).toBe(false);
    }
  });

  it("preflight refuses 15-aligned but off-grid starts", () => {
    const t = { ...term, day_start_min: 490, grid_minutes: 20 } as Term;
    expect(preflightPlacement(t, 0, 525, 60)).toMatch(/time grid/);
  });
});
