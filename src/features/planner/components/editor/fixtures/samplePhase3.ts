// Static Phase 3 sample data (diagnostics, candidates, suggestions, generation runs), consistent with sampleSnapshot.ts
// (term-1, division div-a "CSE-A Sem 3", sessions s-dsa-1 / s-dsal-a1..a3 / s-os-1 / s-os-2, rooms room-301 / lab-1..3).
// Not imported by production code. Use it in tests and for visual/dev work.
//
// Exports:
//   SAMPLE_VERSION_ID                        "ver-1"
//   sampleDiagnostics                        one hard (s-os-2 unplaced) + two soft issues, not publishable
//   sampleDiagnosticsClean                   no issues, publishable
//   sampleDiagnosticsBlocking                a faculty clash (blocking) on the Tuesday labs
//   sampleCandidates                         CandidatesResponse for s-os-2 (60 min theory, whole division, NKJ)
//   sampleSuggestions                        SuggestionsResponse for s-os-2 (3 suggestions, best first)
//   sampleSuggestionsNone                    SuggestionsResponse for the locked s-os-1 (none_reason LOCKED)
//   sampleRunRunning                         a run in the labs stage at 32 %
//   sampleRunSucceeded                       a finished run: 118 of 121 placed, 3 unplaced for 3 different reasons
//   sampleRunFailed                          a run that failed (SERVER_RESTART)
//   sampleRunsResponse                       GenerationRunsResponse: the succeeded run only, nothing active
//   sampleRunsActiveResponse                 GenerationRunsResponse: the running run active, the succeeded one older

import type {
  CandidatesResponse,
  DiagnosticsResponse,
  GenerationRun,
  GenerationRunsResponse,
  SuggestionsResponse,
} from "../../../types";

export const SAMPLE_VERSION_ID = "ver-1";

// ---------------------------------------------------------------- Diagnostics

export const sampleDiagnostics: DiagnosticsResponse = {
  rev: 12,
  publishable: false,
  counts: { blocking: 0, hard: 1, soft: 2 },
  by_division: { "div-a": { hard: 1, soft: 2 } },
  issues: [
    {
      id: "all_placed:s-os-2",
      rule_key: "all_placed",
      severity: "hard",
      message: "OS (ALL) of CSE-A (Sem 3) is not placed yet (lecture 2 of 2).",
      session_ids: ["s-os-2"],
      division_id: "div-a",
      faculty_id: "f-nkj",
      weekday: null,
      fix_hint: "Drag it from the unscheduled list onto a free slot.",
    },
    {
      id: "time_of_day:s-dsa-1",
      rule_key: "time_of_day",
      severity: "soft",
      message: "DSA for CSE-A (Sem 3) starts at 09:30, before the core teaching window (10:45-15:30).",
      session_ids: ["s-dsa-1"],
      division_id: "div-a",
      faculty_id: null,
      weekday: 0,
    },
    {
      id: "time_of_day:s-os-1",
      rule_key: "time_of_day",
      severity: "soft",
      message: "OS for CSE-A (Sem 3) starts at 08:30, before the core teaching window (10:45-15:30).",
      session_ids: ["s-os-1"],
      division_id: "div-a",
      faculty_id: null,
      weekday: 2,
    },
  ],
};

export const sampleDiagnosticsClean: DiagnosticsResponse = {
  rev: 12,
  publishable: true,
  counts: { blocking: 0, hard: 0, soft: 0 },
  by_division: {},
  issues: [],
};

export const sampleDiagnosticsBlocking: DiagnosticsResponse = {
  rev: 13,
  publishable: false,
  counts: { blocking: 1, hard: 0, soft: 0 },
  by_division: { "div-a": { hard: 1, soft: 0 } },
  issues: [
    {
      id: "faculty_clash:f-nkj:1:s-dsal-a2,s-dsal-a3",
      rule_key: "faculty_clash",
      severity: "blocking",
      message: "N. K. Joshi (NKJ) teaches DSAL to A2 and A3 at the same time on Tuesday 10:45-12:45.",
      session_ids: ["s-dsal-a2", "s-dsal-a3"],
      division_id: "div-a",
      faculty_id: "f-nkj",
      weekday: 1,
    },
  ],
};

// ---------------------------------------------------------------- Candidates and suggestions

const slot = (weekday: number, start_min: number, score: number) => ({
  weekday,
  start_min,
  end_min: start_min + 60,
  room_id: "room-301",
  room_name: "R-301",
  score,
});

/** Free 60-minute slots for s-os-2 (Mon-Fri, outside breaks), best (lowest) score first. */
export const sampleCandidates: CandidatesResponse = {
  rev: 12,
  session_id: "s-os-2",
  candidates: [
    slot(3, 645, 2),
    slot(0, 645, 4),
    slot(4, 705, 6),
    slot(2, 645, 8),
    slot(3, 570, 11),
    slot(1, 810, 14),
    slot(4, 810, 15),
    slot(0, 810, 19),
    slot(2, 870, 24),
    slot(4, 960, 31),
  ],
};

