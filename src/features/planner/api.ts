import { apiClient } from "@/lib/apiClient";
import type {
  AddTermRoomsInput,
  AvailableRoom,
  Batch,
  BatchInput,
  BatchPatch,
  CandidatesResponse,
  CreatedTerm,
  DiagnosticsResponse,
  Division,
  DivisionInput,
  DivisionPatch,
  DivisionWithBatches,
  Faculty,
  FacultyInput,
  FacultyListItem,
  FacultyPatch,
  GenerateRequest,
  GenerationRun,
  GenerationRunsResponse,
  ImportEntity,
  ImportResult,
  ImportTemplates,
  Offering,
  OfferingFacultyInput,
  OfferingInput,
  OfferingPatch,
  OpsRequest,
  OpsResponse,
  PlannerSession,
  ReadinessReport,
  RuleRow,
  RulesPatchBody,
  SessionsSummary,
  Snapshot,
  Subject,
  SubjectInput,
  SubjectPatch,
  SuggestionsResponse,
  SyncSessionsResult,
  Term,
  TermDetail,
  TermInput,
  TermListItem,
  TermPatch,
  TermRoom,
  UndoRunResponse,
} from "./types";

// All planner HTTP goes through apiClient, so 401 handling, REAUTH_REQUIRED re-prompts and
// ApiError (message / status / code / details) come for free. Each function returns the useful
// part of the `{ success, ... }` body, not the envelope. Errors are not caught here: they
// propagate as ApiError for hooks.ts to toast and for components to branch on `code`.

const BASE = "/planner";

/** Build `?a=1&b=2`, skipping undefined/null. Query strings live in the path (post/patch/put/del take no options). */
function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

const term = (termId: string) => `${BASE}/terms/${termId}`;

