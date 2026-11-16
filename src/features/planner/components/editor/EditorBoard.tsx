// The editor: composes sidebar, grid, session panel and status bar, and owns selection, drag and drop and the
// click-to-place flow. Data comes in as a snapshot (react-query cache); every edit goes out as ops through
// useApplyOps (optimistic, rolled back with a sentence if the server refuses).
//
// Two ways to place or move a session, both ending in the same place/move op (the server picks the room):
//   1. drag: an unscheduled item or an unlocked card is dropped on a day column. On drag end the target is
//      computed from the DOM ([data-grid-day] rects + data-day-start / data-px-per-minute) by lib/dropTarget.
//      The dragged rect is what the user sees: for pointer drags the start rect moved by the live pointer
//      movement (NOT dnd-kit's event.delta, which also adds scroll offsets and would drift after autoscroll);
//      for keyboard drags the overlay element's measured rect; list items use the pointer position itself.
//   2. click: select a session (click / Enter), then click an empty slot (EditorGrid.onSlotClick). Works with the
//      keyboard (arrow keys move between slots) and on touch screens.
// Keyboard: Escape deselects (and clears an issue highlight), Delete/Backspace unplaces the selected unlocked card, M starts a
// keyboard drag (arrows move, Enter drops, Escape cancels). Enter/Space on a card or item selects it.
//
// Phase 3 layers on top (all read-only data, every edit still goes through the same apply()):
//   - diagnostics (useDiagnostics): panel under the grid, status bar badge, per-division counts, card markers; clicking an issue
//     switches division, selects its first session and highlights all of its sessions (highlightedIds, Escape or a second click clears)
//   - suggestions: the session panel lists the best slots; hovering one previews it on the grid (previewSlot)
//   - shading: while a session is dragged or selected its candidate slots (useCandidates, prefetched on select) tint the grid; until
//     they arrive the client preflight decides (only while dragging, so a click does not flash grey)

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { BookOpen, FlaskConical, Info, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { refreshDiagnosticsSoon, useApplyOps, useCandidates, useDiagnostics } from "../../hooks";
import { candidatesToShading } from "../../lib/candidates";
import { issuesBySession, worstSeverityBySession } from "../../lib/diagnostics";
import { preflightPlacement, resolveDrop, type DayColumnRect, type DropTarget, type RectLike } from "../../lib/dropTarget";
import { diagnosticsBehind, hasIssue, pickIssueSelection, toggleIssueId } from "../../lib/editorHighlights";
import { PX_PER_STEP, pxPerMinute } from "../../lib/gridLayout";
import type { GridShading, PreviewSlot } from "../../lib/shadingOverlay";
import { countByDivision, isPlaced } from "../../lib/patch";
import { effectiveStep, firstValidStart } from "../../lib/snap";
import { batchToDivisionMap, sessionsOfDivision } from "../../lib/sessionFilters";
import { WEEKDAY_LABELS, minToTime } from "../../lib/time";
import type { Issue, PlannerOp, PlannerSession, Snapshot } from "../../types";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { DivisionSidebar } from "./DivisionSidebar";
import { EditorGrid } from "./EditorGrid";
import { SessionCard, type SessionCardProps } from "./SessionCard";
import { SessionPanel } from "./SessionPanel";
import { StatusBar, type OutOfDate } from "./StatusBar";
import { UnscheduledList } from "./UnscheduledList";
import type { SyncStatus } from "./useEditorSocket";

const GRID_LABEL = "Weekly timetable grid";
const FALLBACK_COLUMN_PX = 176;
const FOCUS_WINDOW_MS = 3000;

type Origin = "grid" | "list";

interface DragInfo {
  sessionId: string;
  origin: Origin;
  width: number;
  height: number;
  target: DropTarget | null;
}

const gridDragId = (sessionId: string) => `grid:${sessionId}`;

const NO_VALID_START =
  "This term's grid has no valid start time: the day start must line up with both the 15-minute rule and the term grid. Change the day start or grid in Term setup.";

/** Day columns as currently laid out, clipped horizontally to the grid's scroll container (a column scrolled out of view is not a drop target). */
function readColumns(root: HTMLElement | null): DayColumnRect[] {
  if (!root) return [];
  const container = root.querySelector<HTMLElement>(`[role="region"][aria-label="${GRID_LABEL}"]`)?.getBoundingClientRect();
  const out: DayColumnRect[] = [];
  root.querySelectorAll<HTMLElement>("[data-grid-day]").forEach((el) => {
    const r = el.getBoundingClientRect();
    const left = container ? Math.max(r.left, container.left) : r.left;
    const right = container ? Math.min(r.right, container.right) : r.right;
    const weekday = Number(el.dataset.weekday);
    const dayStart = Number(el.dataset.dayStart);
    const ppm = Number(el.dataset.pxPerMinute);
    if (right <= left || !Number.isFinite(weekday) || !Number.isFinite(dayStart) || !(ppm > 0)) return;
    out.push({ weekday, dayStart, pxPerMinute: ppm, left, top: r.top, width: right - left, height: r.height });
  });
  return out;
}

const targetText = (t: DropTarget | null, duration: number) =>
  t ? `${WEEKDAY_LABELS[t.weekday]} ${minToTime(t.start_min)}–${minToTime(t.start_min + duration)}` : "Drop on a day column";

/** Shown (and edits refused) while a generation run is queued or running: the run writes placements itself. */
export const GENERATION_PAUSED_REASON = "A timetable generation is running. Editing is paused until it finishes.";

/** A card on the grid that can be dragged unless it is locked or the board is read-only (`readOnlyReason` says why). */
function DraggableCard({ cardProps, readOnlyReason }: { cardProps: SessionCardProps; readOnlyReason: string | null }) {
  const { session } = cardProps;
  const readOnly = readOnlyReason !== null;
  const disabled = session.locked || readOnly;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: gridDragId(session.id),
    data: { sessionId: session.id, origin: "grid" satisfies Origin },
    disabled,
  });
  // dnd-kit's aria-pressed would shadow the card's own selection state.
  const { "aria-pressed": _ignored, ...dndAttributes } = attributes as typeof attributes & { "aria-pressed"?: unknown };
  void _ignored;

  const reason = session.locked
    ? `${session.subject_code} is locked. Unlock it in the session panel to move or unplace it.`
    : readOnly
      ? readOnlyReason
      : undefined;

  return (
    <SessionCard
      ref={setNodeRef}
      {...cardProps}
      {...(disabled ? {} : dndAttributes)}
      {...(disabled ? {} : listeners)}
      {...(reason ? { title: reason } : {})}
      className={cn(cardProps.className, !disabled && "cursor-grab touch-none active:cursor-grabbing", disabled && "cursor-default", isDragging && "opacity-40")}
    />
  );
}

