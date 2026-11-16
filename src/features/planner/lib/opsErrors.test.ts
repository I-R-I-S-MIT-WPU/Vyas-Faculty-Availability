import { describe, expect, it } from "vitest";
import { opsErrorMessage } from "./opsErrors";

const conflict = (text: string, kind = "faculty") => ({ kind, resource_id: "r", resource_name: "n", session_id: "s", text });
const clash = (conflicts: unknown, extra: Record<string, unknown> = {}, message = "First sentence.") => ({
  message,
  code: "CLASH",
  details: { op_index: 0, conflicts, ...extra },
});

describe("opsErrorMessage", () => {
  it("joins up to three distinct conflict sentences", () => {
    const err = clash([conflict("A."), conflict("B.", "room"), conflict("C.", "batch")]);
    expect(opsErrorMessage(err, "fb")).toBe("A. B. C.");
  });

  it("de-duplicates and trims", () => {
    const err = clash([conflict("A."), conflict(" A. "), conflict("B.")]);
    expect(opsErrorMessage(err, "fb")).toBe("A. B.");
  });

  it("caps at three and says how many more", () => {
    const err = clash([conflict("A."), conflict("B."), conflict("C."), conflict("D."), conflict("E.")]);
    expect(opsErrorMessage(err, "fb")).toBe("A. B. C. (+2 more)");
  });

  it("keeps the ROOM_CAPACITY text verbatim", () => {
    const text =
      "Room Lab 1 (capacity 62) would hold 80 students on Monday 09:30-11:30; it already has OS for CSE-A (Sem 3) batch A1 (30 students).";
    const err = clash([conflict("something else", "room")], { reason: "ROOM_CAPACITY" }, text);
    expect(opsErrorMessage(err, "fb")).toBe(text);
  });

  it("falls back to the error message without usable conflicts", () => {
    expect(opsErrorMessage(clash([]), "fb")).toBe("First sentence.");
    expect(opsErrorMessage({ message: "Slot taken.", code: "CLASH", details: "oops" }, "fb")).toBe("Slot taken.");
    expect(opsErrorMessage({ message: "Slot taken.", code: "CLASH" }, "fb")).toBe("Slot taken.");
    expect(opsErrorMessage(clash([{ kind: "room" }, null, conflict("")]), "fb")).toBe("First sentence.");
  });

  it("uses the fallback for other codes and non-errors", () => {
    expect(opsErrorMessage({ message: "x", code: "PLACEMENT_INVALID", details: { conflicts: [conflict("A.")] } }, "fb")).toBe("fb");
    expect(opsErrorMessage(null, "fb")).toBe("fb");
    expect(opsErrorMessage({ code: "CLASH" }, "fb")).toBe("fb");
  });
});
