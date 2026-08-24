// Types matching Vyas-Backend's actual REST responses (snake_case, mirrors database/schema.sql).
// Endpoints wrap data inconsistently (some bare objects, some {success, <key>}) — see apiClient.ts.

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Building {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Floor {
  id: string;
  building_id: string;
  floor_number: number;
  number?: number; // alias returned by some endpoints
  name: string | null;
  building_name?: string;
  created_at: string;
  updated_at: string;
  building?: Building;
  rooms?: Room[];
}

export type RoomType = "classroom" | "lab" | "auditorium" | "conference" | "seminar" | "discussion";

export interface Room {
  id: string;
  name: string;
  floor_id: string;
  room_type: RoomType;
  capacity: number | null;
  equipment: string[] | null;
  is_active: boolean;
  requires_approval: boolean;
  floor_number?: number;
  floor_name?: string;
  building_name?: string;
  created_at: string;
  updated_at: string;
  floor?: Floor;
}

export type BookingStatus = "confirmed" | "pending" | "denied" | "cancelled";

export interface Booking {
  id: string;
  room_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  class_division: string | null;
  panel: string | null;
  year_course: string | null;
  is_recurring: boolean;
  status: BookingStatus;
  approved_by: string | null;
  approved_at: string | null;
  template_id: string | null;
  template_teacher_name: string | null;
  generated_for_week: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields present on some endpoints only:
  room_name?: string;
  teacher_name?: string;
  teacher_full_name?: string;
  teacher_email?: string;
  profiles?: { full_name: string; email?: string | null };
}

export interface RoomTimetableTemplate {
  id: string;
  room_id: string;
  teacher_name: string;
  title: string;
  weekday: number; // 0=Monday..6=Sunday
  start_time: string;
  duration_minutes: number;
  notes: string | null;
  repeat_interval_weeks: number;
  effective_from: string;
  is_active: boolean;
  created_by: string | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface RoomTimetableTemplateException {
  id: string;
  template_id: string;
  week_start_date: string;
  resolved_booking_id: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type EffectiveSlotType = "template" | "booking" | "exception_cancelled";

export interface EffectiveTimetableSlot {
  slot_id: string;
  slot_type: EffectiveSlotType;
  start_time: string;
  end_time: string;
  title: string;
  teacher_name: string | null;
  description?: string | null;
  class_division?: string | null;
  panel?: string | null;
  year_course?: string | null;
  template_id: string | null;
  booking_id: string | null;
  is_cancelled: boolean;
}

// ============================================================
// Auth
// ============================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  full_name: string;
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  full_name: string;
  email: string;
  is_admin: boolean;
}

export interface AuthResponse {
  message: string;
  user: AuthUser;
  token: string;
}

export interface RegisterResponse {
  requiresVerification: true;
  email: string;
}

// ============================================================
// Booking requests
// ============================================================

export interface CreateBookingRequest {
  roomId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  classDivision?: string;
  panel?: string;
  yearCourse?: string;
  isRecurring?: boolean;
}

export interface UpdateBookingRequest {
  title?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  class_division?: string;
  panel?: string;
  year_course?: string;
  status?: BookingStatus;
}

export interface MyBookingsResponse {
  success: boolean;
  upcoming: Booking[];
  past: Booking[];
  total: number;
}

export interface AdminBookingsResponse {
  success: boolean;
  data: Booking[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
  filters: { date: string | null; room: string | null; status: string | null };
}

// ============================================================
// Timetable Import (LLM-assisted timetable ingestion)
// ============================================================

export type ImportJobStatus =
  | "CREATED"
  | "PROCESSING"
  | "REVIEW_REQUIRED"
  | "APPROVED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface TimetableImportJob {
  id: string;
  name: string;
  status: ImportJobStatus;
  semester: string | null;
  effective_from: string | null;
  created_by: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  error_message: string | null;
  file_count?: number | string;
  current_stage: string | null;
  current_file_id: string | null;
  files_total: number;
  files_completed: number;
  progress_percent: number;
  cancel_requested: boolean;
  stopped_at: string | null;
}

export type ImportJobEventType =
  | "STAGE_CHANGE"
  | "FILE_COMPLETED"
  | "ERROR"
  | "STOP_REQUESTED"
  | "STOPPED";

export interface ImportJobEvent {
  id: string;
  job_id: string;
  event_type: ImportJobEventType;
  file_id: string | null;
  message: string;
  detail: unknown;
  created_at: string;
}

export type ImportFileExtractionStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "NEEDS_OCR";

export interface FailedChunkSummary {
  chunkIndex: number;
  totalChunks: number;
  errorMessage: string;
}

export interface TimetableImportFile {
  id: string;
  job_id: string;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  extraction_status: ImportFileExtractionStatus;
  raw_text: string | null;
  ocr_used: boolean;
  failed_chunks: FailedChunkSummary[];
  created_at: string;
}

export type ExtractedLectureConfidence = "HIGH" | "MEDIUM" | "LOW";
export type ExtractedLectureStatus = "PENDING" | "APPROVED" | "REJECTED" | "BOOKING_CREATED" | "BOOKING_FAILED";

export interface ExtractedLecture {
  id: string;
  job_id: string;
  source_file_id: string | null;
  raw_teacher_name: string | null;
  raw_subject: string | null;
  raw_room_number: string | null;
  raw_weekday: string | null;
  raw_start_time: string | null;
  raw_duration_minutes: string | null;
  raw_batch: string | null;
  raw_lecture_type: string | null;
  teacher_name: string | null;
  subject: string | null;
  room_number: string | null;
  weekday_number: number | null; // 1=Mon..7=Sun
  start_time: string | null;
  duration_minutes: number | null;
  batch: string | null;
  lecture_type: "CLASSROOM" | "LAB" | null;
  confidence: ExtractedLectureConfidence;
  confidence_score: number;
  missing_fields: string[];
  status: ExtractedLectureStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  llm_model_used: string | null;
  created_at: string;
  updated_at: string;
}

export type ImportConflictType = "ROOM_CLASH" | "FACULTY_CLASH" | "DUPLICATE" | "MISSING_FIELD";
export type ImportConflictSeverity = "ERROR" | "WARNING";

export interface ImportConflict {
  id: string;
  job_id: string;
  conflict_type: ImportConflictType;
  severity: ImportConflictSeverity;
  lecture_ids: string[];
  description: string;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ImportJobDetail {
  success: boolean;
  job: TimetableImportJob;
  files: TimetableImportFile[];
  lectures: ExtractedLecture[];
  conflicts: ImportConflict[];
}
