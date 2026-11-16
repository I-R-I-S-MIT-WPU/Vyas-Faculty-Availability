import { z } from "zod";

// Small zod v3 helpers shared by every planner form. Number inputs hand RHF strings; these
// coerce them in the resolver so a submitted value is already a number (or undefined).
// Optional number fields default to "" in useForm and come out as `number | undefined`.

/**
 * Required whole number, e.g. grid minutes. A blank / missing value fails with "Required" (it is NOT
 * coerced to 0); an explicit 0 is valid whenever `min` allows it.
 */
export const requiredInt = (label: string, min = 1, max?: number) => {
  let num = z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, min === 1 ? `${label} must be at least 1` : `${label} must be at least ${min}`);
  if (max !== undefined) num = num.max(max, `${label} must be at most ${max}`);
  return z
    .union([z.string(), z.number()], { errorMap: () => ({ message: "Required" }) })
    .refine((v) => typeof v === "number" || v.trim() !== "", "Required")
    .pipe(num);
};

/** Optional whole number: "" / undefined / null become undefined. */
export const optionalInt = (label: string, min = 1, max?: number) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), requiredInt(label, min, max).optional());

/** `<input type="time">` value, "HH:MM". */
export const timeText = z.string().regex(/^\d{2}:\d{2}$/, "Pick a time");

/** `<input type="date">` value, or "" when unset. */
export const dateText = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a date");

const EMAIL = z.string().email();

/** Trimmed, lower-cased (the DB requires lower-case emails), optional. */
export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || EMAIL.safeParse(v).success, "Enter a valid email");

/** "" -> null, so a PATCH clears the column. */
export const blankToNull = (v: string | undefined | null): string | null => (v && v.trim() ? v.trim() : null);

/** "" -> undefined, so a POST simply omits the key. */
export const blankToUndefined = (v: string | undefined | null): string | undefined => (v && v.trim() ? v.trim() : undefined);
