// Form logic for the rule config (contract 9.2 and 9.7). Pure, no React: the Rules tab renders, this decides.
//
// Exports:
//   WEIGHT_MIN / WEIGHT_MAX                 0 / 10
//   RuleFormValue, RulesFormValues          {enabled, severity, weight, params} per rule_key
//   defaultFormValues(rows)                 the form's starting values (and the baseline for diffToPatch)
//   RulesDraft / mergeDraft(rows, draft)    the unsaved edits as SPARSE per-field overrides; mergeDraft lays them over the current server rows
//   setOverride / setParamOverride          add one field's override to a draft (never mutates)
//   diffToPatch(rows, values)               the minimal PATCH body: only changed rules, only changed fields; blocking rules never;
//                                           a changed params object is sent whole. `rules` is empty when nothing changed.
//   isDirty(rows, values)                   diffToPatch(...).rules.length > 0
//   coerceParam(spec, raw)                  raw input (string/number/null) -> typed value, or undefined when it is not valid
//   validateParams(spec, params)            {paramName: message} (empty = valid)
//   validateWeight(weight)                  message or null
//   validateRules(rows, values)             flat {"<rule_key>.weight" | "<rule_key>.severity" | "<rule_key>.params.<name>": message}
//   groupRules(rows)                        [{group, label, rules}] in order blocking, hard, soft (spec order inside, empty groups left out)
//   mapServerFieldErrors(errors, body)      server fieldErrors keyed "rules.<i>.<field>" -> "<rule_key>.<field>"

import type { RuleGroup, RuleParamSpec, RuleParams, RuleParamValue, RulePatchItem, RuleRow, RuleSeverity, RulesPatchBody } from "../types";

export const WEIGHT_MIN = 0;
export const WEIGHT_MAX = 10;

export interface RuleFormValue {
  enabled: boolean;
  severity: RuleSeverity;
  weight: number;
  params: RuleParams;
}
export type RulesFormValues = Record<string, RuleFormValue>;

export const isBlocking = (row: Pick<RuleRow, "spec">): boolean => row.spec.group === "blocking";

export function defaultFormValues(rows: RuleRow[]): RulesFormValues {
  const out: RulesFormValues = {};
  for (const r of rows) {
    out[r.rule_key] = { enabled: r.enabled, severity: r.severity, weight: r.weight, params: { ...r.params } };
  }
  return out;
}

/** One rule's unsaved edits: only the fields the admin touched (params per param name). */
export interface RuleOverride {
  enabled?: boolean;
  severity?: RuleSeverity;
  weight?: number;
  params?: RuleParams;
}
/** Unsaved edits keyed by rule_key. A rule the admin never touched has no entry, so it always shows the latest server values. */
export type RulesDraft = Record<string, RuleOverride>;

/** The form values: the CURRENT server rows with the draft's overrides on top (a refetch after another admin's save shows through). */
export function mergeDraft(rows: RuleRow[], draft: RulesDraft): RulesFormValues {
  const out = defaultFormValues(rows);
  for (const [key, o] of Object.entries(draft)) {
    const v = out[key];
    if (!v) continue; // the rule no longer exists
    if (o.enabled !== undefined) v.enabled = o.enabled;
    if (o.severity !== undefined) v.severity = o.severity;
    if (o.weight !== undefined) v.weight = o.weight;
    if (o.params) v.params = { ...v.params, ...o.params };
  }
  return out;
}

/** The draft with these fields of one rule overridden (a weight of NaN is a valid override: the input was emptied). */
export function setOverride(draft: RulesDraft, key: string, change: Omit<RuleOverride, "params">): RulesDraft {
  return { ...draft, [key]: { ...draft[key], ...change } };
}

export function setParamOverride(draft: RulesDraft, key: string, name: string, raw: RuleParamValue): RulesDraft {
  const current = draft[key];
  return { ...draft, [key]: { ...current, params: { ...current?.params, [name]: raw } } };
}

const sameParam = (a: RuleParamValue | undefined, b: RuleParamValue | undefined): boolean => (a ?? null) === (b ?? null);

