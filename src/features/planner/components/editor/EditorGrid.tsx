// Display-only weekly grid for the timetable editor: no data fetching, no drag and drop (a later layer adds it).
//
// Exports:
//   EditorGrid(props: EditorGridProps)
//     term          Term (working days, day bounds, grid, breaks)
//     sessions      PlannerSession[]; only placed ones are drawn
//     selectedId?   id of the session to highlight
//     onSelect?     (id) => void, card click / Enter / Space
//     onSlotClick?  (weekday, start_min) => void, empty cell click or Enter/Space; start is already snapped to the grid
//     roomName?     (room_id) => string
//     renderCard?   (cardProps) => ReactNode, wraps each card (added in Phase 2 so the board can add useDraggable); the grid keeps the key
//     severityBySession?     Map<session_id, 'blocking'|'hard'|'soft'>: the card marker (worst diagnostics issue of the session)
//     issueCountBySession?   Map<session_id, number>: how many issues each marked session is part of (label only)
//     highlightedIds?        ids of the sessions of the issue picked in the diagnostics panel (amber ring)
//     shading?               {map, durationMin} | null: tints every valid-start cell of each day column while a session is being
//                            placed (good = green, ok = light green, blocked = greyed hatch). map null = candidates not loaded, the
//                            client preflight decides. Purely visual: pointer-events none, under break bands and cards.
//     previewSlot?           {weekday, start_min, duration_min} | null: dashed ghost rectangle for a hovered suggestion
//     className?    classes for the outer scroll container
//
// Hooks for a drag and drop layer (all plain DOM attributes, no refs needed):
//   [data-grid-day]                one per working-day column body (position: relative, height = gridHeight(term))
//       data-weekday               0=Mon .. 6=Sun
//       data-day-start             term.day_start_min (minute at the column's top edge)
//       data-px-per-minute         vertical scale, same as pxPerMinute from lib/gridLayout
//   [data-slot-start]              one per valid start cell (data-weekday + data-slot-start in minutes); rendered
//                                  under the cards, skipped where a start would fall inside a break (and absent when the
//                                  term has no valid start, see lib/snap.ts)
//   [data-session-id]              each card (SessionCard)
//   [data-shading-overlay]         the shading layer of a column (data-level good | ok | blocked on each rect); pointer-events none
//   [data-preview-slot]            the suggestion ghost
// Horizontal overflow scrolls inside the component; the page never scrolls sideways.

import { Fragment, useMemo, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Coffee } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlannerSession, RuleSeverity, Term } from "../../types";
import { levelAt, overlayRects, previewRect, type GridShading, type OverlayLevel, type PreviewSlot } from "../../lib/shadingOverlay";
import { breakBands, gridHeight, layoutDay, minToY, pxPerMinute, workingDayColumns, PX_PER_STEP, STEP_MINUTES } from "../../lib/gridLayout";
import { effectiveStep, validStarts } from "../../lib/snap";
import { WEEKDAY_NAMES, minToTime } from "../../lib/time";
import { SessionCard, type SessionCardProps } from "./SessionCard";