export interface EditorBoardProps {
  snapshot: Snapshot;
  versionId: string;
  clientId: string;
  /** The active division (resolved by the page; null only when the term has no divisions). */
  divisionId: string | null;
  onDivisionChange: (divisionId: string) => void;
  sync: SyncStatus;
  /** Set when the snapshot query is in error but cached data is still shown (see StatusBar). */
  outOfDate?: OutOfDate;
  /** A generation run is queued or running for this version: the board is read-only (banner, no drag, click-to-place, ops, lock). */
  generationActive?: boolean;
}

export function EditorBoard({ snapshot, versionId, clientId, divisionId, onDivisionChange, sync, outOfDate, generationActive = false }: EditorBoardProps) {
  const { term } = snapshot;
  const { apply, pending, lastRejection, reject, dismissRejection } = useApplyOps(versionId, clientId);
  const boardRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const overlayCardRef = useRef<HTMLDivElement>(null);
  const focusAfter = useRef<{ id: string; kind: "card" | "item"; at: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [previewSlot, setPreviewSlot] = useState<PreviewSlot | null>(null);
  // Set while an issue click waits for the page to switch the division: the selection effect below must not drop it meanwhile.
  const pendingDivision = useRef<string | null>(null);
  const scrollAfter = useRef<{ id: string; at: number } | null>(null);
  const qc = useQueryClient();

  const isDraft = snapshot.version.status === "draft";
  // A day start that is not a multiple of 15 can leave no start that satisfies both the 15-minute and the grid rule.
  const noValidStart = firstValidStart(term) == null;
  // Not a draft, or a generation is writing placements: nothing may be edited meanwhile.
  const canEdit = isDraft && !generationActive;
  const readOnlyReason = !isDraft
    ? `This version is ${snapshot.version.status}, so it cannot be edited. Only the draft can.`
    : generationActive
      ? GENERATION_PAUSED_REASON
      : null;

  const batchMap = useMemo(() => batchToDivisionMap(snapshot.divisions), [snapshot.divisions]);
  const counts = useMemo(() => countByDivision(snapshot.sessions, batchMap), [snapshot.sessions, batchMap]);
  const divisionSessions = useMemo(
    () => (divisionId ? sessionsOfDivision(snapshot.sessions, divisionId, batchMap) : []),
    [snapshot.sessions, divisionId, batchMap],
  );
  const byId = useMemo(() => new Map(snapshot.sessions.map((s) => [s.id, s])), [snapshot.sessions]);
  const roomNames = useMemo(() => new Map(snapshot.rooms.map((r) => [r.room_id, r.name])), [snapshot.rooms]);
  const roomName = useCallback((id: string) => roomNames.get(id) ?? "Room", [roomNames]);

  const division = snapshot.divisions.find((d) => d.id === divisionId) ?? null;
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const dragSession = drag ? byId.get(drag.sessionId) : undefined;
  const divisionCounts = (divisionId && counts[divisionId]) || { placed: 0, unplaced: 0, total: 0 };

  // ---------------------------------------------------------------- diagnostics

  const diagnosticsQuery = useDiagnostics(versionId);
  const diagnostics = diagnosticsQuery.data ?? null;
  // A rev jump the edit/socket paths did not cover (e.g. diagnostics and snapshot loaded either side of another admin's edit)
  // can leave the issues older than the grid: reload them once per revision. It goes through the same 300 ms trailing
  // scheduler as the edit paths, so it joins their refetch instead of adding a second one.
  const refreshedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!diagnostics || diagnosticsQuery.isFetching) return;
    if (diagnosticsBehind(diagnostics.rev, snapshot.rev) && refreshedFor.current !== snapshot.rev) {
      refreshedFor.current = snapshot.rev;
      refreshDiagnosticsSoon(qc, versionId);
    }
  }, [diagnostics, diagnosticsQuery.isFetching, snapshot.rev, qc, versionId]);

  const issues = diagnostics?.issues;
  const severityBySession = useMemo(() => worstSeverityBySession(issues ?? []), [issues]);
  const issueCountBySession = useMemo(() => {
    const out = new Map<string, number>();
    issuesBySession(issues ?? []).forEach((list, id) => out.set(id, list.length));
    return out;
  }, [issues]);
  const divisionLabel = useCallback(
    (id: string) => {
      const d = snapshot.divisions.find((x) => x.id === id);
      return d ? `${d.semester ? `Sem ${d.semester} ` : ""}${d.name}` : "Division";
    },
    [snapshot.divisions],
  );

  const clearIssueFocus = useCallback(() => {
    setActiveIssueId(null);
    setHighlightedIds([]);
    pendingDivision.current = null;
  }, []);

  // The active issue was fixed (or went away with a refreshed list): drop its highlight instead of leaving stale marks.
  useEffect(() => {
    if (activeIssueId && diagnostics && !diagnosticsQuery.isPlaceholderData && !hasIssue(diagnostics.issues, activeIssueId)) {
      clearIssueFocus();
    }
  }, [activeIssueId, diagnostics, diagnosticsQuery.isPlaceholderData, clearIssueFocus]);

  const onSelectIssue = (issue: Issue) => {
    if (toggleIssueId(activeIssueId, issue.id) === null) {
      clearIssueFocus();
      return;
    }
    const divisionOfSession = (id: string) => {
      const s = byId.get(id);
      return s ? batchMap.get(s.batch_id) : undefined;
    };
    const pick = pickIssueSelection(issue, byId, divisionOfSession, divisionId);
    setActiveIssueId(issue.id);
    setHighlightedIds(pick.highlightIds);
    setPreviewSlot(null);
    // Show the division of the session we select (an issue without a division can span several).
    const targetDivision = (pick.selectId && divisionOfSession(pick.selectId)) || issue.division_id;
    if (targetDivision && targetDivision !== divisionId) {
      pendingDivision.current = targetDivision;
      onDivisionChange(targetDivision);
    } else {
      pendingDivision.current = null;
    }
    setSelectedId(pick.selectId);
    if (pick.selectId) scrollAfter.current = { id: pick.selectId, at: Date.now() };
  };

  // ---------------------------------------------------------------- shading (candidates)

  // The selected session's candidate slots are fetched as soon as it is selected (react-query dedupes), so they are ready at drag start.
  const shadeTarget = dragSession ?? selected;
  const shadeEnabled = canEdit && !!shadeTarget && !shadeTarget.locked;
  const candidatesQuery = useCandidates(shadeTarget?.id, { versionId, rev: snapshot.rev, enabled: shadeEnabled });
  // While the answer for the new revision loads, react-query keeps the previous revision's slots: they may be taken by now, so
  // they are not shown (the client preflight covers a drag meanwhile).
  const candidates = candidatesQuery.isPlaceholderData ? undefined : candidatesQuery.data?.candidates;
  const shadingMap = useMemo(() => (candidates ? candidatesToShading(candidates, term) : null), [candidates, term]);
  const shading: GridShading | null =
    shadeEnabled && shadeTarget && (drag !== null || shadingMap) ? { map: shadingMap, durationMin: shadeTarget.duration_min } : null;
  const termCounts = useMemo(() => {
    const placed = snapshot.sessions.filter(isPlaced).length;
    return { placed, total: snapshot.sessions.length };
  }, [snapshot.sessions]);

  // Drop the selection when its session vanishes (another admin's change) or is not in the shown division.
  useEffect(() => {
    if (pendingDivision.current) {
      if (divisionId !== pendingDivision.current) return; // the division switch an issue click asked for is still on its way
      pendingDivision.current = null;
    }
    if (selectedId && (!selected || !divisionSessions.some((s) => s.id === selectedId))) setSelectedId(null);
  }, [selectedId, selected, divisionSessions, divisionId]);

  // A preview belongs to the selected session's panel.
  useEffect(() => setPreviewSlot(null), [selectedId]);

  // After an issue click: bring the session's card into view once its division has rendered.
  useEffect(() => {
    const want = scrollAfter.current;
    if (!want) return;
    if (Date.now() - want.at > FOCUS_WINDOW_MS) {
      scrollAfter.current = null;
      return;
    }
    const el = boardRef.current?.querySelector<HTMLElement>(`[data-session-id="${want.id}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      scrollAfter.current = null;
    }
  }, [divisionSessions, selectedId]);

  // Focus follows the session after a place / unplace: the card on the grid, or its item in the list.
  useEffect(() => {
    const want = focusAfter.current;
    if (!want) return;
    if (Date.now() - want.at > FOCUS_WINDOW_MS) {
      focusAfter.current = null;
      return;
    }
    const selector = want.kind === "card" ? `[data-session-id="${want.id}"]` : `[data-item-id="${want.id}"]`;
    const el = boardRef.current?.querySelector<HTMLElement>(selector);
    if (el) {
      el.focus({ preventScroll: true });
      focusAfter.current = null;
    }
  }, [snapshot.sessions]);

  // Live pointer position (viewport pixels) while a drag is running; see visibleRect().
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const onMove = (ev: PointerEvent) => {
      pointerRef.current = { x: ev.clientX, y: ev.clientY };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [dragging]);

  // ---------------------------------------------------------------- edits

  const requestPlacement = useCallback(
    (session: PlannerSession, weekday: number, start_min: number) => {
      if (!canEdit) return;
      if (session.locked) {
        const message = `${session.subject_code} is locked. Unlock it before moving it.`;
        reject(message, session.id);
        toast({ title: "That change was not applied", description: message, variant: "destructive" });
        return;
      }
      if (isPlaced(session) && session.weekday === weekday && session.start_min === start_min) return;
      const problem = preflightPlacement(term, weekday, start_min, session.duration_min);
      if (problem) {
        reject(problem, session.id);
        toast({ title: "That change was not applied", description: problem, variant: "destructive" });
        return;
      }
      focusAfter.current = { id: session.id, kind: "card", at: Date.now() };
      apply([{ op: isPlaced(session) ? "move" : "place", session_id: session.id, weekday, start_min }]);
    },
    [apply, canEdit, reject, term],
  );

  const unplace = useCallback(
    (session: PlannerSession) => {
      if (!canEdit || session.locked || !isPlaced(session)) return;
      focusAfter.current = { id: session.id, kind: "item", at: Date.now() };
      apply([{ op: "unplace", session_id: session.id }]);
    },
    [apply, canEdit],
  );

  // Edits from the session panel (including 'Place here' / 'Move here'): a place/move brings focus to the card afterwards.
  const applyFromPanel = useCallback(
    (ops: PlannerOp[]) => {
      if (!canEdit) return;
      if (ops.length === 1 && (ops[0].op === "place" || ops[0].op === "move")) {
        focusAfter.current = { id: ops[0].session_id, kind: "card", at: Date.now() };
      }
      apply(ops);
    },
    [apply, canEdit],
  );

  const onSlotClick = (weekday: number, start_min: number) => {
    if (selected) requestPlacement(selected, weekday, start_min);
  };

  // ---------------------------------------------------------------- drag and drop

  const coordinateGetter: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
    const column = boardRef.current?.querySelector<HTMLElement>("[data-grid-day]");
    const dx = column?.getBoundingClientRect().width || FALLBACK_COLUMN_PX;
    const { x, y } = currentCoordinates;
    switch (event.code) {
      case "ArrowRight":
        event.preventDefault();
        return { x: x + dx, y };
      case "ArrowLeft":
        event.preventDefault();
        return { x: x - dx, y };
      case "ArrowDown":
        event.preventDefault();
        return { x, y: y + PX_PER_STEP };
      case "ArrowUp":
        event.preventDefault();
        return { x, y: y - PX_PER_STEP };
      default:
        return undefined;
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // M (move) starts a keyboard drag so Enter and Space stay "select" on cards and list items.
    useSensor(KeyboardSensor, {
      keyboardCodes: { start: ["KeyM"], cancel: ["Escape"], end: ["Enter", "NumpadEnter"] },
      coordinateGetter,
    }),
  );

  /**
   * The rectangle the user sees the dragged thing occupying, in viewport pixels, matching the column rects that are
   * read fresh from the DOM. dnd-kit's event.delta is NOT used: it is the pointer movement plus the scroll offsets of
   * the dragged node's scrollable ancestors, so after an autoscroll it no longer describes where the overlay is.
   */
  const visibleRect = (e: DragMoveEvent | DragEndEvent, origin: Origin): RectLike | null => {
    const ev = e.activatorEvent as Partial<PointerEvent>;
    const pointer = pointerRef.current;
    if (typeof ev.clientX === "number" && typeof ev.clientY === "number" && pointer) {
      if (origin === "list") {
        // Dropping an item from the list: the pointer's row picks the slot, not the item's grab offset.
        const half = (effectiveStep(term) * pxPerMinute) / 2;
        return { left: pointer.x, top: pointer.y - half, width: 0, height: 0 };
      }
      const initial = e.active.rect.current.initial;
      if (!initial) return null;
      return {
        left: initial.left + (pointer.x - ev.clientX),
        top: initial.top + (pointer.y - ev.clientY),
        width: initial.width,
        height: initial.height,
      };
    }
    // Keyboard drag: the overlay card is exactly where the user has moved it.
    const r = overlayCardRef.current?.getBoundingClientRect();
    return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
  };

  /** Where would the dragged thing land right now? */
  const targetFor = (e: DragMoveEvent | DragEndEvent, session: PlannerSession, origin: Origin): DropTarget | null => {
    const rect = visibleRect(e, origin);
    return rect ? resolveDrop(rect, readColumns(boardRef.current), session.duration_min, term) : null;
  };

  const sessionOf = (data: unknown): { session: PlannerSession; origin: Origin } | null => {
    const d = data as { sessionId?: string; origin?: Origin } | undefined;
    const session = d?.sessionId ? byId.get(d.sessionId) : undefined;
    return session && d?.origin ? { session, origin: d.origin } : null;
  };

  const onDragStart = (e: DragStartEvent) => {
    const hit = sessionOf(e.active.data.current);
    if (!hit) return;
    const initial = e.active.rect.current.initial;
    const ev = e.activatorEvent as Partial<PointerEvent>;
    pointerRef.current = typeof ev.clientX === "number" && typeof ev.clientY === "number" ? { x: ev.clientX, y: ev.clientY } : null;
    setSelectedId(hit.session.id);
    setDrag({
      sessionId: hit.session.id,
      origin: hit.origin,
      width: initial?.width ?? 160,
      height: initial?.height ?? 40,
      target: null,
    });
  };

  const onDragMove = (e: DragMoveEvent) => {
    const hit = sessionOf(e.active.data.current);
    if (!hit) return;
    const target = targetFor(e, hit.session, hit.origin);
    setDrag((prev) =>
      prev && (prev.target?.weekday !== target?.weekday || prev.target?.start_min !== target?.start_min) ? { ...prev, target } : prev,
    );
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDrag(null);
    const hit = sessionOf(e.active.data.current);
    if (!hit) return;
    const target = targetFor(e, hit.session, hit.origin);
    if (target) {
      requestPlacement(hit.session, target.weekday, target.start_min);
    } else if (canEdit) {
      // Released outside every day column (or the term has no valid start): say so instead of doing nothing.
      toast({
        title: "Not placed",
        description: noValidStart ? NO_VALID_START : "Drop onto a day column.",
      });
    }
  };

  // ---------------------------------------------------------------- keyboard

  const onBoardKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape" || drag || e.defaultPrevented) return;
    // Escape inside an open select / popover / dialog belongs to that widget.
    if ((e.target as HTMLElement).closest('[role="listbox"],[role="dialog"],[role="menu"]')) return;
    setSelectedId(null);
    clearIssueFocus();
  };

  const onGridKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if ((e.key !== "Delete" && e.key !== "Backspace") || !selected || e.defaultPrevented) return;
    const el = e.target as HTMLElement;
    if (el.closest("input,textarea,select,[contenteditable],[role=listbox],[role=dialog]")) return;
    if (!isPlaced(selected) || selected.locked || !canEdit) return;
    e.preventDefault();
    unplace(selected);
  };

  // ---------------------------------------------------------------- render

  const renderCard = useCallback(
    (props: SessionCardProps) => <DraggableCard cardProps={props} readOnlyReason={readOnlyReason} />,
    [readOnlyReason],
  );

  const guide = !canEdit
    ? null
    : selected
      ? selected.locked
        ? `${selected.subject_code} is locked. Unlock it in the panel to move it.`
        : isPlaced(selected)
          ? `Selected ${selected.subject_code}. Click an empty slot to move it, press Delete to unplace it, or drag it.`
          : `Selected ${selected.subject_code}. Click an empty slot to place it, or drag it onto the grid.`
      : "Select a session, then click an empty slot to place it. Or drag a session onto the grid. Locked sessions cannot be dragged.";
  const legend = shading ? "Green = valid slot (darker is a better fit), hatched = not recommended (may break a rule)." : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDrag(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "To pick up this session press M. Use the arrow keys to move it across days and times, Enter to drop it, Escape to cancel. You can also press Enter to select it and then activate an empty slot on the grid.",
        },
        announcements: {
          onDragStart: ({ active }) => `Picked up ${sessionOf(active.data.current)?.session.subject_code ?? "session"}.`,
          onDragMove: () => undefined,
          onDragOver: () => undefined,
          onDragEnd: () => "Dropped. The grid updates, or a message explains why the slot was refused.",
          onDragCancel: () => "Move cancelled.",
        },
      }}
    >
      <div ref={boardRef} onKeyDown={onBoardKeyDown} className="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_20rem]">
        {/* Left: divisions, then what still needs placing */}
        <aside className="space-y-4 lg:row-span-2 xl:row-span-1 xl:row-start-1 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
          <div className="max-h-56 overflow-y-auto lg:max-h-none lg:overflow-visible">
            <DivisionSidebar divisions={snapshot.divisions} counts={counts} activeId={divisionId} issueCounts={diagnostics?.by_division} onSelect={(id) => { setSelectedId(null); clearIssueFocus(); onDivisionChange(id); }} />
          </div>
          {division && <UnscheduledList sessions={divisionSessions} selectedId={selectedId} onSelect={setSelectedId} disabled={!canEdit} />}
        </aside>

        {/* Centre: messages, grid, status */}
        <div className="min-w-0 space-y-3 lg:col-start-2 xl:row-start-1">
          {readOnlyReason && (
            <Alert>
              <Info className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{readOnlyReason}</AlertDescription>
            </Alert>
          )}

          {lastRejection && (
            <Alert variant="destructive" role="alert">
              <AlertDescription className="flex items-start justify-between gap-3">
                <span>{lastRejection.message}</span>
                <button
                  type="button"
                  onClick={dismissRejection}
                  className="flex shrink-0 items-center gap-1 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Dismiss this message"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Dismiss
                </button>
              </AlertDescription>
            </Alert>
          )}

          {noValidStart && (
            <Alert variant="destructive">
              <AlertDescription>{NO_VALID_START}</AlertDescription>
            </Alert>
          )}

          {guide && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {guide}
                {legend && (
                  <>
                    {" "}
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm border border-status-success-border bg-status-success" />
                      {legend}
                    </span>
                  </>
                )}
              </span>
              {selected && (
                <button type="button" onClick={() => setSelectedId(null)} className="ml-auto shrink-0 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Deselect
                </button>
              )}
            </p>
          )}

          {division ? (
            <>
              {divisionSessions.length === 0 && (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  {division.semester ? `Semester ${division.semester} ` : ""}
                  {division.name} has no sessions in this draft yet. Open Term setup and use Generate sessions.
                </p>
              )}
              <div onKeyDown={onGridKeyDown}>
                <EditorGrid
                  term={term}
                  sessions={divisionSessions}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onSlotClick={canEdit && selected && !selected.locked ? onSlotClick : undefined}
                  roomName={roomName}
                  renderCard={renderCard}
                  severityBySession={severityBySession}
                  issueCountBySession={issueCountBySession}
                  highlightedIds={highlightedIds}
                  shading={shading}
                  previewSlot={previewSlot}
                />
              </div>
            </>
          ) : (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              This term has no divisions. Add divisions in Term setup first.
            </p>
          )}

          <DiagnosticsPanel
            diagnostics={diagnostics}
            loading={diagnosticsQuery.isLoading}
            error={diagnosticsQuery.isError}
            updating={diagnosticsQuery.isFetching && !diagnosticsQuery.isLoading}
            onRetry={() => void diagnosticsQuery.refetch()}
            divisionId={divisionId}
            divisionLabel={divisionLabel}
            activeIssueId={activeIssueId}
            onSelectIssue={onSelectIssue}
          />

          <StatusBar
            divisionName={division ? `${division.semester ? `Sem ${division.semester} ` : ""}${division.name}` : null}
            division={{ placed: divisionCounts.placed, total: divisionCounts.total }}
            term={termCounts}
            versionStatus={snapshot.version.status}
            rev={snapshot.rev}
            sync={sync}
            outOfDate={outOfDate}
            saving={pending}
            diagnostics={diagnostics}
          />
        </div>

        {/* Right: the selected session (below the grid on narrower screens) */}
        <aside className={cn("lg:col-start-2 xl:col-start-3 xl:row-start-1", !selected && "hidden xl:block")}>
          <SessionPanel
            session={selected}
            faculty={snapshot.faculty}
            rooms={snapshot.rooms}
            readOnlyReason={readOnlyReason}
            rejection={lastRejection}
            onOps={applyFromPanel}
            versionId={versionId}
            rev={snapshot.rev}
            applying={pending > 0}
            suggestionsEnabled={canEdit}
            onPreviewSlot={setPreviewSlot}
            onDismissRejection={dismissRejection}
            onClose={() => setSelectedId(null)}
          />
        </aside>
      </div>

      <DragOverlay dropAnimation={null}>
        {drag && dragSession ? (
          <div className="pointer-events-none" aria-hidden="true">
            {drag.origin === "grid" ? (
              <div ref={overlayCardRef} style={{ width: drag.width, height: drag.height }}>
                <SessionCard session={dragSession} height={drag.height} selected style={{ width: drag.width, height: drag.height }} />
              </div>
            ) : (
              <div ref={overlayCardRef} className="flex w-48 items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm shadow-lg">
                {dragSession.kind === "lab" ? <FlaskConical className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                <span className="font-medium">{dragSession.subject_code}</span>
                <span className="ml-auto text-xs text-muted-foreground">{dragSession.duration_min}m</span>
              </div>
            )}
            <div className="mt-1 inline-block rounded bg-foreground px-2 py-0.5 text-xs text-background shadow">
              {targetText(drag.target, dragSession.duration_min)}
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
