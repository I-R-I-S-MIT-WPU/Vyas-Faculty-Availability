// Static rule-config sample (contract 9.2 and 9.7): all 23 rows in spec order, as GET /planner/terms/:id/rules serves them.
// Not imported by production code. Use it in tests and for visual/dev work.
//
// Exports:
//   sampleRules              RuleRow[] (23 rows: 7 blocking, 5 hard, 11 soft; all defaults)
//   sampleRule(key)          one row of sampleRules (throws on an unknown key, so tests fail loudly)

import type { RuleGroup, RuleParamSpec, RuleParams, RuleRow, RuleSeverity } from "../../../types";

const int = (label: string, min: number, max: number): RuleParamSpec => ({ type: "int", min, max, label });

function row(
  rule_key: string,
  label: string,
  description: string,
  group: RuleGroup,
  params: Record<string, RuleParamSpec> = {},
  defaults: RuleParams = {},
  weight = 5,
): RuleRow {
  const severity: RuleSeverity = group;
  return {
    rule_key,
    enabled: true,
    severity,
    weight,
    params: defaults,
    spec: {
      label,
      description,
      group,
      allowed_severities: group === "blocking" ? ["blocking"] : ["hard", "soft"],
      params,
    },
  };
}

const MAX_HOURS = int("Max hours", 1, 12);

export const sampleRules: RuleRow[] = [
  row("faculty_clash", "Teacher clash", "A teacher cannot be in two places at once.", "blocking"),
  row("room_clash", "Room clash", "A room hosts one class at a time (shared labs by capacity).", "blocking"),
  row("batch_clash", "Class clash", "A class or batch cannot have two sessions at once.", "blocking"),
  row("working_hours", "Working hours", "Sessions stay inside the teaching day.", "blocking"),
  row("break_overlap", "Breaks", "Sessions never overlap a break.", "blocking"),
  row("grid", "Time grid", "Sessions start on the term's time grid.", "blocking"),
  row("duration", "Duration", "A session lasts exactly its subject's duration.", "blocking"),
  row("room_type", "Room type", "Labs need a lab room.", "hard"),
  row("room_capacity", "Room capacity", "The room must fit the class.", "hard"),
  row("all_placed", "Everything placed", "Every required session is placed.", "hard"),
  row("lab_per_day", "Labs per day", "Limit lab blocks per batch per day.", "hard", { max: int("Max per day", 1, 3) }, { max: 1 }),
  row("lab_weekly", "Labs per week", "A lab meets each batch its weekly count.", "hard"),
  row(
    "faculty_daily_load",
    "Teacher daily load",
    "Limit a teacher's hours per day.",
    "soft",
    { default_max_hours: int("Default max hours", 1, 12) },
    { default_max_hours: 6 },
  ),
  row("faculty_weekly_load", "Teacher weekly load", "Limit a teacher's hours per week.", "soft"),
  row("faculty_consecutive", "Teacher back-to-back", "Avoid long runs without a break.", "soft", { n: int("Hours in a row", 1, 8) }, { n: 3 }),
  row(
    "faculty_idle_gap",
    "Teacher idle gap",
    "Avoid long gaps between a teacher's sessions.",
    "soft",
    { max_gap_minutes: int("Max gap (minutes)", 0, 480) },
    { max_gap_minutes: 180 },
  ),
  row("student_consecutive", "Class back-to-back", "Avoid long runs for a class.", "soft", { n: int("Hours in a row", 1, 8) }, { n: 3 }),
  row(
    "student_idle_gap",
    "Class idle gap",
    "Avoid free time between a class's sessions.",
    "soft",
    { max_gap_minutes: int("Max gap (minutes)", 0, 480) },
    { max_gap_minutes: 60 },
  ),
  row(
    "subject_spread",
    "Subject spread",
    "Spread a subject over the week.",
    "soft",
    { max_per_day: int("Max per day", 1, 4) },
    { max_per_day: 1 },
  ),
  row(
    "room_change",
    "Room changes",
    "Avoid moving a class between rooms without a break.",
    "soft",
    {
      mode: { type: "enum", values: ["any_break", "lunch_only"], label: "Break that counts" },
      min_break_minutes: { type: "int_or_null", min: 0, max: 120, label: "Min break (minutes)" },
    },
    { mode: "any_break", min_break_minutes: null },
  ),
  row("day_balance", "Balanced days", "Keep a class's days evenly loaded.", "soft", { max_spread_hours: int("Max spread (hours)", 0, 8) }, { max_spread_hours: 3 }),
  row("division_daily_hours", "Class daily hours", "Limit a class's teaching hours per day.", "soft", { max_hours: MAX_HOURS }, { max_hours: 6 }),
  row(
    "time_of_day",
    "Time of day",
    "Prefer theory inside the core window.",
    "soft",
    {
      core_start: int("Core window start (minutes)", 0, 1439),
      core_end: int("Core window end (minutes)", 0, 1439),
      late_start: int("Late start (minutes)", 0, 1439),
    },
    { core_start: 645, core_end: 930, late_start: 945 },
  ),
];

export function sampleRule(key: string): RuleRow {
  const found = sampleRules.find((r) => r.rule_key === key);
  if (!found) throw new Error(`sampleRules has no rule ${key}`);
  return found;
}
