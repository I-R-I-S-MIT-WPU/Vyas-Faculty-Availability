// Drag-time slot shading from the candidates endpoint (contract 9.4). Pure, no React.
//
// A candidate is a slot that passes every hard check, ascending score (lower is better). Anything not in the map is
// blocked. Shading: the best quarter of the slots (by score) is 'good', the rest 'ok'.
//
// Exports:
//   slotKey(weekday, start_min)                    "weekday:start_min", the key of the shading map
//   ShadingLevel                                   'good' | 'ok' (absent from the map = 'blocked')
//   candidatesToShading(candidates, term)          Map<slotKey, 'ok' | 'good'>. Several rooms in one slot count as one slot at
//                                                  its best score. Slots on non-working days or off the term's grid are ignored.
//   shadingFor(shading, weekday, start, fallback?) 'good' | 'ok' | 'blocked'. With no shading (candidates not loaded yet) the
//                                                  `fallback` decides (default 'ok': do not block what we cannot judge).
//   fallbackShading(term, weekday, start, durationMin)
//                                                  'ok' | 'blocked' from the client-side preflightPlacement (term rules only)
//   roomsAtSlot(candidates, weekday, start)        the candidate rooms of one slot, best score first

import type { Candidate, Term } from "../types";
import { preflightPlacement } from "./dropTarget";
import { isOnGrid } from "./snap";

export type ShadingLevel = "ok" | "good";
export type Shading = ShadingLevel | "blocked";
export type ShadingMap = Map<string, ShadingLevel>;

type ShadingTerm = Pick<Term, "working_days" | "day_start_min" | "day_end_min" | "grid_minutes">;
type PreflightTerm = Pick<Term, "working_days" | "day_start_min" | "day_end_min" | "grid_minutes" | "breaks">;

export const slotKey = (weekday: number, startMin: number): string => `${weekday}:${startMin}`;

/** Fraction of the slots (best score first) that is shaded 'good'. */
const GOOD_FRACTION = 0.25;

export function candidatesToShading(candidates: Candidate[] | null | undefined, term: ShadingTerm): ShadingMap {
  const best = new Map<string, number>();
  for (const c of candidates ?? []) {
    if (!term.working_days.includes(c.weekday)) continue;
    if (!isOnGrid(c.start_min, term)) continue;
    const key = slotKey(c.weekday, c.start_min);
    const prev = best.get(key);
    if (prev === undefined || c.score < prev) best.set(key, c.score);
  }
  const out: ShadingMap = new Map();
  if (best.size === 0) return out;
  const scores = [...best.values()].sort((a, b) => a - b);
  const goodCount = Math.max(1, Math.ceil(scores.length * GOOD_FRACTION));
  const threshold = scores[goodCount - 1];
  for (const [key, score] of best) out.set(key, score <= threshold ? "good" : "ok");
  return out;
}

export function fallbackShading(
  term: PreflightTerm,
  weekday: number,
  startMin: number,
  durationMin: number,
): "ok" | "blocked" {
  return preflightPlacement(term, weekday, startMin, durationMin) === null ? "ok" : "blocked";
}

export function shadingFor(
  shading: ShadingMap | null | undefined,
  weekday: number,
  startMin: number,
  fallback?: () => Shading,
): Shading {
  if (shading) return shading.get(slotKey(weekday, startMin)) ?? "blocked";
  return fallback ? fallback() : "ok";
}

export function roomsAtSlot(candidates: Candidate[] | null | undefined, weekday: number, startMin: number): Candidate[] {
  return (candidates ?? [])
    .filter((c) => c.weekday === weekday && c.start_min === startMin)
    .sort((a, b) => a.score - b.score || a.room_name.localeCompare(b.room_name, "en", { numeric: true }));
}
