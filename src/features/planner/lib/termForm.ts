import { z } from "zod";
import type { Term, TermBreak, TermInput, TermPatch } from "../types";
import { dateText, requiredInt, timeText } from "./forms";
import { minToTime, timeToMin, toDateInput } from "./time";

// One form model for "New term" and the Settings tab. Times are "HH:MM" strings in the form
// and minutes-since-midnight on the wire.

export const DEFAULT_BREAKS: TermBreak[] = [
  { start_min: 630, end_min: 645, label: "Short break 1" },
  { start_min: 765, end_min: 810, label: "Lunch" },
  { start_min: 930, end_min: 945, label: "Short break 2" },
];

export const DEFAULT_TERM_SETTINGS = {
  working_days: [0, 1, 2, 3, 4],
  day_start_min: 510,
  day_end_min: 1065,
  grid_minutes: 15,
  theory_minutes: 60,
  lab_minutes: 120,
};

export const termFormSchema = z
  .object({
    academic_year: z.string().trim().regex(/^\d{4}-\d{2}$/, "Use the form 2026-27"),
    half: z.enum(["odd", "even"], { errorMap: () => ({ message: "Pick odd or even" }) }),
    branch: z.string().trim().min(1, "Branch is required").max(40),
    start_date: dateText,
    end_date: dateText,
    working_days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one working day"),
    day_start: timeText,
    day_end: timeText,
    grid_minutes: requiredInt("Grid", 1, 120),
    theory_minutes: requiredInt("Theory duration", 1, 600),
    lab_minutes: requiredInt("Lab duration", 1, 600),
    breaks: z.array(
      z.object({
        // The API treats a break label as optional (breaks created through the API may have none), so blank is allowed.
        label: z.string().trim().max(80, "At most 80 characters"),
        start: timeText,
        end: timeText,
      }),
    ),
  })
  .superRefine((v, ctx) => {
    const start = timeToMin(v.day_start);
    const end = timeToMin(v.day_end);
    if (start !== null && end !== null && start >= end) {
      ctx.addIssue({ code: "custom", path: ["day_end"], message: "Day must end after it starts" });
    }
    if (v.start_date && v.end_date && v.start_date > v.end_date) {
      ctx.addIssue({ code: "custom", path: ["end_date"], message: "End date is before the start date" });
    }
    v.breaks.forEach((b, i) => {
      const bs = timeToMin(b.start);
      const be = timeToMin(b.end);
      if (bs !== null && be !== null && bs >= be) {
        ctx.addIssue({ code: "custom", path: ["breaks", i, "end"], message: "Must end after it starts" });
      }
    });
  });

/** What the inputs hold (numbers may still be strings until the resolver coerces them). */
export type TermFormInput = z.input<typeof termFormSchema>;
/** What handleSubmit receives. */
export type TermFormValues = z.output<typeof termFormSchema>;

/** API field name -> form field name, for applyFieldErrors. */
export const TERM_SERVER_FIELD_ALIASES: Record<string, string> = { day_start_min: "day_start", day_end_min: "day_end" };

export function termFormDefaults(term?: Term | null): TermFormInput {
  const s = term ?? { ...DEFAULT_TERM_SETTINGS, breaks: DEFAULT_BREAKS };
  return {
    academic_year: term?.academic_year ?? "",
    half: term?.half ?? "odd",
    branch: term?.branch ?? "CSE",
    start_date: toDateInput(term?.start_date),
    end_date: toDateInput(term?.end_date),
    working_days: [...s.working_days].sort((a, b) => a - b),
    day_start: minToTime(s.day_start_min),
    day_end: minToTime(s.day_end_min),
    grid_minutes: s.grid_minutes,
    theory_minutes: s.theory_minutes,
    lab_minutes: s.lab_minutes,
    breaks: s.breaks.map((b) => ({ label: b.label ?? "", start: minToTime(b.start_min), end: minToTime(b.end_min) })),
  };
}

/** Form values -> API body. A blank date is omitted on create and sent as null on patch (clears it). */
export function toTermPayload(v: TermFormValues, mode: "create" | "patch"): TermInput {
  const payload: TermInput = {
    academic_year: v.academic_year,
    half: v.half,
    branch: v.branch,
    working_days: [...v.working_days].sort((a, b) => a - b),
    day_start_min: timeToMin(v.day_start)!,
    day_end_min: timeToMin(v.day_end)!,
    grid_minutes: v.grid_minutes,
    theory_minutes: v.theory_minutes,
    lab_minutes: v.lab_minutes,
    // A blank label is omitted (the API accepts breaks without one).
    breaks: v.breaks.map((b) => ({ ...(b.label ? { label: b.label } : {}), start_min: timeToMin(b.start)!, end_min: timeToMin(b.end)! })) as TermBreak[],
  };
  if (v.start_date) payload.start_date = v.start_date;
  else if (mode === "patch") payload.start_date = null;
  if (v.end_date) payload.end_date = v.end_date;
  else if (mode === "patch") payload.end_date = null;
  return payload;
}

// JSON with sorted keys: jsonb does not preserve key order, so plain JSON.stringify would see false diffs.
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );

/** Only the fields that differ from the saved term, so untouched timing fields never trip LOCKED_BY_PLACEMENTS. */
export function diffTermPatch(term: Term, payload: TermInput): TermPatch {
  const current: Record<string, unknown> = {
    ...term,
    start_date: toDateInput(term.start_date) || null,
    end_date: toDateInput(term.end_date) || null,
    working_days: [...term.working_days].sort((a, b) => a - b),
  };
  // A missing label and "" are the same break.
  const normBreaks = (bs: unknown) =>
    Array.isArray(bs) ? bs.map((b: Partial<TermBreak>) => ({ start_min: b.start_min, end_min: b.end_min, label: b.label ?? "" })) : bs;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    const same =
      key === "breaks" ? stable(normBreaks(value)) === stable(normBreaks(current[key])) : stable(value) === stable(current[key]);
    if (!same) patch[key] = value;
  }
  return patch as TermPatch;
}