export interface EditorGridProps {
  term: Term;
  sessions: PlannerSession[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onSlotClick?: (weekday: number, start_min: number) => void;
  roomName?: (room_id: string) => string;
  /**
   * Optional wrapper for each card (added for the drag-and-drop layer): receives the exact props the default
   * <SessionCard> would get and returns the element to render instead (e.g. a component that adds useDraggable).
   * The grid supplies the React key.
   */
  renderCard?: (props: SessionCardProps) => ReactNode;
  severityBySession?: ReadonlyMap<string, RuleSeverity>;
  issueCountBySession?: ReadonlyMap<string, number>;
  highlightedIds?: readonly string[];
  shading?: GridShading | null;
  previewSlot?: PreviewSlot | null;
  className?: string;
}

const LEVEL_STYLE: Record<OverlayLevel, CSSProperties> = {
  good: { backgroundColor: "hsl(var(--status-success) / 0.85)", boxShadow: "inset 3px 0 0 hsl(var(--status-success-border))" },
  ok: { backgroundColor: "hsl(var(--status-success) / 0.4)", boxShadow: "inset 3px 0 0 hsl(var(--status-success-border) / 0.6)" },
  blocked: {
    backgroundImage:
      "repeating-linear-gradient(135deg, hsl(var(--muted-foreground) / 0.14) 0 2px, transparent 2px 7px)",
    backgroundColor: "hsl(var(--muted) / 0.55)",
  },
};

const LEVEL_WORD: Record<OverlayLevel, string> = { good: "good fit", ok: "available", blocked: "not available" };

const HEADER_PX = 40;
const GUTTER = "3.5rem";
const COLUMN_MIN = "11rem";

const HATCH =
  "repeating-linear-gradient(135deg, hsl(var(--status-lunch) / 0.75) 0 6px, hsl(var(--status-lunch-border) / 0.4) 6px 12px)";

export function EditorGrid({
  term,
  sessions,
  selectedId,
  onSelect,
  onSlotClick,
  roomName,
  renderCard,
  severityBySession,
  issueCountBySession,
  highlightedIds,
  shading,
  previewSlot,
  className,
}: EditorGridProps) {
  const columns = useMemo(() => workingDayColumns(term), [term]);
  const bands = useMemo(() => breakBands(term), [term]);
  const height = gridHeight(term);
  const step = effectiveStep(term);

  const lines = useMemo(() => {
    const out: { min: number; y: number; hour: boolean }[] = [];
    for (let m = Math.ceil(term.day_start_min / STEP_MINUTES) * STEP_MINUTES; m < term.day_end_min; m += STEP_MINUTES) {
      out.push({ min: m, y: minToY(m, term), hour: m % 60 === 0 });
    }
    return out;
  }, [term]);

  // Cell starts a user can click: starts valid under BOTH server rules (start % 15 and (start - day_start) % grid),
  // which begin at the first valid start (later than day_start when that is not a multiple of 15, none at all for
  // some grids), minus those inside a break.
  const starts = useMemo(
    () => validStarts(term).filter((m) => !bands.some((b) => m >= b.start_min && m < b.end_min)),
    [term, bands],
  );

  const byDay = useMemo(() => {
    const map = new Map<number, PlannerSession[]>();
    for (const s of sessions) {
      if (s.weekday == null || s.start_min == null || s.end_min == null) continue;
      const list = map.get(s.weekday);
      if (list) list.push(s);
      else map.set(s.weekday, [s]);
    }
    return map;
  }, [sessions]);

  const highlighted = useMemo(() => new Set(highlightedIds ?? []), [highlightedIds]);
  const ghost = useMemo(
    () => (previewSlot ? previewRect(term, previewSlot.start_min, previewSlot.duration_min) : null),
    [term, previewSlot],
  );

  const interactive = !!onSlotClick;
  const firstStart = starts[0];
  const firstDay = columns[0]?.weekday;

  // Arrow keys move between empty cells (one tab stop for the whole grid).
  const onCellKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.dataset.slotStart === undefined) return;
    const delta: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    const dayIdx = columns.findIndex((c) => c.weekday === Number(target.dataset.weekday));
    let startIdx = starts.indexOf(Number(target.dataset.slotStart));
    const nextDay = dayIdx + d[0];
    startIdx += d[1];
    if (nextDay < 0 || nextDay >= columns.length || startIdx < 0 || startIdx >= starts.length) return;
    const next = e.currentTarget.querySelector<HTMLElement>(
      `[data-slot-start="${starts[startIdx]}"][data-weekday="${columns[nextDay].weekday}"]`,
    );
    next?.focus();
  };

  return (
    <div
      role="region"
      aria-label="Weekly timetable grid"
      className={cn("overflow-x-auto overscroll-x-contain rounded-md border bg-card text-card-foreground", className)}
    >
      <div className="flex" style={{ minWidth: `calc(${GUTTER} + ${columns.length} * ${COLUMN_MIN})` }}>
        {/* Time gutter */}
        <div className="sticky left-0 z-30 shrink-0 border-r bg-card" style={{ width: GUTTER }} aria-hidden="true">
          <div className="border-b" style={{ height: HEADER_PX }} />
          <div className="relative" style={{ height }}>
            {lines
              .filter((l) => l.hour || l.min === term.day_start_min)
              .map((l) => (
                <time
                  key={l.min}
                  className="absolute right-2 -translate-y-1/2 whitespace-nowrap text-[11px] text-muted-foreground first:translate-y-0"
                  style={{ top: l.y }}
                >
                  {minToTime(l.min)}
                </time>
              ))}
          </div>
        </div>

        <div className="flex flex-1" onKeyDown={interactive ? onCellKeyDown : undefined}>
          {columns.map((col) => {
            const positioned = layoutDay(byDay.get(col.weekday) ?? [], term);
            return (
              <div
                key={col.weekday}
                role="group"
                aria-label={WEEKDAY_NAMES[col.weekday]}
                className="min-w-0 flex-1 border-r last:border-r-0"
                style={{ minWidth: COLUMN_MIN }}
              >
                <div
                  className="flex items-center justify-center border-b bg-muted/50 text-sm font-semibold"
                  style={{ height: HEADER_PX }}
                >
                  {col.label}
                </div>

                <div
                  data-grid-day
                  data-weekday={col.weekday}
                  data-day-start={term.day_start_min}
                  data-px-per-minute={pxPerMinute}
                  className="relative"
                  style={{ height }}
                >
                  {/* Gridlines: 15-minute, stronger on the hour */}
                  {lines.map((l) => (
                    <div
                      key={l.min}
                      aria-hidden="true"
                      className={cn(
                        "pointer-events-none absolute left-0 right-0 border-t",
                        l.hour ? "border-border" : "border-border/40",
                      )}
                      style={{ top: l.y }}
                    />
                  ))}

                  {/* Slot shading: above the slot buttons, below break bands and cards; never takes pointer events */}
                  {shading && (
                    <div data-shading-overlay aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1]">
                      {overlayRects(term, col.weekday, shading).map((r) => (
                        <div
                          key={r.start_min}
                          data-level={r.level}
                          className="absolute left-0 right-0"
                          style={{ top: r.top, height: r.height, ...LEVEL_STYLE[r.level] }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Empty-slot cells (under everything else) */}
                  {starts.map((m) => {
                    const common = {
                      "data-weekday": col.weekday,
                      "data-slot-start": m,
                      className: cn(
                        "absolute left-0 right-0 block",
                        interactive &&
                          "cursor-pointer transition-colors hover:bg-accent/60 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      ),
                      style: { top: minToY(m, term), height: (step * PX_PER_STEP) / STEP_MINUTES },
                    };
                    if (!interactive) return <div key={m} aria-hidden="true" {...common} />;
                    const first = col.weekday === firstDay && m === firstStart;
                    return (
                      <button
                        key={m}
                        type="button"
                        tabIndex={first ? 0 : -1}
                        aria-label={`Empty slot ${WEEKDAY_NAMES[col.weekday]} ${minToTime(m)}${
                          shading ? `, ${LEVEL_WORD[levelAt(term, col.weekday, m, shading)]}` : ""
                        }`}
                        onClick={() => onSlotClick?.(col.weekday, m)}
                        {...common}
                      />
                    );
                  })}

                  {/* Blocked break bands */}
                  {bands.map((b) => (
                    <div
                      key={`${b.start_min}-${b.end_min}`}
                      role="img"
                      aria-label={`${b.label}, ${minToTime(b.start_min)} to ${minToTime(b.end_min)}, blocked`}
                      className="absolute left-0 right-0 z-10 flex items-center justify-center gap-1 overflow-hidden border-y border-status-lunch-border/60 px-1 text-[11px] font-medium text-status-lunch-foreground"
                      style={{ top: b.top, height: b.height, backgroundImage: HATCH }}
                    >
                      <Coffee className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{b.label}</span>
                    </div>
                  ))}

                  {/* Suggestion preview (dashed ghost) */}
                  {previewSlot && ghost && previewSlot.weekday === col.weekday && (
                    <div
                      data-preview-slot
                      aria-hidden="true"
                      className="pointer-events-none absolute left-1 right-1 z-[15] rounded-md border-2 border-dashed border-primary bg-primary/15"
                      style={{ top: ghost.top, height: ghost.height }}
                    />
                  )}

                  {/* Session cards */}
                  {positioned.map(({ session, top, height: h, lane, lanes }) => {
                    const cardProps: SessionCardProps = {
                      session,
                      height: h - 2,
                      roomName: session.room_id && roomName ? roomName(session.room_id) : undefined,
                      selected: session.id === selectedId,
                      severity: severityBySession?.get(session.id) ?? null,
                      issueCount: issueCountBySession?.get(session.id),
                      highlighted: highlighted.has(session.id),
                      onSelect,
                      className: "absolute z-20",
                      style: {
                        top: top + 1,
                        height: h - 2,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                      },
                    };
                    return <Fragment key={session.id}>{renderCard ? renderCard(cardProps) : <SessionCard {...cardProps} />}</Fragment>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
