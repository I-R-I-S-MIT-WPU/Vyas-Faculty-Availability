// TypeScript mirror of PLANNER_CONTRACT.md section 3. Keys are snake_case exactly as the API sends them.
// Times are minutes since midnight (08:30 = 510). Weekdays are 0=Mon ... 6=Sun.

export type Half = "odd" | "even";
export type SubjectKind = "theory" | "lab";
export type FacultyRole = "lead" | "assist";
export type VersionStatus = "draft" | "published" | "historical";

/** Machine-readable `code` values the planner API can return (see ApiError.code). */
export type PlannerErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "DUPLICATE"
  | "IN_USE"
  | "HAS_PLACED_SESSIONS"
  | "IMPORT_HAS_ERRORS"
  | "IMPORT_CONFLICT"
  | "LOCKED_BY_PLACEMENTS"
  | "INTERNAL_ERROR"
  | "REAUTH_REQUIRED"
  // Phase 2 (editor), contract section 8.2
  | "CLASH"
  | "PLACEMENT_INVALID"
  | "SESSION_LOCKED"
  | "NOT_DRAFT"
  | "NO_ROOM_AVAILABLE"
  // Phase 3 (generator, rules, diagnostics), contract section 9.6
  | "GENERATION_RUNNING"
  | "NOT_READY"
  | "NOT_UNDOABLE"
  | "RUN_NOT_FOUND"
  | "RUN_NOT_ACTIVE"
  | "CONFIRM_REQUIRED"
  | "CONFLICT_RETRY";

