import { describe, expect, it } from "vitest";
import { sampleRule, sampleRules } from "../components/editor/fixtures/sampleRules";
import {
  WEIGHT_MAX,
  WEIGHT_MIN,
  coerceParam,
  defaultFormValues,
  diffToPatch,
  groupRules,
  isDirty,
  mapServerFieldErrors,
  mergeDraft,
  setOverride,
  setParamOverride,
  validateParams,
  validateRules,
  validateWeight,
} from "./rulesForm";

describe("fixture", () => {
  it("has the 23 rules of the contract", () => {
    expect(sampleRules).toHaveLength(23);
    expect(new Set(sampleRules.map((r) => r.rule_key)).size).toBe(23);
  });
});

describe("defaultFormValues", () => {
  it("copies every rule's current values (params are cloned)", () => {
    const v = defaultFormValues(sampleRules);
    expect(Object.keys(v)).toHaveLength(23);
    expect(v.faculty_daily_load).toEqual({ enabled: true, severity: "soft", weight: 5, params: { default_max_hours: 6 } });
    v.faculty_daily_load.params.default_max_hours = 9;
    expect(sampleRule("faculty_daily_load").params.default_max_hours).toBe(6);
  });
});

describe("diffToPatch", () => {
  it("is empty for untouched values", () => {
    expect(diffToPatch(sampleRules, defaultFormValues(sampleRules))).toEqual({ rules: [] });
    expect(isDirty(sampleRules, defaultFormValues(sampleRules))).toBe(false);
  });

  it("sends only the changed fields of the changed rules", () => {
    const v = defaultFormValues(sampleRules);
    v.faculty_idle_gap.weight = 8;
    v.room_type.severity = "soft";
    v.day_balance.enabled = false;
    const patch = diffToPatch(sampleRules, v);
    expect(patch.rules).toEqual([
      { rule_key: "room_type", severity: "soft" },
      { rule_key: "faculty_idle_gap", weight: 8 },
      { rule_key: "day_balance", enabled: false },
    ]);
    expect(isDirty(sampleRules, v)).toBe(true);
  });

  it("sends a changed params object whole, typed", () => {
    const v = defaultFormValues(sampleRules);
    v.room_change.params = { mode: "lunch_only", min_break_minutes: "15" };
    expect(diffToPatch(sampleRules, v).rules).toEqual([
      { rule_key: "room_change", params: { mode: "lunch_only", min_break_minutes: 15 } },
    ]);
  });

  it("does not see a difference between 6 and '6', or between null and ''", () => {
    const v = defaultFormValues(sampleRules);
    v.faculty_daily_load.params.default_max_hours = "6";
    v.room_change.params.min_break_minutes = "";
    expect(diffToPatch(sampleRules, v).rules).toEqual([]);
  });

  it("never patches blocking rules", () => {
    const v = defaultFormValues(sampleRules);
    v.faculty_clash.enabled = false;
    v.faculty_clash.severity = "soft";
    v.faculty_clash.weight = 0;
    expect(diffToPatch(sampleRules, v).rules).toEqual([]);
  });
});

describe("coerceParam / validateParams", () => {
  const int = { type: "int" as const, min: 1, max: 12, label: "Hours" };
  const nullable = { type: "int_or_null" as const, min: 0, max: 120, label: "Break" };
  const en = { type: "enum" as const, values: ["a", "b"], label: "Mode" };

  it("coerces ints, bounds and strings", () => {
    expect(coerceParam(int, 6)).toBe(6);
    expect(coerceParam(int, " 7 ")).toBe(7);
    expect(coerceParam(int, 0)).toBeUndefined();
    expect(coerceParam(int, 13)).toBeUndefined();
    expect(coerceParam(int, 2.5)).toBeUndefined();
    expect(coerceParam(int, "abc")).toBeUndefined();
    expect(coerceParam(int, null)).toBeUndefined();
    expect(coerceParam(int, "")).toBeUndefined();
  });
  it("allows null for int_or_null only", () => {
    expect(coerceParam(nullable, null)).toBeNull();
    expect(coerceParam(nullable, "")).toBeNull();
    expect(coerceParam(nullable, "30")).toBe(30);
    expect(coerceParam(nullable, 500)).toBeUndefined();
  });
  it("checks enum membership", () => {
    expect(coerceParam(en, "a")).toBe("a");
    expect(coerceParam(en, "c")).toBeUndefined();
    expect(coerceParam(en, 1)).toBeUndefined();
  });
  it("reports one message per bad param", () => {
    const errs = validateParams({ h: int, b: nullable, m: en }, { h: 20, b: null, m: "z" });
    expect(Object.keys(errs).sort()).toEqual(["h", "m"]);
    expect(errs.h).toContain("between 1 and 12");
    expect(validateParams({ h: int }, { h: "x" }).h).toContain("whole number");
    expect(validateParams({ h: int, b: nullable, m: en }, { h: 1, b: null, m: "a" })).toEqual({});
  });
});

describe("validateWeight", () => {
  it("accepts 0..10 integers only", () => {
    expect(WEIGHT_MIN).toBe(0);
    expect(WEIGHT_MAX).toBe(10);
    expect(validateWeight(0)).toBeNull();
    expect(validateWeight(10)).toBeNull();
    expect(validateWeight(11)).not.toBeNull();
    expect(validateWeight(-1)).not.toBeNull();
    expect(validateWeight(2.5)).not.toBeNull();
    expect(validateWeight("3")).not.toBeNull();
    expect(validateWeight(Number.NaN)).not.toBeNull();
  });
});