export function diffToPatch(rows: RuleRow[], values: RulesFormValues): RulesPatchBody {
  const rules: RulePatchItem[] = [];
  for (const row of rows) {
    if (isBlocking(row)) continue; // read-only on the server
    const v = values[row.rule_key];
    if (!v) continue;
    const item: RulePatchItem = { rule_key: row.rule_key };
    let changed = false;
    if (v.enabled !== row.enabled) {
      item.enabled = v.enabled;
      changed = true;
    }
    if (v.severity !== row.severity) {
      item.severity = v.severity;
      changed = true;
    }
    if (v.weight !== row.weight) {
      item.weight = v.weight;
      changed = true;
    }
    const names = Object.keys(row.spec.params);
    // Inputs may hold strings ("7"): compare and send the typed value when it is valid (invalid raw values are sent as is
    // and caught by validateRules / the server).
    const typed = (n: string): RuleParamValue => {
      const c = coerceParam(row.spec.params[n], v.params[n]);
      return c === undefined ? ((v.params[n] as RuleParamValue | undefined) ?? null) : c;
    };
    if (names.some((n) => !sameParam(typed(n), row.params[n]))) {
      // Send the whole params object (only the spec'd names), so the server never has to guess merge vs replace.
      const params: RuleParams = {};
      for (const n of names) params[n] = typed(n);
      item.params = params;
      changed = true;
    }
    if (changed) rules.push(item);
  }
  return { rules };
}

export const isDirty = (rows: RuleRow[], values: RulesFormValues): boolean => diffToPatch(rows, values).rules.length > 0;

/** Typed value of a raw form input, or undefined when it does not satisfy the param's type/range. */
export function coerceParam(spec: RuleParamSpec, raw: unknown): RuleParamValue | undefined {
  if (spec.type === "enum") {
    return typeof raw === "string" && (spec.values ?? []).includes(raw) ? raw : undefined;
  }
  if (spec.type === "int_or_null" && (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === ""))) {
    return null;
  }
  let n: number;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string" && /^-?\d+$/.test(raw.trim())) n = Number(raw.trim());
  else return undefined;
  if (!Number.isInteger(n)) return undefined;
  if (spec.min !== undefined && n < spec.min) return undefined;
  if (spec.max !== undefined && n > spec.max) return undefined;
  return n;
}

function paramMessage(spec: RuleParamSpec, raw: unknown): string {
  if (spec.type === "enum") return `${spec.label}: pick one of ${(spec.values ?? []).join(", ")}`;
  const nullable = spec.type === "int_or_null" ? " (or leave empty)" : "";
  const isInt = (typeof raw === "number" && Number.isInteger(raw)) || (typeof raw === "string" && /^-?\d+$/.test(raw.trim()));
  if (!isInt) return `${spec.label}: enter a whole number${nullable}`;
  if (spec.min !== undefined && spec.max !== undefined) return `${spec.label}: must be between ${spec.min} and ${spec.max}${nullable}`;
  if (spec.min !== undefined) return `${spec.label}: must be at least ${spec.min}${nullable}`;
  if (spec.max !== undefined) return `${spec.label}: must be at most ${spec.max}${nullable}`;
  return `${spec.label}: enter a whole number${nullable}`;
}

export function validateParams(paramSpecs: Record<string, RuleParamSpec>, params: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [name, spec] of Object.entries(paramSpecs)) {
    if (coerceParam(spec, params[name]) === undefined) errors[name] = paramMessage(spec, params[name]);
  }
  return errors;
}

export function validateWeight(weight: unknown): string | null {
  if (typeof weight !== "number" || !Number.isInteger(weight) || weight < WEIGHT_MIN || weight > WEIGHT_MAX) {
    return `Weight must be a whole number from ${WEIGHT_MIN} to ${WEIGHT_MAX}`;
  }
  return null;
}

export function validateRules(rows: RuleRow[], values: RulesFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const row of rows) {
    if (isBlocking(row)) continue;
    const v = values[row.rule_key];
    if (!v) continue;
    const w = validateWeight(v.weight);
    if (w) errors[`${row.rule_key}.weight`] = w;
    if (!row.spec.allowed_severities.includes(v.severity)) {
      errors[`${row.rule_key}.severity`] = `${row.spec.label} cannot be ${v.severity}`;
    }
    for (const [name, message] of Object.entries(validateParams(row.spec.params, v.params))) {
      errors[`${row.rule_key}.params.${name}`] = message;
    }
  }
  return errors;
}

export const GROUP_ORDER: RuleGroup[] = ["blocking", "hard", "soft"];

export const GROUP_LABELS: Record<RuleGroup, string> = {
  blocking: "Always enforced",
  hard: "Must be satisfied",
  soft: "Preferences",
};

export function groupRules(rows: RuleRow[]): { group: RuleGroup; label: string; rules: RuleRow[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    rules: rows.filter((r) => r.spec.group === group),
  })).filter((g) => g.rules.length > 0);
}

/** "rules.2.params.max" -> "<rule_key of patch item 2>.params.max"; keys that do not match are returned unchanged. */
export function mapServerFieldErrors(errors: Record<string, string>, body: RulesPatchBody): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, message] of Object.entries(errors)) {
    const m = /^rules\.(\d+)\.(.+)$/.exec(key);
    const ruleKey = m ? body.rules[Number(m[1])]?.rule_key : undefined;
    out[m && ruleKey ? `${ruleKey}.${m[2]}` : key] = message;
  }
  return out;
}
