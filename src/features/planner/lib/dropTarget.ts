// Turns a dragged rectangle into a grid slot. Pure, no React, no DOM: the caller measures the DOM.
//
// Exports:
//   RectLike                      {left, top, width, height} in one shared coordinate space (viewport pixels)
//   DayColumnRect                 a day column's rect plus {weekday, dayStart, pxPerMinute} (the data-* attributes of [data-grid-day])
//   resolveDrop(rect, columns, durationMin, term) -> {weekday, start_min} | null
//       Column = the one containing the rect's horizontal centre (null when none does, or when the rect's
//       vertical centre is outside the column body, or when the term has no valid start at all, see snap.ts
//       firstValidStart). start = rect.top relative to the column, converted to minutes and snapped by
//       snapMinutes() (which clamps so the session still ends inside the day).
//   preflightPlacement(term, weekday, start_min, durationMin) -> string | null
//       Advisory client-side check that mirrors the server's blocking placement rule, so an obviously
//       impossible drop is refused instantly with a sentence instead of a round trip. The server stays the
//       authority (PLACEMENT_INVALID); null means "go ahead and send it".

import type { Term } from "../types";
import { WEEKDAY_NAMES, minToTime } from "./time";
import { firstValidStart, isOnGrid, snapMinutes } from "./snap";

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DayColumnRect extends RectLike {
  weekday: number;
  /** Minute at the column's top edge (data-day-start). */
  dayStart: number;
  /** Vertical scale (data-px-per-minute). */
  pxPerMinute: number;
}

export interface DropTarget {
  weekday: number;
  start_min: number;
}

type DropTerm = Pick<Term, "day_start_min" | "day_end_min" | "grid_minutes">;

export function resolveDrop(
  rect: RectLike,
  columns: DayColumnRect[],
  durationMin: number,
  term: DropTerm,
): DropTarget | null {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const col = columns.find((c) => c.width > 0 && cx >= c.left && cx < c.left + c.width);
  if (!col || !(col.pxPerMinute > 0)) return null;
  if (firstValidStart(term) == null) return null;
  if (cy < col.top || cy > col.top + col.height) return null;
  const raw = col.dayStart + (rect.top - col.top) / col.pxPerMinute;
  return { weekday: col.weekday, start_min: snapMinutes(raw, term, durationMin) };
}

type PreflightTerm = DropTerm & Pick<Term, "working_days" | "breaks">;

export function preflightPlacement(
  term: PreflightTerm,
  weekday: number,
  start_min: number,
  durationMin: number,
): string | null {
  const end = start_min + durationMin;
  const day = WEEKDAY_NAMES[weekday] ?? "That day";
  if (!term.working_days.includes(weekday)) return `${day} is not a working day for this term.`;
  if (!isOnGrid(start_min, term)) return `${minToTime(start_min)} is not on the term's time grid.`;
  if (start_min < term.day_start_min || end > term.day_end_min) {
    return `${minToTime(start_min)}-${minToTime(end)} is outside teaching hours (${minToTime(term.day_start_min)}-${minToTime(term.day_end_min)}).`;
  }
  const hit = (term.breaks ?? []).find((b) => start_min < b.end_min && end > b.start_min);
  if (hit) {
    return `${minToTime(start_min)}-${minToTime(end)} overlaps ${hit.label?.trim() || "a break"} (${minToTime(hit.start_min)}-${minToTime(hit.end_min)}).`;
  }
  return null;
}
