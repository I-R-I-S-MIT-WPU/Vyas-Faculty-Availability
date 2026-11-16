import type { ImportResult, ImportRowMessage, ImportRowResult } from "../../types";

// Pure helpers behind the import preview table and the 422 handling.

export const PREVIEW_PAGE_SIZE = 50;

export const ENTITY_ORDER = ["faculty", "subjects", "divisions", "offerings"] as const;

export function summarizeRows(rows: ImportRowResult[]): ImportResult["summary"] {
  const s = { total: rows.length, create: 0, update: 0, error: 0 };
  for (const r of rows) {
    if (r.status === "create") s.create++;
    else if (r.status === "update") s.update++;
    else s.error++;
  }
  return s;
}

/** Number of rows that carry at least one warning (and are not errors). */
export const countWarningRows = (rows: ImportRowResult[]): number =>
  rows.filter((r) => r.status !== "error" && (r.warnings?.length ?? 0) > 0).length;

export function filterRows(rows: ImportRowResult[], onlyProblems: boolean): ImportRowResult[] {
  return onlyProblems ? rows.filter((r) => r.status === "error" || (r.errors?.length ?? 0) > 0) : rows;
}

export function pageCount(total: number, pageSize = PREVIEW_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function pageSlice<T>(items: T[], page: number, pageSize = PREVIEW_PAGE_SIZE): T[] {
  return items.slice(page * pageSize, page * pageSize + pageSize);
}

/** field name -> messages, to highlight the cell a message belongs to. */
export function messagesByField(messages: ImportRowMessage[] | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of messages ?? []) {
    const key = (m.field ?? "").trim();
    (out[key] ||= []).push(m.message);
  }
  return out;
}

/** Make a possibly sloppy server rows array safe to render. */
export function normalizeResultRows(raw: unknown): ImportRowResult[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r, i) => {
    const row = (r ?? {}) as Partial<ImportRowResult>;
    const errors = Array.isArray(row.errors) ? row.errors : [];
    const status =
      row.status === "create" || row.status === "update" || row.status === "error"
        ? row.status
        : errors.length
          ? "error"
          : "create";
    return {
      row: typeof row.row === "number" ? row.row : i + 1,
      status,
      errors,
      warnings: Array.isArray(row.warnings) ? row.warnings : [],
      key: typeof row.key === "string" ? row.key : "",
    };
  });
}

/**
 * Pull an ImportResult out of an IMPORT_HAS_ERRORS error. The API puts `rows` and `summary` in
 * `details`; apiClient types details as a string but it is whatever JSON the server sent. Returns
 * null when the details do not contain rows, so callers fall back to the plain error message.
 */
export function resultFromErrorDetails(details: unknown, dryRun: boolean): ImportResult | null {
  let d: unknown = details;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch {
      return null;
    }
  }
  if (!d || typeof d !== "object") return null;
  const rows = normalizeResultRows((d as { rows?: unknown }).rows);
  if (rows.length === 0) return null;
  const s = (d as { summary?: Partial<ImportResult["summary"]> }).summary;
  const computed = summarizeRows(rows);
  const summary = s && typeof s.total === "number" ? { ...computed, ...s } : computed;
  return { dry_run: dryRun, applied: false, summary, rows };
}
