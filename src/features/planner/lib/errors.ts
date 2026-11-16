import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "@/lib/apiClient";
import type { PlannerErrorCode } from "../types";

// apiClient types `details` as string, but the planner API sends objects
// ({ fieldErrors: { field: string[] } } for VALIDATION_ERROR). Read it defensively.
type Details = { fieldErrors?: Record<string, string[] | undefined>; formErrors?: string[] } | undefined;

const detailsOf = (err: unknown): Details =>
  err instanceof ApiError && err.details && typeof err.details === "object" ? (err.details as Details) : undefined;

export const isApiError = (err: unknown): err is ApiError => err instanceof ApiError;

/** True when `err` is an ApiError carrying the given planner error code. */
export const hasCode = (err: unknown, code: PlannerErrorCode): boolean => err instanceof ApiError && err.code === code;

/** `{ field: "first message" }` from a VALIDATION_ERROR; empty for anything else. */
export function fieldErrorsOf(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const fe = detailsOf(err)?.fieldErrors;
  if (fe) {
    for (const [field, messages] of Object.entries(fe)) {
      if (messages && messages.length > 0) out[field] = messages[0];
    }
  }
  return out;
}

/** One readable sentence for a toast or inline alert, including per-field validation messages. */
export function describeApiError(err: unknown): string {
  if (err instanceof ApiError) {
    const fields = Object.entries(fieldErrorsOf(err));
    if (fields.length > 0) {
      return `${err.message}: ${fields.map(([f, m]) => `${f} ${m}`).join("; ")}`;
    }
    return err.message || "Request failed";
  }
  if (err instanceof TypeError) return "Could not reach the server. Check your connection and try again.";
  return err instanceof Error ? err.message : "Something went wrong";
}

/**
 * Copy server-side field errors onto a react-hook-form instance. `known` limits it to fields the
 * form really has; `aliases` maps API field names to form field names. Returns true when at least
 * one field matched, so the caller can skip showing the generic message.
 */
export function applyFieldErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  options: { known?: readonly string[]; aliases?: Record<string, string> } = {},
): boolean {
  let applied = false;
  for (const [serverField, message] of Object.entries(fieldErrorsOf(err))) {
    const field = options.aliases?.[serverField] ?? serverField;
    if (options.known && !options.known.includes(field)) continue;
    setError(field as Path<T>, { type: "server", message });
    applied = true;
  }
  return applied;
}