export const plannerApi = {
  // ---- Terms
  listTerms: async () => (await apiClient.get<{ terms: TermListItem[] }>(`${BASE}/terms`)).terms,
  getTerm: (termId: string) => apiClient.get<TermDetail>(term(termId)),
  createTerm: (input: TermInput) => apiClient.post<CreatedTerm>(`${BASE}/terms`, input),
  updateTerm: async (termId: string, patch: TermPatch) =>
    (await apiClient.patch<{ term: Term }>(term(termId), patch)).term,
  /** Needs a fresh-auth step-up; apiClient prompts for the emailed code and retries. */
  deleteTerm: async (termId: string) => {
    await apiClient.del<{ success: boolean }>(term(termId));
  },

  // ---- Global lookups
  availableRooms: async () => (await apiClient.get<{ rooms: AvailableRoom[] }>(`${BASE}/available-rooms`)).rooms,
  importTemplates: async () =>
    (await apiClient.get<{ templates: ImportTemplates }>(`${BASE}/import-templates`)).templates,

  // ---- Faculty (global; termId only adds assigned_in_term)
  listFaculty: async (termId?: string) =>
    (await apiClient.get<{ faculty: FacultyListItem[] }>(`${BASE}/faculty${qs({ term_id: termId })}`)).faculty,
  createFaculty: async (input: FacultyInput) =>
    (await apiClient.post<{ faculty: Faculty }>(`${BASE}/faculty`, input)).faculty,
  updateFaculty: async (id: string, patch: FacultyPatch) =>
    (await apiClient.patch<{ faculty: Faculty }>(`${BASE}/faculty/${id}`, patch)).faculty,
  /** 409 IN_USE when any offering references the person. */
  deleteFaculty: async (id: string) => {
    await apiClient.del<{ success: boolean }>(`${BASE}/faculty/${id}`);
  },

  // ---- Subjects
  listSubjects: async (termId: string) =>
    (await apiClient.get<{ subjects: Subject[] }>(`${term(termId)}/subjects`)).subjects,
  createSubject: async (termId: string, input: SubjectInput) =>
    (await apiClient.post<{ subject: Subject }>(`${term(termId)}/subjects`, input)).subject,
  updateSubject: async (termId: string, subjectId: string, patch: SubjectPatch) =>
    (await apiClient.patch<{ subject: Subject }>(`${term(termId)}/subjects/${subjectId}`, patch)).subject,
  deleteSubject: async (termId: string, subjectId: string) => {
    await apiClient.del<{ success: boolean }>(`${term(termId)}/subjects/${subjectId}`);
  },

  // ---- Divisions and batches (the whole-division batch comes back flagged is_whole)
  listDivisions: async (termId: string) =>
    (await apiClient.get<{ divisions: DivisionWithBatches[] }>(`${term(termId)}/divisions`)).divisions,
  createDivision: async (termId: string, input: DivisionInput) =>
    (await apiClient.post<{ division: DivisionWithBatches }>(`${term(termId)}/divisions`, input)).division,
  updateDivision: async (termId: string, divisionId: string, patch: DivisionPatch) =>
    (await apiClient.patch<{ division: Division }>(`${term(termId)}/divisions/${divisionId}`, patch)).division,
  deleteDivision: async (termId: string, divisionId: string) => {
    await apiClient.del<{ success: boolean }>(`${term(termId)}/divisions/${divisionId}`);
  },
  createBatch: async (termId: string, divisionId: string, input: BatchInput) =>
    (await apiClient.post<{ batch: Batch }>(`${term(termId)}/divisions/${divisionId}/batches`, input)).batch,
  updateBatch: async (termId: string, divisionId: string, batchId: string, patch: BatchPatch) =>
    (await apiClient.patch<{ batch: Batch }>(`${term(termId)}/divisions/${divisionId}/batches/${batchId}`, patch))
      .batch,
  deleteBatch: async (termId: string, divisionId: string, batchId: string) => {
    await apiClient.del<{ success: boolean }>(`${term(termId)}/divisions/${divisionId}/batches/${batchId}`);
  },

  // ---- Offerings
  listOfferings: async (termId: string, divisionId?: string) =>
    (await apiClient.get<{ offerings: Offering[] }>(`${term(termId)}/offerings${qs({ division_id: divisionId })}`))
      .offerings,
  createOffering: async (termId: string, input: OfferingInput) =>
    (await apiClient.post<{ offering: Offering }>(`${term(termId)}/offerings`, input)).offering,
  updateOffering: async (termId: string, offeringId: string, patch: OfferingPatch) =>
    (await apiClient.patch<{ offering: Offering }>(`${term(termId)}/offerings/${offeringId}`, patch)).offering,
  /** Replaces the whole faculty set of the offering. */
  setOfferingFaculty: (termId: string, offeringId: string, faculty: OfferingFacultyInput[]) =>
    apiClient.put<{ success: boolean }>(`${term(termId)}/offerings/${offeringId}/faculty`, { faculty }),
  deleteOffering: async (termId: string, offeringId: string) => {
    await apiClient.del<{ success: boolean }>(`${term(termId)}/offerings/${offeringId}`);
  },

  // ---- Room pool
  listTermRooms: async (termId: string) =>
    (await apiClient.get<{ rooms: TermRoom[] }>(`${term(termId)}/rooms`)).rooms,
  addTermRooms: (termId: string, input: AddTermRoomsInput) =>
    apiClient.post<{ success: boolean }>(`${term(termId)}/rooms`, input),
  updateTermRoom: (termId: string, termRoomId: string, patch: { is_lab: boolean }) =>
    apiClient.patch<{ success: boolean }>(`${term(termId)}/rooms/${termRoomId}`, patch),
  removeTermRoom: async (termId: string, termRoomId: string) => {
    await apiClient.del<{ success: boolean }>(`${term(termId)}/rooms/${termRoomId}`);
  },

  // ---- Import. dryRun validates only; a real run is all-or-nothing (422 IMPORT_HAS_ERRORS, nothing applied).
  importRows: (termId: string, entity: ImportEntity, rows: Record<string, unknown>[], dryRun: boolean) =>
    apiClient.post<ImportResult & { success: boolean }>(
      `${term(termId)}/import/${entity}${qs({ dryRun })}`,
      { rows },
    ),

  // ---- Sessions
  syncSessions: (versionId: string) =>
    apiClient.post<SyncSessionsResult & { success: boolean }>(`${BASE}/versions/${versionId}/sync-sessions`),
  sessionsSummary: (versionId: string) =>
    apiClient.get<SessionsSummary & { success: boolean }>(`${BASE}/versions/${versionId}/sessions/summary`),
  listSessions: async (versionId: string, divisionId?: string) =>
    (
      await apiClient.get<{ sessions: PlannerSession[] }>(
        `${BASE}/versions/${versionId}/sessions${qs({ division_id: divisionId })}`,
      )
    ).sessions,

  // ---- Editor (Phase 2). The snapshot is the editor's single source of truth; ops are the only writes.
  snapshot: (versionId: string) => apiClient.get<Snapshot & { success: boolean }>(`${BASE}/versions/${versionId}/snapshot`),
  /** One request = one transaction = at most one rev bump. Errors: CLASH, PLACEMENT_INVALID, SESSION_LOCKED, NOT_DRAFT, NO_ROOM_AVAILABLE. */
  applyOps: (versionId: string, body: OpsRequest) =>
    apiClient.post<OpsResponse>(`${BASE}/versions/${versionId}/ops`, body),

  // ---- Rules (Phase 3, contract 9.7). No version bump. Blocking rules are read-only; a bad patch is 400 VALIDATION_ERROR
  // with fieldErrors keyed `rules.<i>.<field>`, all or nothing.
  rules: async (termId: string) => (await apiClient.get<{ rules: RuleRow[] }>(`${term(termId)}/rules`)).rules,
  patchRules: async (termId: string, body: RulesPatchBody) =>
    (await apiClient.patch<{ rules: RuleRow[] }>(`${term(termId)}/rules`, body)).rules,
  resetRules: async (termId: string) => (await apiClient.post<{ rules: RuleRow[] }>(`${term(termId)}/rules/reset`)).rules,

  // ---- Diagnostics, candidates, suggestions (Phase 3, contract 9.3 and 9.4). Read-only, any version status.
  diagnostics: (versionId: string) =>
    apiClient.get<DiagnosticsResponse & { success: boolean }>(`${BASE}/versions/${versionId}/diagnostics`),
  /** Every slot that passes the hard checks for the session, ascending score. */
  /** `signal` (from react-query) aborts the request when the query is superseded or unmounted. */
  candidates: (sessionId: string, signal?: AbortSignal) =>
    apiClient.get<CandidatesResponse & { success: boolean }>(`${BASE}/sessions/${sessionId}/candidates`, { signal }),
  /** `limit` defaults to 5 server-side (max 20). */
  suggestions: (sessionId: string, limit?: number, signal?: AbortSignal) =>
    apiClient.get<SuggestionsResponse & { success: boolean }>(`${BASE}/sessions/${sessionId}/suggestions${qs({ limit })}`, { signal }),

  // ---- Generation (Phase 3, contract 9.6). Errors: GENERATION_RUNNING, NOT_READY, CONFIRM_REQUIRED, NOT_UNDOABLE, RUN_NOT_FOUND.
  /** 202: the run is queued; poll `generation(versionId)`. */
  generate: async (versionId: string, body: GenerateRequest = {}) =>
    (await apiClient.post<{ run: GenerationRun }>(`${BASE}/versions/${versionId}/generate`, body)).run,
  generation: (versionId: string) =>
    apiClient.get<GenerationRunsResponse & { success: boolean }>(`${BASE}/versions/${versionId}/generation`),
  generationRun: async (runId: string) =>
    (await apiClient.get<{ run: GenerationRun }>(`${BASE}/generation-runs/${runId}`)).run,
  cancelRun: async (runId: string) =>
    (await apiClient.post<{ run: GenerationRun }>(`${BASE}/generation-runs/${runId}/cancel`)).run,
  undoRun: (runId: string) =>
    apiClient.post<UndoRunResponse & { success: boolean }>(`${BASE}/generation-runs/${runId}/undo`),

  // ---- Readiness
  readiness: (termId: string) => apiClient.get<ReadinessReport & { success: boolean }>(`${term(termId)}/readiness`),
};

export type PlannerApi = typeof plannerApi;