describe("validateRules", () => {
  it("is clean for the defaults", () => {
    expect(validateRules(sampleRules, defaultFormValues(sampleRules))).toEqual({});
  });
  it("keys errors by rule and field, and skips blocking rules", () => {
    const v = defaultFormValues(sampleRules);
    v.faculty_consecutive.weight = 11;
    v.faculty_consecutive.params.n = 0;
    v.lab_per_day.severity = "blocking";
    v.faculty_clash.weight = 99;
    const errs = validateRules(sampleRules, v);
    expect(Object.keys(errs).sort()).toEqual([
      "faculty_consecutive.params.n",
      "faculty_consecutive.weight",
      "lab_per_day.severity",
    ]);
  });
});

describe("groupRules", () => {
  it("groups blocking, hard, soft in spec order", () => {
    const g = groupRules(sampleRules);
    expect(g.map((x) => [x.group, x.rules.length])).toEqual([
      ["blocking", 7],
      ["hard", 5],
      ["soft", 11],
    ]);
    expect(g[0].rules[0].rule_key).toBe("faculty_clash");
    expect(g[2].rules.map((r) => r.rule_key)[0]).toBe("faculty_daily_load");
  });
  it("leaves out empty groups", () => {
    expect(groupRules(sampleRules.filter((r) => r.spec.group === "soft")).map((x) => x.group)).toEqual(["soft"]);
    expect(groupRules([])).toEqual([]);
  });
});

describe("mapServerFieldErrors", () => {
  it("maps rules.<i>.<field> to the rule key and keeps unknown keys", () => {
    const body = { rules: [{ rule_key: "day_balance", weight: 50 }, { rule_key: "faculty_consecutive", params: { n: 0 } }] };
    expect(
      mapServerFieldErrors({ "rules.0.weight": "too big", "rules.1.params.n": "min 1", "rules.7.weight": "?", other: "x" }, body),
    ).toEqual({
      "day_balance.weight": "too big",
      "faculty_consecutive.params.n": "min 1",
      "rules.7.weight": "?",
      other: "x",
    });
  });
});

describe("sparse draft (mergeDraft / setOverride / setParamOverride)", () => {
  it("an empty draft is exactly the server values", () => {
    expect(mergeDraft(sampleRules, {})).toEqual(defaultFormValues(sampleRules));
    expect(diffToPatch(sampleRules, mergeDraft(sampleRules, {}))).toEqual({ rules: [] });
  });

  it("overrides only the touched fields and never mutates the draft", () => {
    const d0 = {};
    const d1 = setOverride(d0, "faculty_idle_gap", { weight: 8 });
    const d2 = setParamOverride(d1, "room_change", "min_break_minutes", "15");
    expect(d0).toEqual({});
    expect(d1).toEqual({ faculty_idle_gap: { weight: 8 } });
    expect(d2.room_change).toEqual({ params: { min_break_minutes: "15" } });
    const merged = mergeDraft(sampleRules, d2);
    expect(merged.faculty_idle_gap.weight).toBe(8);
    expect(merged.faculty_idle_gap.severity).toBe(sampleRule("faculty_idle_gap").severity);
    expect(merged.room_change.params).toEqual({ ...sampleRule("room_change").params, min_break_minutes: "15" });
    expect(diffToPatch(sampleRules, merged).rules.map((r) => r.rule_key).sort()).toEqual(["faculty_idle_gap", "room_change"]);
  });

  it("untouched rows follow a refetch; a stale full copy would have reverted it", () => {
    const draft = setOverride({}, "faculty_idle_gap", { weight: 8 });
    // another admin saved day_balance and faculty_idle_gap.severity meanwhile
    const refetched = sampleRules.map((r) =>
      r.rule_key === "day_balance"
        ? { ...r, enabled: !r.enabled }
        : r.rule_key === "faculty_idle_gap"
          ? { ...r, severity: "hard" as const }
          : r,
    );
    const merged = mergeDraft(refetched, draft);
    expect(merged.day_balance.enabled).toBe(!sampleRule("day_balance").enabled); // shows the other admin's value
    expect(merged.faculty_idle_gap.severity).toBe("hard"); // untouched field of an edited rule follows too
    expect(merged.faculty_idle_gap.weight).toBe(8); // the admin's own edit stays
    // the patch contains only the admin's edit, so saving cannot revert day_balance
    expect(diffToPatch(refetched, merged).rules).toEqual([{ rule_key: "faculty_idle_gap", weight: 8 }]);
  });

  it("params are overridden per param name", () => {
    const draft = setParamOverride({}, "room_change", "mode", "lunch_only");
    const refetched = sampleRules.map((r) =>
      r.rule_key === "room_change" ? { ...r, params: { ...r.params, min_break_minutes: 30 } } : r,
    );
    expect(mergeDraft(refetched, draft).room_change.params).toEqual({ mode: "lunch_only", min_break_minutes: 30 });
  });

  it("ignores an override of a rule that no longer exists, and keeps an emptied weight as NaN for validation", () => {
    expect(mergeDraft(sampleRules, { gone: { weight: 3 } })).toEqual(defaultFormValues(sampleRules));
    const merged = mergeDraft(sampleRules, setOverride({}, "faculty_idle_gap", { weight: NaN }));
    expect(Number.isNaN(merged.faculty_idle_gap.weight)).toBe(true);
    expect(validateRules(sampleRules, merged)["faculty_idle_gap.weight"]).toBeTruthy();
  });
});
