// Grid-step helpers for the timetable editor. Pure, no React.
//
// The server accepts a start only when BOTH hold (placement rule, OFF_GRID):
//     start % 15 === 0   AND   (start - day_start_min) % grid_minutes === 0
// When day_start_min is a multiple of 15 the valid starts are day_start + n * lcm(15, grid). When it is not (e.g. 490
// with a 20-minute grid) the first valid start is later than day_start, and with some grids no start exists at all.
//
// Exports:
//   HARD_GRID_MINUTES                 15, the step hard-wired in SQL (start_min % 15 = 0)
//   gcd(a, b), lcm(a, b)
//   effectiveStep(term)               lcm(15, term.grid_minutes), the step between valid starts
//   firstValidStart(term)             smallest start >= day_start_min that satisfies both rules, or null when none exists
//   validStarts(term)                 every valid start in [day_start_min, day_end_min) (empty when none exists)
//   snapMinutes(value, term, durationMin?)
//                                     nearest valid start, clamped to [firstValidStart, day_end_min - durationMin]
//                                     (upper bound itself valid). Returns day_start_min when no valid start exists
//                                     (check firstValidStart first; callers treat that as "nothing placeable").
//   isOnGrid(start, term)             the server's grid rule: start % 15 === 0 AND (start - day_start_min) % grid_minutes === 0

import type { Term } from "../types";

type GridTerm = Pick<Term, "day_start_min" | "day_end_min" | "grid_minutes">;

export const HARD_GRID_MINUTES = 15;

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

export function lcm(a: number, b: number): number {
  if (!a || !b) return 0;
  return Math.abs(a * b) / gcd(a, b);
}

const gridOf = (term: Pick<Term, "grid_minutes">): number =>
  Number.isFinite(term.grid_minutes) && term.grid_minutes > 0 ? Math.round(term.grid_minutes) : HARD_GRID_MINUTES;

/** Step between valid starts: the smallest step that honours both the 15-minute SQL rule and the term's own grid. */
export function effectiveStep(term: Pick<Term, "grid_minutes">): number {
  return lcm(HARD_GRID_MINUTES, gridOf(term));
}

/**
 * The first valid start at or after day_start_min, or null when the two rules can never hold together
 * (day_start_min not divisible by gcd(15, grid)). It is at most 14 grid steps away, so a short search is enough.
 */
export function firstValidStart(term: GridTerm): number | null {
  const grid = gridOf(term);
  const ds = term.day_start_min;
  if (!Number.isInteger(ds)) return null;
  for (let k = 0; k < HARD_GRID_MINUTES; k++) {
    const s = ds + k * grid;
    if (s % HARD_GRID_MINUTES === 0) return s < term.day_end_min ? s : null;
  }
  return null;
}

/** All valid starts strictly before day_end_min (before any break filtering). */
export function validStarts(term: GridTerm): number[] {
  const first = firstValidStart(term);
  if (first == null) return [];
  const step = effectiveStep(term);
  const out: number[] = [];
  for (let m = first; m < term.day_end_min; m += step) out.push(m);
  return out;
}

/**
 * Snap a raw minute value to the nearest valid start and clamp it so a session of `durationMin`
 * still ends inside the day. Ties round up. If the session cannot fit at all, returns the first valid start
 * (day_start_min when there is none).
 */
export function snapMinutes(value: number, term: GridTerm, durationMin = 0): number {
  const first = firstValidStart(term);
  if (first == null) return term.day_start_min;
  const step = effectiveStep(term);
  const hiRaw = term.day_end_min - Math.max(0, durationMin);
  if (hiRaw < first) return first;
  const hi = first + Math.floor((hiRaw - first) / step) * step;
  const snapped = first + Math.round((value - first) / step) * step;
  return Math.min(Math.max(snapped, first), hi);
}

/** Same grid rule the server enforces (OFF_GRID). Does not check the day bounds. */
export function isOnGrid(start: number, term: GridTerm): boolean {
  return (
    Number.isInteger(start) &&
    start % HARD_GRID_MINUTES === 0 &&
    (start - term.day_start_min) % gridOf(term) === 0
  );
}
