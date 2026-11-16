// Pure view helpers for the Rules tab (contract 9.2 and 9.7). No React. Form logic itself lives in rulesForm.ts.
//
// Exports:
//   patchRuleValue(values, key, change)   new RulesFormValues with one rule changed (never mutates)
//   setParamRaw(values, key, name, raw)   same, for one param
//   parseWeightInput(text)                number (NaN for empty / not a number, so validation reports it)
//   weightInputValue(weight)              string for the input ("" for NaN)
//   paramInputValue(value)                string for an int / int_or_null input ("" for null)
//   enumLabel(value)                      "any_break" -> "Any break"
//   severityLabel(severity)               "Must be satisfied" / "Preference" / "Always enforced"
//   isWeightDimmed(row, value)            the weight only matters for an enabled preference
//   isSeverityEditable(row)               more than one allowed severity and not blocking
//   errorsForRule(errors, key)            {weight?, severity?, params:{name:msg}, other:[msgs]} out of the flat error map
//   dropRuleErrors(errors, key)           the flat map without that rule's entries
//   unmappedErrors(errors, rows)          messages whose key is not "<rule_key>.<field>" of a known rule (shown at the top)
//   changedRuleKeys(rows, values)         rule keys that differ from the server rows (for the "Edited" marker)

import type { RuleParamValue, RuleRow, RuleSeverity } from "../types";
import { diffToPatch, type RuleFormValue, type RulesFormValues } from "./rulesForm";

export function patchRuleValue(values: RulesFormValues, key: string, change: Partial<RuleFormValue>): RulesFormValues {
  const current = values[key];
  if (!current) return values;
  return { ...values, [key]: { ...current, ...change } };
}

export function setParamRaw(values: RulesFormValues, key: string, name: string, raw: RuleParamValue): RulesFormValues {
  const current = values[key];
  if (!current) return values;
  return { ...values, [key]: { ...current, params: { ...current.params, [name]: raw } } };
}

export function parseWeightInput(text: string): number {
  const t = text.trim();
  return t === "" ? NaN : Number(t);
}

export const weightInputValue = (weight: number): string => (Number.isFinite(weight) ? String(weight) : "");

export const paramInputValue = (value: RuleParamValue | undefined): string => (value === null || value === undefined ? "" : String(value));

export function enumLabel(value: string): string {
  const text = value.replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : value;
}

const SEVERITY_LABELS: Record<RuleSeverity, string> = {
  blocking: "Always enforced",
  hard: "Must be satisfied",
  soft: "Preference",
};
export const severityLabel = (severity: RuleSeverity): string => SEVERITY_LABELS[severity] ?? severity;

export const isSeverityEditable = (row: Pick<RuleRow, "spec">): boolean =>
  row.spec.group !== "blocking" && row.spec.allowed_severities.filter((s) => s !== "blocking").length > 1;

export const isWeightDimmed = (_row: Pick<RuleRow, "spec">, value: Pick<RuleFormValue, "enabled" | "severity">): boolean =>
  !value.enabled || value.severity !== "soft";

export interface RuleErrors {
  weight?: string;
  severity?: string;
  params: Record<string, string>;
  other: string[];
}

export function errorsForRule(errors: Record<string, string>, key: string): RuleErrors {
  const out: RuleErrors = { params: {}, other: [] };
  const prefix = `${key}.`;
  for (const [k, message] of Object.entries(errors)) {
    if (!k.startsWith(prefix)) continue;
    const field = k.slice(prefix.length);
    if (field === "weight") out.weight = message;
    else if (field === "severity") out.severity = message;
    else if (field.startsWith("params.")) out.params[field.slice("params.".length)] = message;
    else out.other.push(message);
  }
  return out;
}

export function dropRuleErrors(errors: Record<string, string>, key: string): Record<string, string> {
  const prefix = `${key}.`;
  const out: Record<string, string> = {};
  for (const [k, message] of Object.entries(errors)) if (!k.startsWith(prefix)) out[k] = message;
  return out;
}

export function unmappedErrors(errors: Record<string, string>, rows: Pick<RuleRow, "rule_key">[]): string[] {
  const keys = rows.map((r) => `${r.rule_key}.`);
  return Object.entries(errors)
    .filter(([k]) => !keys.some((p) => k.startsWith(p)))
    .map(([k, message]) => (k === "rules" || k === "_form" ? message : `${k}: ${message}`));
}

export function changedRuleKeys(rows: RuleRow[], values: RulesFormValues): Set<string> {
  return new Set(diffToPatch(rows, values).rules.map((r) => r.rule_key));
}