export const sampleSuggestions: SuggestionsResponse = {
  rev: 12,
  session_id: "s-os-2",
  suggestions: [
    {
      ...sampleCandidates.candidates[0],
      reason: "Thursday 10:45 keeps CSE-A in R-301, no new gap, N. K. Joshi stays at 1 h that day",
      ops: [{ op: "place", session_id: "s-os-2", weekday: 3, start_min: 645, room_id: "room-301" }],
    },
    {
      ...sampleCandidates.candidates[1],
      reason: "Monday 10:45 sits right after DSA, no new gap",
      ops: [{ op: "place", session_id: "s-os-2", weekday: 0, start_min: 645, room_id: "room-301" }],
    },
    {
      ...sampleCandidates.candidates[2],
      reason: "Friday 11:45 keeps CSE-A in R-301; Friday has no other class yet",
      ops: [{ op: "place", session_id: "s-os-2", weekday: 4, start_min: 705, room_id: "room-301" }],
    },
  ],
};

export const sampleSuggestionsNone: SuggestionsResponse = {
  rev: 12,
  session_id: "s-os-1",
  suggestions: [],
  none_reason: {
    code: "LOCKED",
    text: "This session is locked. Unlock it to move it.",
    slots: { total: 0, free: 0, faculty: 0, batch: 0, room: 0 },
  },
};

// ---------------------------------------------------------------- Generation runs

const baseRun: GenerationRun = {
  id: "run-1",
  version_id: SAMPLE_VERSION_ID,
  term_id: "term-1",
  mode: "fill_unplaced",
  scope: { division_ids: null },
  options: { seeds: 3 },
  seed: null,
  status: "queued",
  stage: "queued",
  progress_percent: 0,
  stats: null,
  unplaced: [],
  after_rev: null,
  undone_at: null,
  error_code: null,
  error_message: null,
  created_at: "2026-11-16T10:00:00Z",
  started_at: null,
  finished_at: null,
};

export const sampleRunRunning: GenerationRun = {
  ...baseRun,
  id: "run-2",
  status: "running",
  stage: "labs",
  progress_percent: 32,
  created_at: "2026-11-16T11:00:00Z",
  started_at: "2026-11-16T11:00:01Z",
};

export const sampleRunSucceeded: GenerationRun = {
  ...baseRun,
  id: "run-1",
  status: "succeeded",
  stage: "done",
  progress_percent: 100,
  seed: 7,
  stats: {
    requested: 121,
    placed: 118,
    unplaced: 3,
    seeds_tried: 3,
    best_seed: 7,
    score: 1840,
    repair_moves: 12,
    duration_ms: 4200,
    by_kind: { lab: { placed: 40, total: 40 }, theory: { placed: 78, total: 81 } },
  },
  unplaced: [
    {
      session_id: "s-os-2",
      key: "div-a:OS:ALL:2",
      division_id: "div-a",
      subject_code: "OS",
      batch_name: "ALL",
      kind: "theory",
      code: "FACULTY_BUSY",
      text: "N. K. Joshi is already teaching in every free slot of CSE-A.",
    },
    {
      session_id: "s-dsa-2",
      key: "div-a:DSA:ALL:2",
      division_id: "div-a",
      subject_code: "DSA",
      batch_name: "ALL",
      kind: "theory",
      code: "NO_ROOM",
      text: "No classroom is free when CSE-A and the teacher are both free.",
    },
    {
      session_id: "s-dsa-3",
      key: "div-a:DSA:ALL:3",
      division_id: "div-a",
      subject_code: "DSA",
      batch_name: "ALL",
      kind: "theory",
      code: "SERVER_REFUSED",
      text: "The server refused this placement (a newer edit got there first).",
    },
  ],
  after_rev: 12,
  created_at: "2026-11-16T10:00:00Z",
  started_at: "2026-11-16T10:00:01Z",
  finished_at: "2026-11-16T10:00:05Z",
};

export const sampleRunFailed: GenerationRun = {
  ...baseRun,
  id: "run-0",
  status: "failed",
  stage: "loading",
  progress_percent: 5,
  error_code: "SERVER_RESTART",
  error_message: "The server restarted while the run was in progress.",
  created_at: "2026-11-16T09:00:00Z",
  started_at: "2026-11-16T09:00:01Z",
  finished_at: "2026-11-16T09:05:00Z",
};

export const sampleRunsResponse: GenerationRunsResponse = {
  runs: [sampleRunSucceeded, sampleRunFailed],
  active: null,
};

export const sampleRunsActiveResponse: GenerationRunsResponse = {
  runs: [sampleRunRunning, { ...sampleRunSucceeded, id: "run-1" }],
  active: sampleRunRunning,
};
