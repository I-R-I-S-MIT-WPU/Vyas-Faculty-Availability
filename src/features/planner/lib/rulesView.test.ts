import { describe, expect, it } from "vitest";
import { sampleRule, sampleRules } from "../components/editor/fixtures/sampleRules";
import { defaultFormValues, diffToPatch } from "./rulesForm";
import {
  changedRuleKeys,
  dropRuleErrors,
  enumLabel,
  errorsForRule,
  isSeverityEditable,
  isWeightDimmed,
  paramInputValue,
  parseWeightInput,
  patchRuleValue,
  setParamRaw,
  severityLabel,
  unmappedErrors,
  weightInputValue,
} from "./rulesView";

describe("value updates", () => {
  it("patchRuleValue and setParamRaw never mutate", () => {
    const base = defaultFormValues(sampleRules);
    const next = patchRuleValue(base, "faculty_consecutive", { weight: 9 });
    expect(next.faculty_consecutive.weight).toBe(9);
    expect(base.faculty_consecutive.weight).toBe(sampleRule("faculty_consecutive").weight);
    const withParam = setParamRaw(next, "faculty_consecutive", "n", "4");
    expect(withParam.faculty_consecutive.params.n).toBe("4");
    expect(withParam.faculty_consecutive.weight).toBe(9);
    expect(next.faculty_consecutive.params.n).toBe(3);
  });
  it("ignores an unknown rule key", () => {
    const base = defaultFormValues(sampleRules);
    expect(patchRuleValue(base, "nope", { weight: 1 })).toBe(base);
    expect(setParamRaw(base, "nope", "n", 1)).toBe(base);
  });
  it("an edit made through the helpers shows up in the patch, and only for that rule", () => {
    const base = defaultFormValues(sampleRules);
    const edited = setParamRaw(patchRuleValue(base, "room_change", { enabled: false }), "room_change", "min_break_minutes", "15");
    const patch = diffToPatch(sampleRules, edited);
    expect(patch.rules).toHaveLength(1);
    expect(patch.rules[0]).toMatchObject({ rule_key: "room_change", enabled: false, params: { mode: "any_break", min_break_minutes: 15 } });
    expect([...changedRuleKeys(sampleRules, edited)]).toEqual(["room_change"]);
    expect(changedRuleKeys(sampleRules, base).size).toBe(0);
  });
});

describe("input conversion", () => {
  it("parses the weight input", () => {
    expect(parseWeightInput("7")).toBe(7);
    expect(parseWeightInput(" 0 ")).toBe(0);
    expect(parseWeightInput("")).toBeNaN();
    expect(parseWeightInput("x")).toBeNaN();
    expect(parseWeightInput("2.5")).toBe(2.5);
  });
  it("renders values for inputs", () => {
    expect(weightInputValue(4)).toBe("4");
    expect(weightInputValue(NaN)).toBe("");
    expect(paramInputValue(null)).toBe("");
    expect(paramInputValue(undefined)).toBe("");
    expect(paramInputValue(0)).toBe("0");
    expect(paramInputValue("lunch_only")).toBe("lunch_only");
  });
  it("humanises enum values and severities", () => {
    expect(enumLabel("any_break")).toBe("Any break");
    expect(enumLabel("lunch_only")).toBe("Lunch only");
    expect(severityLabel("hard")).toBe("Must be satisfied");
    expect(severityLabel("soft")).toBe("Preference");
    expect(severityLabel("blocking")).toBe("Always enforced");
  });
});

describe("row state", () => {
  it("severity is editable for hard/soft rules only", () => {
    expect(isSeverityEditable(sampleRule("faculty_clash"))).toBe(false);
    expect(isSeverityEditable(sampleRule("all_placed"))).toBe(true);
    expect(isSeverityEditable(sampleRule("day_balance"))).toBe(true);
    expect(isSeverityEditable({ spec: { ...sampleRule("day_balance").spec, allowed_severities: ["soft"] } })).toBe(false);
  });
  it("dims the weight unless the rule is an enabled preference", () => {
    const soft = sampleRule("day_balance");
    expect(isWeightDimmed(soft, { enabled: true, severity: "soft" })).toBe(false);
    expect(isWeightDimmed(soft, { enabled: true, severity: "hard" })).toBe(true);
    expect(isWeightDimmed(soft, { enabled: false, severity: "soft" })).toBe(true);
  });
});

describe("error maps", () => {
  const errors = {
    "faculty_consecutive.weight": "Weight must be a whole number from 0 to 10",
    "faculty_consecutive.params.n": "Hours in a row: must be between 1 and 8",
    "faculty_consecutive.severity": "cannot be blocking",
    "room_change.params.mode": "pick one",
    "rules.0": "Something else",
  };
  it("splits the flat map per rule", () => {
    const e = errorsForRule(errors, "faculty_consecutive");
    expect(e.weight).toMatch(/whole number/);
    expect(e.severity).toBe("cannot be blocking");
    expect(e.params).toEqual({ n: "Hours in a row: must be between 1 and 8" });
    expect(e.other).toEqual([]);
    expect(errorsForRule(errors, "day_balance")).toEqual({ params: {}, other: [] });
  });
  it("does not confuse rule keys that share a prefix", () => {
    expect(errorsForRule({ "student_consecutive.weight": "x" }, "student").weight).toBeUndefined();
  });
  it("drops one rule's errors", () => {
    const rest = dropRuleErrors(errors, "faculty_consecutive");
    expect(Object.keys(rest).sort()).toEqual(["room_change.params.mode", "rules.0"]);
  });
  it("lists the messages that belong to no known rule", () => {
    expect(unmappedErrors(errors, sampleRules)).toEqual(["rules.0: Something else"]);
    expect(unmappedErrors({ rules: "At most 30 rules" }, sampleRules)).toEqual(["At most 30 rules"]);
  });
});
