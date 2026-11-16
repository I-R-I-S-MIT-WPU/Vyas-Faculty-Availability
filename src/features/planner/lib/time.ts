// Planner time helpers. The API speaks minutes-since-midnight; people speak "08:30".

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** 510 -> "08:30" */
export function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "08:30" -> 510, or null when the text is not a valid HH:MM. */
export function timeToMin(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Postgres `date` may arrive as "2026-07-01" or an ISO timestamp; <input type="date"> needs the former. */
export function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

export function weekdaysLabel(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (sorted.length > 2 && contiguous) return `${WEEKDAY_LABELS[sorted[0]]}-${WEEKDAY_LABELS[sorted[sorted.length - 1]]}`;
  return sorted.map((d) => WEEKDAY_LABELS[d]).join(", ");
}

export const termLabel = (t: { academic_year: string; half: string; branch: string }): string =>
  `${t.academic_year} ${t.half === "odd" ? "Odd" : "Even"} sem, ${t.branch}`;
