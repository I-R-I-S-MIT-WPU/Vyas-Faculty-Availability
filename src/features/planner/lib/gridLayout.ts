// Geometry for the timetable editor grid. Pure, no React.
//
// Exports:
//   PX_PER_STEP (20), STEP_MINUTES (15), pxPerMinute          vertical scale: 20px per 15 minutes
//   minToY(min, term) / yToMin(y, term)                       minutes <-> pixel offset from the top of the day (yToMin is unsnapped)
//   gridHeight(term)                                          pixel height of the whole day
//   breakBands(term) -> BreakBand[]                           {top,height,label,start_min,end_min}, clipped to the day, sorted
//   workingDayColumns(term) -> DayColumn[]                    {weekday,label} sorted, 0=Mon
//   layoutDay(sessions, term) -> PositionedSession[]          packs ONE weekday's placed sessions into side-by-side lanes
//       NOTE: takes `term` as a 2nd argument (needed for `top`, which is relative to day_start_min).
//       Unplaced sessions (null weekday/start/end) are skipped. Output is sorted by start, then longer first.
//       Overlap uses half-open ranges, so back-to-back sessions share no lane. `lanes` is the width of the
//       overlap cluster the session belongs to, so cards in a quiet part of the day stay full width.

import type { PlannerSession, Term } from "../types";
import { WEEKDAY_LABELS } from "./time";

type DayTerm = Pick<Term, "day_start_min" | "day_end_min">;

export const STEP_MINUTES = 15;
export const PX_PER_STEP = 20;
export const pxPerMinute = PX_PER_STEP / STEP_MINUTES;

export const minToY = (min: number, term: DayTerm): number => ((min - term.day_start_min) * PX_PER_STEP) / STEP_MINUTES;

/** Raw (unsnapped) minute at a pixel offset; pass the result through snapMinutes() from ./snap. */
export const yToMin = (y: number, term: DayTerm): number => term.day_start_min + (y * STEP_MINUTES) / PX_PER_STEP;

export const gridHeight = (term: DayTerm): number => minToY(term.day_end_min, term);

export interface BreakBand {
  top: number;
  height: number;
  label: string;
  start_min: number;
  end_min: number;
}

export function breakBands(term: DayTerm & Pick<Term, "breaks">): BreakBand[] {
  return (term.breaks ?? [])
    .map((b) => ({
      start_min: Math.max(b.start_min, term.day_start_min),
      end_min: Math.min(b.end_min, term.day_end_min),
      label: b.label?.trim() || "Break",
    }))
    .filter((b) => b.end_min > b.start_min)
    .sort((a, b) => a.start_min - b.start_min)
    .map((b) => ({
      ...b,
      top: minToY(b.start_min, term),
      height: ((b.end_min - b.start_min) * PX_PER_STEP) / STEP_MINUTES,
    }));
}

export interface DayColumn {
  weekday: number;
  label: string;
}

export function workingDayColumns(term: Pick<Term, "working_days">): DayColumn[] {
  return [...new Set(term.working_days)]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b)
    .map((weekday) => ({ weekday, label: WEEKDAY_LABELS[weekday] }));
}

export interface PositionedSession {
  session: PlannerSession;
  top: number;
  height: number;
  /** 0-based lane inside the overlap cluster. */
  lane: number;
  /** Number of lanes in the cluster; card width = 100 / lanes percent. */
  lanes: number;
}

interface Placed {
  session: PlannerSession;
  start: number;
  end: number;
}

export function layoutDay(sessions: PlannerSession[], term: DayTerm): PositionedSession[] {
  const items: Placed[] = [];
  for (const session of sessions) {
    if (session.weekday == null || session.start_min == null || session.end_min == null) continue;
    items.push({ session, start: session.start_min, end: session.end_min });
  }
  items.sort(
    (a, b) =>
      a.start - b.start ||
      b.end - a.end ||
      a.session.batch_name.localeCompare(b.session.batch_name) ||
      a.session.id.localeCompare(b.session.id),
  );

  const out: PositionedSession[] = [];
  let cluster: { item: Placed; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const lanes = laneEnds.length;
    for (const { item, lane } of cluster) {
      out.push({
        session: item.session,
        top: minToY(item.start, term),
        height: ((item.end - item.start) * PX_PER_STEP) / STEP_MINUTES,
        lane,
        lanes,
      });
    }
    cluster = [];
    laneEnds = [];
  };

  for (const item of items) {
    if (cluster.length && item.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    cluster.push({ item, lane });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length) flush();
  return out;
}
