// Immutable operations on PlannerSession[] used for optimistic UI and socket patches. Pure, no React.
// None of these mutate their inputs (session objects are replaced, never edited in place).
//
// Exports:
//   applyChanged(sessions, changed, opts?: {append?: boolean})   replace by id, keep order; unknown ids ignored unless append
//   optimisticPlace(session, {weekday,start_min,room_id?}, durationMin)   end_min = start + duration; omitted room keeps the current one
//   optimisticUnplace(session)                                    weekday/start/end/room -> null
//   optimisticLock(session, locked)
//   isPlaced(session)
//   countByDivision(sessions, batchToDivision)                    {[division_id]: {placed, unplaced, total}}
//   groupUnplacedBySubject(sessions) -> UnplacedGroup[]           sorted by subject_code, items by batch_name then seq

import type { PlannerSession, SubjectKind } from "../types";

export function applyChanged(
  sessions: PlannerSession[],
  changed: PlannerSession[],
  opts: { append?: boolean } = {},
): PlannerSession[] {
  if (!changed.length) return sessions.slice();
  const byId = new Map(changed.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const next = sessions.map((s) => {
    const replacement = byId.get(s.id);
    if (!replacement) return s;
    seen.add(s.id);
    return replacement;
  });
  if (opts.append) for (const s of byId.values()) if (!seen.has(s.id)) next.push(s);
  return next;
}

export interface PlacementTarget {
  weekday: number;
  start_min: number;
  /** Omit when the server will pick the room; the session keeps its current room (or null) meanwhile. */
  room_id?: string | null;
}

export function optimisticPlace(session: PlannerSession, target: PlacementTarget, durationMin: number): PlannerSession {
  return {
    ...session,
    weekday: target.weekday,
    start_min: target.start_min,
    end_min: target.start_min + durationMin,
    room_id: target.room_id === undefined ? session.room_id : target.room_id,
  };
}

export function optimisticUnplace(session: PlannerSession): PlannerSession {
  return { ...session, weekday: null, start_min: null, end_min: null, room_id: null };
}

export function optimisticLock(session: PlannerSession, locked: boolean): PlannerSession {
  return { ...session, locked };
}

export const isPlaced = (s: PlannerSession): boolean => s.weekday != null && s.start_min != null;

export interface DivisionCounts {
  placed: number;
  unplaced: number;
  total: number;
}

/** Sessions whose batch is not in the map are ignored. */
export function countByDivision(
  sessions: PlannerSession[],
  batchToDivision: Record<string, string> | Map<string, string>,
): Record<string, DivisionCounts> {
  const lookup = (batchId: string) => (batchToDivision instanceof Map ? batchToDivision.get(batchId) : batchToDivision[batchId]);
  const out: Record<string, DivisionCounts> = {};
  for (const s of sessions) {
    const division = lookup(s.batch_id);
    if (!division) continue;
    const c = (out[division] ??= { placed: 0, unplaced: 0, total: 0 });
    if (isPlaced(s)) c.placed += 1;
    else c.unplaced += 1;
    c.total += 1;
  }
  return out;
}

export interface UnplacedGroup {
  subject_code: string;
  subject_name: string;
  kind: SubjectKind;
  items: PlannerSession[];
  remaining: number;
}

const cmp = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

export function groupUnplacedBySubject(sessions: PlannerSession[]): UnplacedGroup[] {
  const groups = new Map<string, UnplacedGroup>();
  for (const s of sessions) {
    if (isPlaced(s)) continue;
    let g = groups.get(s.subject_code);
    if (!g) {
      g = { subject_code: s.subject_code, subject_name: s.subject_name, kind: s.kind, items: [], remaining: 0 };
      groups.set(s.subject_code, g);
    }
    g.items.push(s);
  }
  const out = [...groups.values()].sort((a, b) => cmp(a.subject_code, b.subject_code));
  for (const g of out) {
    g.items.sort((a, b) => cmp(a.batch_name, b.batch_name) || a.seq - b.seq);
    g.remaining = g.items.length;
  }
  return out;
}