/** What a readiness issue points at; passed as the optional 2nd argument of `onNavigateTab`. */
export interface IssueNavTarget {
  type: string;
  id: string | null;
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------- Terms

export interface TermBreak {
  start_min: number;
  end_min: number;
  /** Optional: breaks created through the API may have no label. */
  label?: string;
}

export interface Term {
  id: string;
  academic_year: string;
  half: Half;
  branch: string;
  start_date: string | null; // YYYY-MM-DD
  end_date: string | null;
  working_days: number[];
  day_start_min: number;
  day_end_min: number;
  grid_minutes: number;
  theory_minutes: number;
  lab_minutes: number;
  breaks: TermBreak[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TermCounts {
  divisions: number;
  subjects: number;
  offerings: number;
  rooms: number;
  sessions: number;
}

export interface TermListItem extends Term {
  counts: TermCounts;
  draft_version_id: string | null;
}

export interface Version {
  id: string;
  term_id: string;
  version_no: number;
  status: VersionStatus;
  based_on_id: string | null;
  rev: number;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
}

/** Fields accepted by POST /planner/terms (PATCH takes any subset). */
export interface TermInput {
  academic_year: string;
  half: Half;
  branch?: string;
  start_date?: string | null;
  end_date?: string | null;
  working_days?: number[];
  day_start_min?: number;
  day_end_min?: number;
  grid_minutes?: number;
  theory_minutes?: number;
  lab_minutes?: number;
  breaks?: TermBreak[];
}
export type TermPatch = Partial<TermInput>;

export interface TermDetail {
  term: Term;
  versions: Version[];
  draft_version_id: string | null;
}

export interface CreatedTerm {
  term: Term;
  version: Version;
}

// ---------------------------------------------------------------- Global lookups

export interface AvailableRoom {
  id: string;
  name: string;
  building_name: string;
  floor_number: number | null;
  room_type: string;
  capacity: number | null;
  is_active: boolean;
}

export interface ImportTemplateColumn {
  key: string;
  label: string;
  required: boolean;
  description: string;
  example: string;
}

export interface ImportTemplate {
  columns: ImportTemplateColumn[];
  sample_rows: Record<string, unknown>[];
}

export type ImportEntity = "faculty" | "subjects" | "divisions" | "offerings";
export type ImportTemplates = Record<ImportEntity, ImportTemplate>;

// ---------------------------------------------------------------- Faculty (global)

export interface Faculty {
  id: string;
  profile_id: string | null;
  short_code: string;
  full_name: string;
  email: string | null;
  department: string | null;
  max_per_day: number | null;
  max_per_week: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FacultyListItem extends Faculty {
  linked_profile: { id: string; full_name: string; email: string } | null;
  /** Offering-faculty rows in the requested term; null when no term_id was given. */
  assigned_in_term: number | null;
}

export interface FacultyInput {
  short_code: string;
  full_name: string;
  email?: string | null;
  department?: string | null;
  max_per_day?: number | null;
  max_per_week?: number | null;
}
export type FacultyPatch = Partial<FacultyInput> & { is_active?: boolean };

// ---------------------------------------------------------------- Subjects

export interface Subject {
  id: string;
  term_id: string;
  code: string;
  name: string;
  kind: SubjectKind;
  duration_min: number;
  weekly_count: number;
  semester_total: number | null;
  allow_second_lab: boolean;
}

export interface SubjectInput {
  code: string;
  name: string;
  kind: SubjectKind;
  duration_min?: number;
  weekly_count: number;
  semester_total?: number | null;
  allow_second_lab?: boolean;
}
export type SubjectPatch = Partial<SubjectInput>;

// ---------------------------------------------------------------- Divisions and batches

export interface Batch {
  id: string;
  division_id: string;
  name: string;
  student_count: number;
  is_whole: boolean;
}

export interface Division {
  id: string;
  term_id: string;
  semester: number;
  name: string;
  student_count: number;
  home_room_id: string | null;
}

export interface DivisionWithBatches extends Division {
  batches: Batch[];
}

export interface DivisionInput {
  semester: number;
  name: string;
  student_count: number;
  home_room_id?: string | null;
  batches?: { name: string; student_count: number }[];
}
export type DivisionPatch = Partial<Omit<DivisionInput, "batches">>;

export interface BatchInput {
  name: string;
  student_count: number;
}
export type BatchPatch = Partial<BatchInput>;

// ---------------------------------------------------------------- Offerings

export interface OfferingFacultyInput {
  batch_id?: string | null;
  faculty_id: string;
  role?: FacultyRole;
}

export interface OfferingFaculty {
  id: string;
  batch_id: string | null;
  faculty_id: string;
  role: FacultyRole;
  short_code: string;
  full_name: string;
}

export interface Offering {
  id: string;
  division_id: string;
  subject_id: string;
  weekly_count: number | null;
  per_batch: boolean;
  effective_weekly_count: number;
  subject: { code: string; name: string; kind: SubjectKind };
  faculty: OfferingFaculty[];
}

export interface OfferingInput {
  division_id: string;
  subject_id: string;
  weekly_count?: number | null;
  per_batch?: boolean;
  faculty?: OfferingFacultyInput[];
}
export interface OfferingPatch {
  weekly_count?: number | null;
  per_batch?: boolean;
}

// ---------------------------------------------------------------- Room pool

export interface TermRoom {
  id: string;
  room_id: string;
  is_lab: boolean;
  name: string;
  building_name: string;
  floor_number: number | null;
  room_type: string;
  capacity: number | null;
}

export type AddTermRoomsInput = { room_id: string; is_lab?: boolean } | { room_ids: string[] };

// ---------------------------------------------------------------- Import

export type ImportRowStatus = "create" | "update" | "error";

export interface ImportRowMessage {
  field: string;
  message: string;
}

export interface ImportRowResult {
  row: number; // 1-based
  status: ImportRowStatus;
  errors: ImportRowMessage[];
  warnings: ImportRowMessage[];
  key: string;
}

export interface ImportResult {
  dry_run: boolean;
  applied: boolean;
  summary: { total: number; create: number; update: number; error: number };
  rows: ImportRowResult[];
}

// ---------------------------------------------------------------- Sessions

export interface PlacedSurplus {
  offering_id: string;
  batch_id: string;
  count: number;
}

export interface SyncSessionsResult {
  added: number;
  removed: number;
  kept: number;
  placed_surplus: PlacedSurplus[];
  by_division: { division_id: string; semester: number; name: string; required: number; existing: number }[];
}

export interface SessionsSummary {
  rev: number;
  divisions: {
    division_id: string;
    semester: number;
    name: string;
    required: number;
    placed: number;
    unplaced: number;
  }[];
}

export interface PlannerSession {
  id: string;
  offering_id: string;
  batch_id: string;
  seq: number;
  weekday: number | null;
  start_min: number | null;
  end_min: number | null;
  room_id: string | null;
  locked: boolean;
  subject_code: string;
  subject_name: string;
  kind: SubjectKind;
  duration_min: number;
  batch_name: string;
  faculty: { faculty_id: string; short_code: string; full_name: string }[];
}

// ---------------------------------------------------------------- Readiness

export type IssueSeverity = "error" | "warning" | "info";
export type EntityType = "term" | "faculty" | "subject" | "division" | "batch" | "offering" | "room";
export type EntityTab = "settings" | "faculty" | "subjects" | "divisions" | "offerings" | "rooms";

export interface ReadinessIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  entity: { type: EntityType; id: string; tab: EntityTab };
  meta?: Record<string, unknown>;
}

export interface ReadinessReport {
  ready: boolean;
  counts: { errors: number; warnings: number; info: number };
  errors: ReadinessIssue[];
  warnings: ReadinessIssue[];
  info: ReadinessIssue[];
  stats: {
    divisions: number;
    subjects: number;
    faculty_assigned: number;
    offerings: number;
    rooms: number;
    lab_rooms: number;
    sessions_required: number;
    teachable_minutes_per_day: number;
    term_weeks: number | null;
  };
}

// ---------------------------------------------------------------- Editor (Phase 2, contract section 8)

export interface SnapshotVersion {
  id: string;
  term_id: string;
  version_no: number;
  status: VersionStatus;
}

export interface SnapshotFaculty {
  id: string;
  short_code: string;
  full_name: string;
  department: string | null;
  max_per_day: number | null;
  max_per_week: number | null;
  is_active: boolean;
}

/** GET /planner/versions/:id/snapshot. `rev` and the data are read in one transaction. */
export interface Snapshot {
  rev: number;
  version: SnapshotVersion;
  term: Term;
  divisions: DivisionWithBatches[];
  subjects: Subject[];
  offerings: Offering[];
  faculty: SnapshotFaculty[];
  rooms: TermRoom[];
  sessions: PlannerSession[];
}

/** One edit sent to POST /planner/versions/:id/ops. The server computes end_min; the client never sends it. */
export type PlannerOp =
  | { op: "place"; session_id: string; weekday: number; start_min: number; room_id?: string }
  | { op: "move"; session_id: string; weekday: number; start_min: number; room_id?: string }
  | { op: "unplace"; session_id: string }
  | { op: "lock"; session_id: string }
  | { op: "unlock"; session_id: string }
  | { op: "set_room"; session_id: string; room_id: string }
  | { op: "set_faculty"; session_id: string; faculty_ids: string[] };

export interface OpsRequest {
  client_id?: string;
  ops: PlannerOp[];
}

export interface OpsResponse {
  success: boolean;
  rev: number;
  prev_rev: number;
  /** Only the sessions this request changed. Empty when nothing changed (rev === prev_rev). */
  sessions: PlannerSession[];
  results: { index: number; session_id: string; room_id: string | null }[];
}

/** Socket event `planner:changed`, sent to every tab in the version's room after a commit. */
export interface PlannerChangedEvent {
  version_id: string;
  rev: number;
  prev_rev: number;
  client_id: string | null;
  sessions: PlannerSession[] | null;
  refetch: boolean;
}

/** One entry of `details.conflicts` on a 409 CLASH (kind stays 'room' for shared-lab capacity clashes too). */
export interface ClashConflict {
  kind: "faculty" | "room" | "batch";
  resource_id: string;
  resource_name: string;
  session_id: string;
  /** A plain-English sentence, e.g. "Prof. Sharma (SKS) is already teaching OS to CSE-B (Sem 3) on Monday 09:30-10:30." */
  text: string;
}

/** `details` of a 409 CLASH error (contract 8.2 and amendment 8.7). `reason` is only set for a shared-lab capacity clash. */
export interface ClashDetails {
  op_index: number;
  reason?: "ROOM_CAPACITY";
  conflicts: ClashConflict[];
}

// ---------------------------------------------------------------- Rules (Phase 3, contract sections 9.2 and 9.7)

/** Severity of a rule and of the issues it raises. Blocking rules are fixed; the others toggle hard/soft. */
export type RuleSeverity = "blocking" | "hard" | "soft";
export type RuleGroup = RuleSeverity;
export type RuleParamValue = number | string | null;
export type RuleParams = Record<string, RuleParamValue>;

/** One param of a rule, as the server describes it (the UI is data driven from this). */
export interface RuleParamSpec {
  type: "int" | "enum" | "int_or_null";
  min?: number;
  max?: number;
  values?: string[];
  label: string;
}

/** `RULE_SPEC[rule_key]` as served by GET /planner/terms/:id/rules (the zod schema is not sent). */
export interface RuleSpec {
  label: string;
  description: string;
  group: RuleGroup;
  allowed_severities: RuleSeverity[];
  params: Record<string, RuleParamSpec>;
}

export interface RuleRow {
  rule_key: string;
  enabled: boolean;
  severity: RuleSeverity;
  /** Integer 0..10. */
  weight: number;
  params: RuleParams;
  spec: RuleSpec;
}

/** One entry of PATCH /planner/terms/:id/rules (only the fields that change). */
export interface RulePatchItem {
  rule_key: string;
  enabled?: boolean;
  severity?: RuleSeverity;
  weight?: number;
  params?: RuleParams;
}
export interface RulesPatchBody {
  rules: RulePatchItem[];
}

// ---------------------------------------------------------------- Diagnostics (contract 9.3)

export interface Issue {
  /** Deterministic: rule_key + ':' + sorted session ids [+ faculty id + weekday]. */
  id: string;
  rule_key: string;
  severity: RuleSeverity;
  message: string;
  session_ids: string[];
  division_id: string | null;
  faculty_id: string | null;
  weekday: number | null;
  fix_hint?: string;
}

export interface DiagnosticsCounts {
  blocking: number;
  hard: number;
  soft: number;
}

/** GET /planner/versions/:id/diagnostics. `issues` come sorted blocking, hard, soft; then division, weekday. */
export interface DiagnosticsResponse {
  rev: number;
  publishable: boolean;
  counts: DiagnosticsCounts;
  by_division: Record<string, { hard: number; soft: number }>;
  issues: Issue[];
}

// ---------------------------------------------------------------- Candidates and suggestions (contract 9.4)

/** A slot that passes every hard check for a session. Lower score is better. */
export interface Candidate {
  weekday: number;
  start_min: number;
  end_min: number;
  room_id: string;
  room_name: string;
  score: number;
}

export interface CandidatesResponse {
  rev: number;
  session_id: string;
  candidates: Candidate[];
}

export interface SuggestionOp {
  op: "place" | "move";
  session_id: string;
  weekday: number;
  start_min: number;
  room_id: string;
}

export interface Suggestion extends Candidate {
  /** Short sentence built from the penalty parts, e.g. "keeps CSE-A in VY-201, no new gap". */
  reason: string;
  /** Ready to send to POST /planner/versions/:id/ops. */
  ops: SuggestionOp[];
}

export type NoneReasonCode = "FACULTY_BUSY" | "DIVISION_BUSY" | "NO_ROOM" | "POLICY_RULES" | "LOCKED";

export interface NoneReason {
  code: NoneReasonCode;
  text: string;
  slots: { total: number; free: number; faculty: number; batch: number; room: number };
}

export interface SuggestionsResponse {
  rev: number;
  session_id: string;
  suggestions: Suggestion[];
  /** Present only when there are no suggestions. */
  none_reason?: NoneReason;
}

// ---------------------------------------------------------------- Generation (contract 9.6)

export type GenerationMode = "fill_unplaced" | "regenerate_unlocked";
export type GenerationStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type GenerationStage = "queued" | "loading" | "labs" | "theory" | "repair" | "committing" | "done" | "failed" | "cancelled";
/** The 9.4 none_reason codes plus the two generator-only ones. */
export type UnplacedCode = NoneReasonCode | "SERVER_REFUSED" | "TRY_LIMIT";

export interface UnplacedItem {
  session_id: string;
  key: string;
  division_id: string;
  subject_code: string;
  /** Null for a whole-division session (no batch). */
  batch_name: string | null;
  kind: SubjectKind;
  code: UnplacedCode;
  text: string;
}

export interface GenerationStats {
  requested: number;
  placed: number;
  unplaced: number;
  seeds_tried: number;
  best_seed: number | null;
  score: number | null;
  repair_moves: number;
  duration_ms: number;
  by_kind: { lab: { placed: number; total: number }; theory: { placed: number; total: number } };
}

export interface GenerationRun {
  id: string;
  version_id: string;
  term_id: string;
  mode: GenerationMode;
  scope: { division_ids: string[] | null };
  options: { seeds?: number; seed?: number; [key: string]: unknown };
  seed: number | null;
  status: GenerationStatus;
  stage: GenerationStage;
  progress_percent: number;
  /** Null until the run has produced numbers (queued, early running). */
  stats: GenerationStats | null;
  /** Capped at 200 in the list endpoint; `unplaced_total` has the real count then. */
  unplaced: UnplacedItem[];
  unplaced_total?: number;
  after_rev: number | null;
  undone_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

/** POST /planner/versions/:id/generate. `regenerate_unlocked` needs `confirm: true` (else 422 CONFIRM_REQUIRED). */
export interface GenerateRequest {
  mode?: GenerationMode;
  division_ids?: string[];
  /** 1..5, default 3. */
  seeds?: number;
  seed?: number;
  confirm?: boolean;
}

export interface GenerationRunsResponse {
  /** Newest first, at most 10. */
  runs: GenerationRun[];
  active: GenerationRun | null;
}

export interface UndoRunResponse {
  run: GenerationRun;
  restored: number;
  /** Sessions left as they are: changed since the run, locked, or refused (the refused ones are also listed in `refused`). */
  skipped_session_ids: string[];
  /** Sessions the server could not put back (a check failed when replaying the old placement). */
  refused: { session_id: string; code: string; message: string; fallback_applied?: boolean }[];
  rev?: number;
}
