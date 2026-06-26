// src/lib/timetableImportApi.ts
// All HTTP calls go through apiClient, except file upload which needs a raw
// fetch call (apiClient always sets Content-Type: application/json, which
// breaks multipart/form-data uploads — see apiClient.ts for the pattern).

import { apiClient } from "./apiClient";
import type {
  TimetableImportJob,
  ImportJobDetail,
  ExtractedLecture,
  ImportConflict,
  TimetableImportFile,
} from "@/types/api";

const BASE = "/timetable-import";
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3000";

export const timetableImportApi = {
  listJobs: () => apiClient.get<{ success: boolean; jobs: TimetableImportJob[] }>(`${BASE}/jobs`),

  getJob: (jobId: string) => apiClient.get<ImportJobDetail>(`${BASE}/jobs/${jobId}`),

  createJob: (data: { name: string; semester?: string; effective_from?: string }) =>
    apiClient.post<{ success: boolean; job: TimetableImportJob }>(`${BASE}/jobs`, data),

  uploadFiles: async (jobId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    const res = await fetch(`${BACKEND_URL}${BASE}/jobs/${jobId}/files`, {
      method: "POST",
      credentials: "include",
      body: formData,
      // Do NOT set Content-Type — the browser sets it with the multipart boundary
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error ?? "File upload failed");
    }
    return body as { success: boolean; files: TimetableImportFile[] };
  },

  startProcessing: (jobId: string) => apiClient.post<{ success: boolean; message: string }>(`${BASE}/jobs/${jobId}/start`, {}),

  updateLecture: (jobId: string, lectureId: string, updates: Partial<ExtractedLecture>) =>
    apiClient.patch<{ success: boolean; lecture: ExtractedLecture }>(
      `${BASE}/jobs/${jobId}/lectures/${lectureId}`,
      updates
    ),

  rejectLecture: (jobId: string, lectureId: string) =>
    apiClient.del<void>(`${BASE}/jobs/${jobId}/lectures/${lectureId}`),

  resolveConflict: (jobId: string, conflictId: string) =>
    apiClient.patch<{ success: boolean; conflict: ImportConflict }>(
      `${BASE}/jobs/${jobId}/conflicts/${conflictId}/resolve`,
      {}
    ),

  approveJob: (jobId: string) => apiClient.post<{ success: boolean; message: string }>(`${BASE}/jobs/${jobId}/approve`, {}),
};
