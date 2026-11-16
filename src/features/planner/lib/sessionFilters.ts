// Small pure helpers over snapshot data for the editor UI. No React.
//
// Exports:
//   sortDivisions(divisions)                       by semester, then name (natural order)
//   groupBySemester(divisions)                     [{semester, divisions}] in semester order
//   batchToDivisionMap(divisions)                  Map<batch_id, division_id>
//   sessionsOfDivision(sessions, divisionId, map)  the division's sessions (every batch, whole-division included)
//   percentPlaced(placed, total)                   whole percent 0..100, 0 when total is 0
//   applyOpsToSessions(sessions, ops, faculty)     optimistic preview of ops (place/move/unplace/lock/unlock/set_room/set_faculty);
//                                                  never mutates; unknown session ids are ignored
//   touchedSessionIds(ops)                         ids of the sessions the ops mention (for scoped rollback)

import type { DivisionWithBatches, PlannerOp, PlannerSession, SnapshotFaculty } from "../types";
import { optimisticLock, optimisticPlace, optimisticUnplace } from "./patch";

const natural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

export function sortDivisions<T extends { semester: number; name: string }>(divisions: T[]): T[] {
  return [...divisions].sort((a, b) => a.semester - b.semester || natural(a.name, b.name));
}

export function groupBySemester<T extends { semester: number; name: string }>(
  divisions: T[],
): { semester: number; divisions: T[] }[] {
  const out: { semester: number; divisions: T[] }[] = [];
  for (const d of sortDivisions(divisions)) {
    const last = out[out.length - 1];
    if (last && last.semester === d.semester) last.divisions.push(d);
    else out.push({ semester: d.semester, divisions: [d] });
  }
  return out;
}

export function batchToDivisionMap(divisions: Pick<DivisionWithBatches, "id" | "batches">[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const d of divisions) for (const b of d.batches) map.set(b.id, d.id);
  return map;
}

export function sessionsOfDivision(
  sessions: PlannerSession[],
  divisionId: string,
  batchToDivision: Map<string, string>,
): PlannerSession[] {
  return sessions.filter((s) => batchToDivision.get(s.batch_id) === divisionId);
}

export function percentPlaced(placed: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((placed / total) * 100)));
}

export function touchedSessionIds(ops: PlannerOp[]): string[] {
  return [...new Set(ops.map((o) => o.session_id))];
}

export function applyOpsToSessions(
  sessions: PlannerSession[],
  ops: PlannerOp[],
  faculty: Pick<SnapshotFaculty, "id" | "short_code" | "full_name">[] = [],
): PlannerSession[] {
  let next = sessions;
  for (const op of ops) {
    const idx = next.findIndex((s) => s.id === op.session_id);
    if (idx === -1) continue;
    const s = next[idx];
    let replaced: PlannerSession;
    switch (op.op) {
      case "place":
      case "move":
        replaced = optimisticPlace(s, { weekday: op.weekday, start_min: op.start_min, room_id: op.room_id }, s.duration_min);
        break;
      case "unplace":
        replaced = optimisticUnplace(s);
        break;
      case "lock":
        replaced = optimisticLock(s, true);
        break;
      case "unlock":
        replaced = optimisticLock(s, false);
        break;
      case "set_room":
        replaced = { ...s, room_id: op.room_id };
        break;
      case "set_faculty": {
        const byId = new Map(faculty.map((f) => [f.id, f]));
        replaced = {
          ...s,
          faculty: op.faculty_ids.map((id) => {
            const known = s.faculty.find((x) => x.faculty_id === id);
            if (known) return known;
            const f = byId.get(id);
            return { faculty_id: id, short_code: f?.short_code ?? "?", full_name: f?.full_name ?? "" };
          }),
        };
        break;
      }
      default:
        continue;
    }
    if (next === sessions) next = sessions.slice();
    next[idx] = replaced;
  }
  return next;
}
