// Rectangles for the editor grid's slot-shading overlay and the suggestion preview ghost. Pure, no React.
//
// The overlay lives inside one day column ([data-grid-day]) and is purely visual (pointer-events: none), so it never
// interferes with resolveDrop / dropTarget, which read the column rects and snap raw minutes themselves.
//
// Exports:
//   GridShading                                {map, durationMin}: what the board hands the grid. `map` is the candidates shading
//                                              (lib/candidates.candidatesToShading); null means "candidates not loaded": the client
//                                              preflight (fallbackShading) decides, using durationMin.
//   OverlayLevel                               'good' | 'ok' | 'blocked'
//   OverlayRect                                {start_min, end_min, top, height, level} (end_min is the end of the last cell; height is clipped to the day)
//   slotCellHeight(term)                       pixel height of one valid-start cell (same as the empty-slot buttons)
//   overlayRects(term, weekday, shading)       one rect per run of neighbouring valid-start cells with the same level, for ONE
//                                              weekday. Starts inside a break are skipped (the break band covers them). Empty when
//                                              the term has no valid start.
//   levelAt(term, weekday, start_min, shading) the level of one start (same rule as the rects), for aria labels
//   previewRect(term, startMin, durationMin)   {top, height} of a dashed ghost for a suggested slot, clipped to the day; null when
//                                              it lies fully outside the day
//   PreviewSlot                                {weekday, start_min, duration_min}: the board's hover/focus preview state

import type { Term } from "../types";
import { fallbackShading, shadingFor, type ShadingMap } from "./candidates";
import { breakBands, minToY, PX_PER_STEP, STEP_MINUTES } from "./gridLayout";
import { effectiveStep, validStarts } from "./snap";

export interface GridShading {
  map: ShadingMap | null;
  durationMin: number;
}

export type OverlayLevel = "good" | "ok" | "blocked";

export interface OverlayRect {
  start_min: number;
  end_min: number;
  top: number;
  height: number;
  level: OverlayLevel;
}

export interface PreviewSlot {
  weekday: number;
  start_min: number;
  duration_min: number;
}

type OverlayTerm = Pick<Term, "working_days" | "day_start_min" | "day_end_min" | "grid_minutes" | "breaks">;

export const slotCellHeight = (term: Pick<Term, "grid_minutes">): number => (effectiveStep(term) * PX_PER_STEP) / STEP_MINUTES;

export function levelAt(term: OverlayTerm, weekday: number, startMin: number, shading: GridShading): OverlayLevel {
  return shadingFor(shading.map, weekday, startMin, () => fallbackShading(term, weekday, startMin, shading.durationMin));
}

export function overlayRects(term: OverlayTerm, weekday: number, shading: GridShading): OverlayRect[] {
  const bands = breakBands(term);
  const step = effectiveStep(term);
  const starts = validStarts(term).filter((m) => !bands.some((b) => m >= b.start_min && m < b.end_min));
  const out: OverlayRect[] = [];
  for (const m of starts) {
    const level = levelAt(term, weekday, m, shading);
    const prev = out[out.length - 1];
    if (prev && prev.level === level && prev.end_min === m) prev.end_min = m + step;
    else out.push({ start_min: m, end_min: m + step, top: minToY(m, term), height: 0, level });
  }
  // The last cell may reach past the end of the day: clip it.
  for (const r of out) r.height = ((Math.min(r.end_min, term.day_end_min) - r.start_min) * PX_PER_STEP) / STEP_MINUTES;
  return out;
}

export function previewRect(
  term: Pick<Term, "day_start_min" | "day_end_min">,
  startMin: number,
  durationMin: number,
): { top: number; height: number } | null {
  const start = Math.max(startMin, term.day_start_min);
  const end = Math.min(startMin + durationMin, term.day_end_min);
  if (!(end > start)) return null;
  return { top: minToY(start, term), height: ((end - start) * PX_PER_STEP) / STEP_MINUTES };
}
