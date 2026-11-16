// Static sample data for visual/dev use of EditorGrid and SessionCard. Not imported by production code.
//
// Exports:
//   sampleTerm                Term (Mon-Fri, 08:30-17:45, 15-min grid, the three default breaks)
//   sampleDivision            DivisionWithBatches (CSE-A, Sem 3) with the hidden whole batch "ALL" plus A1..A3
//   sampleBatches             the three non-whole batches (A1, A2, A3)
//   sampleRooms               {id,name}[] for roomName lookups
//   sampleRoomName(id)        room name lookup
//   sampleSessions            PlannerSession[]: a theory lecture, three parallel 120-min batch labs,
//                             one locked lecture and one unplaced lecture
//   sampleSnapshot            all of the above in one object

import type { DivisionWithBatches, PlannerSession, Term } from "../../../types";

export const sampleTerm: Term = {
  id: "term-1",
  academic_year: "2026-27",
  half: "odd",
  branch: "CSE",
  start_date: "2026-07-20",
  end_date: "2026-10-30",
  working_days: [0, 1, 2, 3, 4],
  day_start_min: 510,
  day_end_min: 1065,
  grid_minutes: 15,
  theory_minutes: 60,
  lab_minutes: 120,
  breaks: [
    { start_min: 630, end_min: 645, label: "Short break 1" },
    { start_min: 765, end_min: 810, label: "Lunch" },
    { start_min: 930, end_min: 945, label: "Short break 2" },
  ],
  created_by: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

export const sampleDivision: DivisionWithBatches = {
  id: "div-a",
  term_id: sampleTerm.id,
  semester: 3,
  name: "A",
  student_count: 60,
  home_room_id: "room-301",
  batches: [
    { id: "b-all", division_id: "div-a", name: "ALL", student_count: 60, is_whole: true },
    { id: "b-a1", division_id: "div-a", name: "A1", student_count: 20, is_whole: false },
    { id: "b-a2", division_id: "div-a", name: "A2", student_count: 20, is_whole: false },
    { id: "b-a3", division_id: "div-a", name: "A3", student_count: 20, is_whole: false },
  ],
};

export const sampleBatches = sampleDivision.batches.filter((b) => !b.is_whole);

export const sampleRooms = [
  { id: "room-301", name: "R-301" },
  { id: "lab-1", name: "Lab 1" },
  { id: "lab-2", name: "Lab 2" },
  { id: "lab-3", name: "Lab 3" },
];

export const sampleRoomName = (id: string): string => sampleRooms.find((r) => r.id === id)?.name ?? "Room";

const dsa = { subject_code: "DSA", subject_name: "Data Structures", kind: "theory" as const, duration_min: 60 };
const dsaLab = { subject_code: "DSAL", subject_name: "Data Structures Lab", kind: "lab" as const, duration_min: 120 };
const os = { subject_code: "OS", subject_name: "Operating Systems", kind: "theory" as const, duration_min: 60 };

const sks = { faculty_id: "f-sks", short_code: "SKS", full_name: "S. K. Sharma" };
const apm = { faculty_id: "f-apm", short_code: "APM", full_name: "A. P. Mehta" };
const rvd = { faculty_id: "f-rvd", short_code: "RVD", full_name: "R. V. Desai" };
const nkj = { faculty_id: "f-nkj", short_code: "NKJ", full_name: "N. K. Joshi" };

export const sampleSessions: PlannerSession[] = [
  // Monday 09:30-10:30, whole division
  {
    id: "s-dsa-1", offering_id: "o-dsa", batch_id: "b-all", seq: 1,
    weekday: 0, start_min: 570, end_min: 630, room_id: "room-301", locked: false,
    ...dsa, batch_name: "ALL", faculty: [sks],
  },
  // Tuesday 10:45-12:45, three parallel batch labs
  {
    id: "s-dsal-a1", offering_id: "o-dsal", batch_id: "b-a1", seq: 1,
    weekday: 1, start_min: 645, end_min: 765, room_id: "lab-1", locked: false,
    ...dsaLab, batch_name: "A1", faculty: [apm, rvd],
  },
  {
    id: "s-dsal-a2", offering_id: "o-dsal", batch_id: "b-a2", seq: 1,
    weekday: 1, start_min: 645, end_min: 765, room_id: "lab-2", locked: false,
    ...dsaLab, batch_name: "A2", faculty: [nkj],
  },
  {
    id: "s-dsal-a3", offering_id: "o-dsal", batch_id: "b-a3", seq: 1,
    weekday: 1, start_min: 645, end_min: 765, room_id: "lab-3", locked: false,
    ...dsaLab, batch_name: "A3", faculty: [sks],
  },
  // Wednesday 08:30-09:30, locked
  {
    id: "s-os-1", offering_id: "o-os", batch_id: "b-all", seq: 1,
    weekday: 2, start_min: 510, end_min: 570, room_id: "room-301", locked: true,
    ...os, batch_name: "ALL", faculty: [nkj],
  },
  // Not placed yet
  {
    id: "s-os-2", offering_id: "o-os", batch_id: "b-all", seq: 2,
    weekday: null, start_min: null, end_min: null, room_id: null, locked: false,
    ...os, batch_name: "ALL", faculty: [nkj],
  },
];

export const sampleSnapshot = {
  term: sampleTerm,
  division: sampleDivision,
  batches: sampleBatches,
  rooms: sampleRooms,
  sessions: sampleSessions,
};
