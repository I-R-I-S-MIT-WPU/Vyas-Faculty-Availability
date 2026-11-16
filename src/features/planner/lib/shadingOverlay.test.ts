import { describe, expect, it } from "vitest";
import type { Candidate, Term } from "../types";
import { sampleTerm } from "../components/editor/fixtures/sampleSnapshot";
import { candidatesToShading, type ShadingMap } from "./candidates";
import { breakBands, gridHeight, minToY } from "./gridLayout";
import { levelAt, overlayRects, previewRect, slotCellHeight } from "./shadingOverlay";

const cand = (weekday: number, start_min: number, score: number): Candidate => ({
  weekday,
  start_min,
  end_min: start_min + 60,
  room_id: "r",
  room_name: "R",
  score,
});

// day 510 (08:30) .. 1065 (17:45), grid 15, breaks 630-645, 765-810, 930-945
const term = sampleTerm;

describe("slotCellHeight", () => {
  it("is 20px for a 15-minute step and 40px for a 30-minute step", () => {
    expect(slotCellHeight(term)).toBe(20);
    expect(slotCellHeight({ grid_minutes: 30 })).toBe(40);
  });
});

describe("overlayRects with candidates", () => {
  const map = candidatesToShading([cand(0, 540, 1), cand(0, 555, 1), cand(0, 570, 9), cand(0, 600, 9)], term);
  const rects = overlayRects(term, 0, { map, durationMin: 60 });

  it("merges neighbouring cells of one level and keeps the order by time", () => {
    const starts = rects.map((r) => r.start_min);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    const good = rects.filter((r) => r.level === "good");
    // 4 slots -> ceil(4/4)=1 good, threshold = best score 1: 540 and 555 are good and adjacent, so one rect
    expect(good).toHaveLength(1);
    expect(good[0]).toMatchObject({ start_min: 540, end_min: 570, top: minToY(540, term), height: 40 });
  });

  it("levels: candidates good/ok, everything else blocked", () => {
    expect(levelAt(term, 0, 540, { map, durationMin: 60 })).toBe("good");
    expect(levelAt(term, 0, 570, { map, durationMin: 60 })).toBe("ok");
    expect(levelAt(term, 0, 510, { map, durationMin: 60 })).toBe("blocked");
    expect(levelAt(term, 1, 540, { map, durationMin: 60 })).toBe("blocked"); // other weekday
  });

  it("never overlaps, never covers a break, stays inside the day", () => {
    const bands = breakBands(term);
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.top + r.height).toBeLessThanOrEqual(gridHeight(term) + 0.0001);
      if (i > 0) expect(r.top).toBeGreaterThanOrEqual(rects[i - 1].top + rects[i - 1].height - 0.0001);
      for (const b of bands) expect(r.start_min >= b.end_min || r.end_min <= b.start_min).toBe(true);
    }
  });

  it("covers every non-break start exactly once", () => {
    const covered = rects.reduce((sum, r) => sum + (r.end_min - r.start_min), 0);
    const bandMinutes = breakBands(term).reduce((s, b) => s + (b.end_min - b.start_min), 0);
    expect(covered).toBe(term.day_end_min - term.day_start_min - bandMinutes);
  });
});

describe("overlayRects fallback (candidates not loaded)", () => {
  it("uses the client preflight with the session's duration", () => {
    const rs = overlayRects(term, 0, { map: null, durationMin: 60 });
    expect(levelAt(term, 0, 540, { map: null, durationMin: 60 })).toBe("ok");
    // 17:00 + 60 min runs past the end of the day (17:45)
    expect(levelAt(term, 0, 1020, { map: null, durationMin: 60 })).toBe("blocked");
    expect(rs.some((r) => r.level === "ok")).toBe(true);
    expect(rs[rs.length - 1].level).toBe("blocked");
  });

  it("a non-working day is all blocked", () => {
    const rs = overlayRects(term, 6, { map: null, durationMin: 60 });
    expect(rs.every((r) => r.level === "blocked")).toBe(true);
  });
});

describe("overlayRects edge cases", () => {
  it("returns nothing when the term has no valid start", () => {
    const odd: Term = { ...term, day_start_min: 491, grid_minutes: 20 }; // 491 is not a multiple of gcd(15, 20) = 5
    expect(overlayRects(odd, 0, { map: null, durationMin: 60 })).toEqual([]);
  });

  it("works with a coarser grid (30 minutes: step 30, cell 40px)", () => {
    const t: Term = { ...term, grid_minutes: 30, day_start_min: 540, day_end_min: 660, breaks: [] };
    const map: ShadingMap = new Map([
      ["0:540", "good"],
      ["0:570", "good"],
      ["0:600", "ok"],
    ]);
    const rs = overlayRects(t, 0, { map, durationMin: 30 });
    expect(rs.map((r) => [r.start_min, r.level, r.height])).toEqual([
      [540, "good", 80],
      [600, "ok", 40],
      [630, "blocked", 40],
    ]);
    expect(rs[2].top + rs[2].height).toBe(gridHeight(t));
  });

  it("clips a last cell that reaches past the end of the day", () => {
    const t: Term = { ...term, grid_minutes: 30, day_start_min: 540, day_end_min: 650, breaks: [] };
    const rs = overlayRects(t, 0, { map: new Map(), durationMin: 30 });
    const last = rs[rs.length - 1];
    expect(last.top + last.height).toBe(gridHeight(t));
  });
});

describe("previewRect", () => {
  it("matches the card geometry", () => {
    expect(previewRect(term, 540, 60)).toEqual({ top: minToY(540, term), height: 80 });
  });
  it("clips to the day and returns null when fully outside", () => {
    expect(previewRect(term, 480, 60)).toEqual({ top: 0, height: 40 }); // 08:00-09:00 shows as 08:30-09:00
    expect(previewRect(term, 1050, 60)).toEqual({ top: minToY(1050, term), height: 20 });
    expect(previewRect(term, 1100, 60)).toBeNull();
    expect(previewRect(term, 300, 60)).toBeNull();
  });
});
