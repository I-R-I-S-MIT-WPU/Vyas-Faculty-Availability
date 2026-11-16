import { describe, expect, it } from "vitest";
import type { Candidate } from "../types";
import { sampleCandidates } from "../components/editor/fixtures/samplePhase3";
import { sampleTerm } from "../components/editor/fixtures/sampleSnapshot";
import { candidatesToShading, fallbackShading, roomsAtSlot, shadingFor, slotKey } from "./candidates";

const cand = (weekday: number, start_min: number, score: number, room = "room-301"): Candidate => ({
  weekday,
  start_min,
  end_min: start_min + 60,
  room_id: room,
  room_name: room,
  score,
});

describe("candidatesToShading", () => {
  it("shades the best quarter good and the rest ok", () => {
    const list = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => cand(0, 510 + i * 15, i));
    // 8 slots -> ceil(8/4) = 2 good: the two lowest scores
    const m = candidatesToShading(list, sampleTerm);
    expect(m.get(slotKey(0, 510))).toBe("good");
    expect(m.get(slotKey(0, 525))).toBe("good");
    expect(m.get(slotKey(0, 540))).toBe("ok");
    const levels = [...m.values()];
    expect(levels.filter((l) => l === "good")).toHaveLength(2);
    expect(levels.filter((l) => l === "ok")).toHaveLength(6);
  });

  it("treats absent slots as blocked via shadingFor", () => {
    const m = candidatesToShading(sampleCandidates.candidates, sampleTerm);
    expect(m.size).toBe(sampleCandidates.candidates.length);
    expect(shadingFor(m, 3, 645)).toBe("good"); // best score
    expect(shadingFor(m, 4, 960)).toBe("ok"); // worst score
    expect(shadingFor(m, 0, 510)).toBe("blocked"); // not a candidate
  });

  it("uses the best score when several rooms share a slot, and counts the slot once", () => {
    const m = candidatesToShading([cand(0, 540, 9, "r1"), cand(0, 540, 3, "r2"), cand(1, 540, 5)], sampleTerm);
    expect(m.size).toBe(2);
    expect(m.get(slotKey(0, 540))).toBe("good"); // best slot score is 3
    expect(m.get(slotKey(1, 540))).toBe("ok");
  });

  it("marks everything good when all scores are equal, and a single slot good", () => {
    expect([...candidatesToShading([cand(0, 540, 1), cand(1, 540, 1)], sampleTerm).values()]).toEqual(["good", "good"]);
    expect([...candidatesToShading([cand(2, 600, 7)], sampleTerm).values()]).toEqual(["good"]);
  });

  it("ignores non-working days and off-grid starts, and handles empty input", () => {
    const m = candidatesToShading([cand(5, 540, 1), cand(0, 541, 1), cand(0, 555, 1)], sampleTerm);
    expect([...m.keys()]).toEqual([slotKey(0, 555)]);
    expect(candidatesToShading([], sampleTerm).size).toBe(0);
    expect(candidatesToShading(null, sampleTerm).size).toBe(0);
  });
});

describe("shadingFor fallback", () => {
  it("uses the fallback only when candidates are not loaded", () => {
    expect(shadingFor(null, 0, 540)).toBe("ok");
    expect(shadingFor(undefined, 0, 540, () => "blocked")).toBe("blocked");
    expect(shadingFor(new Map(), 0, 540, () => "ok")).toBe("blocked"); // loaded but empty = everything blocked
  });
});

describe("fallbackShading (preflightPlacement)", () => {
  it("allows a valid slot and blocks break, off-hours and non-working day", () => {
    expect(fallbackShading(sampleTerm, 0, 570, 60)).toBe("ok");
    expect(fallbackShading(sampleTerm, 0, 780, 60)).toBe("blocked"); // lunch 12:45-13:30
    expect(fallbackShading(sampleTerm, 0, 1050, 60)).toBe("blocked"); // ends after day end
    expect(fallbackShading(sampleTerm, 5, 570, 60)).toBe("blocked"); // Saturday
  });
});

describe("roomsAtSlot", () => {
  it("returns the rooms of one slot best first", () => {
    const list = [cand(0, 540, 9, "b"), cand(0, 540, 3, "a"), cand(0, 600, 1, "c")];
    expect(roomsAtSlot(list, 0, 540).map((c) => c.room_id)).toEqual(["a", "b"]);
    expect(roomsAtSlot(list, 1, 540)).toEqual([]);
    expect(roomsAtSlot(null, 0, 540)).toEqual([]);
  });
});
