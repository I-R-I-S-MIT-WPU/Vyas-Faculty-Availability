import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Lock, RotateCcw, XCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { usePatchRules, useResetRules, useRules } from "../../hooks";
import { describeApiError, fieldErrorsOf } from "../../lib/errors";
import {
  GROUP_LABELS,
  WEIGHT_MAX,
  WEIGHT_MIN,
  diffToPatch,
  groupRules,
  mapServerFieldErrors,
  mergeDraft,
  setOverride,
  setParamOverride,
  validateRules,
  type RuleOverride,
  type RulesDraft,
  type RulesFormValues,
} from "../../lib/rulesForm";
import {
  changedRuleKeys,
  dropRuleErrors,
  enumLabel,
  errorsForRule,
  isSeverityEditable,
  isWeightDimmed,
  paramInputValue,
  parseWeightInput,
  severityLabel,
  unmappedErrors,
  weightInputValue,
  type RuleErrors,
} from "../../lib/rulesView";
import type { RuleGroup, RuleRow, RuleSeverity } from "../../types";

const GROUP_HELP: Record<RuleGroup, string> = {
  blocking: "These can never be broken or switched off. The editor refuses any change that would break one.",
  hard: "A timetable that breaks one of these cannot be published. You can relax a rule to a preference if you need to.",
  soft: "The generator tries to honour these. A higher weight makes a preference more important; 0 ignores it.",
};

const SAVED_MESSAGE = "Rules saved. Regenerate or re-check diagnostics to see the effect.";

export interface RulesTabProps {
  termId: string;
  /** Called whenever "there are unsaved rule edits" changes, so the page can mark the tab (the tab stays mounted while hidden). */
  onDirtyChange?: (dirty: boolean) => void;
}

export function RulesTab({ termId, onDirtyChange }: RulesTabProps) {
  const rules = useRules(termId);
  const rows = rules.data;
  // The unsaved edits as sparse per-field overrides on top of the CURRENT server rows: a rule (or field) the admin has not
  // touched always shows the latest server value, so a refetch after another admin's save is never reverted by a stale copy.
  const [draft, setDraft] = useState<RulesDraft>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const patchRules = usePatchRules(termId, { silent: true, successMessage: SAVED_MESSAGE });
  const resetRules = useResetRules(termId, { successMessage: "Rules reset to the defaults." });

  const values = useMemo<RulesFormValues>(() => (rows ? mergeDraft(rows, draft) : {}), [draft, rows]);
  const patch = useMemo(() => (rows ? diffToPatch(rows, values) : { rules: [] }), [rows, values]);
  const dirty = patch.rules.length > 0;
  const clientErrors = useMemo(() => (rows ? validateRules(rows, values) : {}), [rows, values]);
  const errors = useMemo(() => ({ ...serverErrors, ...clientErrors }), [serverErrors, clientErrors]);
  const edited = useMemo(() => (rows ? changedRuleKeys(rows, values) : new Set<string>()), [rows, values]);
  const errorCount = Object.keys(clientErrors).length;
  const groups = useMemo(() => (rows ? groupRules(rows) : []), [rows]);
  const generalErrors = useMemo(() => (rows ? unmappedErrors(serverErrors, rows) : []), [serverErrors, rows]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const edit = (ruleKey: string, update: (d: RulesDraft) => RulesDraft) => {
    setDraft(update);
    setServerErrors((e) => dropRuleErrors(e, ruleKey));
    setSaveError(null);
  };

  const discard = () => {
    setDraft({});
    setServerErrors({});
    setSaveError(null);
  };

  const save = async () => {
    if (!rows || !dirty || errorCount > 0) return;
    setSaveError(null);
    try {
      await patchRules.mutateAsync(patch);
      setDraft({});
      setServerErrors({});
    } catch (err) {
      const mapped = mapServerFieldErrors(fieldErrorsOf(err), patch);
      setServerErrors(mapped);
      // A server field error is shown next to its control; anything else gets a banner.
      if (Object.keys(mapped).length === 0) setSaveError(describeApiError(err));
      else setSaveError("The server did not accept some values. See the highlighted rules.");
    }
  };

  const reset = async () => {
    setConfirmReset(false);
    try {
      await resetRules.mutateAsync();
      discard();
    } catch {
      // The hook already toasted the error.
    }
  };

  if (rules.isLoading) {
    return (
      <section className="space-y-4" aria-label="Rules" aria-busy="true">
        <Skeleton className="h-8 w-1/3" />
        <div className="space-y-3" role="status" aria-label="Loading the rules">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </section>
    );
  }

  if (rules.error || !rows) {
    return (
      <section className="space-y-4" aria-label="Rules">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Could not load the rules</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{rules.error ? describeApiError(rules.error) : "No rules came back from the server."}</p>
            <Button variant="outline" size="sm" onClick={() => rules.refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  const busy = patchRules.isPending || resetRules.isPending;

  return (
    <section className="space-y-4" aria-label="Rules">
      <div>
        <h2 className="text-lg font-semibold">Rules</h2>
        <p className="text-sm text-muted-foreground">
          Decide which rules the generator and the editor's checks apply to this term. Changes do not move any session by
          themselves.
        </p>
      </div>

      {(saveError || generalErrors.length > 0) && (
        <Alert variant="destructive" role="alert">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Could not save the rules</AlertTitle>
          <AlertDescription className="space-y-1">
            {saveError && <p>{saveError}</p>}
            {generalErrors.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {groups.map((g) => (
        <Card key={g.group}>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">
              {g.group === "blocking" ? "Blocking rules" : g.group === "hard" ? "Hard rules" : "Soft rules"}{" "}
              <span className="font-normal text-muted-foreground">({GROUP_LABELS[g.group]})</span>
            </CardTitle>
            <CardDescription>{GROUP_HELP[g.group]}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y border-t">
              {g.rules.map((row) =>
                g.group === "blocking" ? (
                  <BlockingRuleRow key={row.rule_key} row={row} />
                ) : (
                  <EditableRuleRow
                    key={row.rule_key}
                    row={row}
                    value={values[row.rule_key]}
                    errors={errorsForRule(errors, row.rule_key)}
                    edited={edited.has(row.rule_key)}
                    disabled={busy}
                    onChange={(change) => edit(row.rule_key, (d) => setOverride(d, row.rule_key, change))}
                    onParam={(name, raw) => edit(row.rule_key, (d) => setParamOverride(d, row.rule_key, name, raw))}
                  />
                ),
              )}
            </ul>
          </CardContent>
        </Card>
      ))}

      <div
        className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background/95 p-3 shadow-sm backdrop-blur"
        role="group"
        aria-label="Save rules"
      >
        <p className="text-sm text-muted-foreground" role="status">
          {errorCount > 0
            ? `${errorCount} ${errorCount === 1 ? "value needs" : "values need"} fixing before you can save.`
            : dirty
              ? `${patch.rules.length} ${patch.rules.length === 1 ? "rule" : "rules"} changed, not saved yet.`
              : "No unsaved changes."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => setConfirmReset(true)} disabled={busy}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reset to defaults
          </Button>
          <Button variant="outline" onClick={discard} disabled={busy || (!dirty && !saveError)}>
            Discard
          </Button>
          <Button onClick={() => void save()} disabled={busy || !dirty || errorCount > 0}>
            {patchRules.isPending ? "Saving..." : "Save rules"}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset every rule to its default?</AlertDialogTitle>
            <AlertDialogDescription>
              Every rule goes back to its default on/off state, severity, weight and settings
              {dirty ? ", and your unsaved changes are lost" : ""}. No session is moved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void reset()}>Reset to defaults</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// =============================================================================

function BlockingRuleRow({ row }: { row: RuleRow }) {
  const descId = `rule-${row.rule_key}-desc`;
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3" data-rule={row.rule_key}>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium">{row.spec.label}</p>
        <p id={descId} className="text-sm text-muted-foreground">
          {row.spec.description}
        </p>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Always enforced
            </Badge>
            <Switch checked disabled aria-label={`${row.spec.label}: always enforced, cannot be turned off`} aria-describedby={descId} />
          </span>
        </TooltipTrigger>
        <TooltipContent>Always enforced</TooltipContent>
      </Tooltip>
    </li>
  );
}

const EDITABLE_SEVERITIES: RuleSeverity[] = ["hard", "soft"];

function EditableRuleRow({
  row,
  value,
  errors,
  edited,
  disabled,
  onChange,
  onParam,
}: {
  row: RuleRow;
  value: RulesFormValues[string] | undefined;
  errors: RuleErrors;
  edited: boolean;
  disabled: boolean;
  onChange: (change: Omit<RuleOverride, "params">) => void;
  onParam: (name: string, raw: string | number | null) => void;
}) {
  if (!value) return null;
  const { label, description } = row.spec;
  const key = row.rule_key;
  const descId = `rule-${key}-desc`;
  const dimWeight = isWeightDimmed(row, value);
  const severities = row.spec.allowed_severities.filter((s) => EDITABLE_SEVERITIES.includes(s));
  const paramEntries = Object.entries(row.spec.params);
  const hasError = !!errors.weight || !!errors.severity || Object.keys(errors.params).length > 0 || errors.other.length > 0;

  return (
    <li className="space-y-3 px-4 py-3" data-rule={key}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {label}
            {edited && <Badge variant="outline">Edited</Badge>}
            {!value.enabled && <Badge variant="secondary">Off</Badge>}
          </p>
          <p id={descId} className="text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`rule-${key}-enabled`} className="text-sm font-normal text-muted-foreground">
            {value.enabled ? "On" : "Off"}
          </Label>
          <Switch
            id={`rule-${key}-enabled`}
            checked={value.enabled}
            disabled={disabled}
            onCheckedChange={(enabled) => onChange({ enabled })}
            aria-label={`${label} enabled`}
            aria-describedby={descId}
          />
        </div>
      </div>

      <div className={cn("flex flex-wrap items-start gap-x-4 gap-y-3", !value.enabled && "opacity-60")}>
        {isSeverityEditable(row) && (
          <div className="space-y-1">
            <Label htmlFor={`rule-${key}-severity`} className="text-xs">
              Importance
            </Label>
            <Select value={value.severity} disabled={disabled} onValueChange={(s) => onChange({ severity: s as RuleSeverity })}>
              <SelectTrigger
                id={`rule-${key}-severity`}
                className="h-9 w-44"
                aria-label={`${label} importance`}
                aria-invalid={!!errors.severity}
                aria-describedby={errors.severity ? `rule-${key}-severity-err` : undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {severities.map((s) => (
                  <SelectItem key={s} value={s}>
                    {severityLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.severity && <FieldError id={`rule-${key}-severity-err`}>{errors.severity}</FieldError>}
          </div>
        )}

        <div className={cn("space-y-1", dimWeight && "opacity-60")}>
          <Label htmlFor={`rule-${key}-weight`} className="text-xs">
            Weight ({WEIGHT_MIN} to {WEIGHT_MAX})
          </Label>
          <Input
            id={`rule-${key}-weight`}
            type="number"
            inputMode="numeric"
            min={WEIGHT_MIN}
            max={WEIGHT_MAX}
            step={1}
            className="h-9 w-24"
            value={weightInputValue(value.weight)}
            disabled={disabled}
            onChange={(e) => onChange({ weight: parseWeightInput(e.target.value) })}
            aria-label={`${label} weight${value.severity !== "soft" ? " (only used when this is a preference)" : ""}`}
            aria-invalid={!!errors.weight}
            aria-describedby={errors.weight ? `rule-${key}-weight-err` : undefined}
          />
          {errors.weight && <FieldError id={`rule-${key}-weight-err`}>{errors.weight}</FieldError>}
        </div>

        {paramEntries.map(([name, spec]) => {
          const id = `rule-${key}-param-${name}`;
          const err = errors.params[name];
          const raw = value.params[name];
          return (
            <div key={name} className="space-y-1">
              <Label htmlFor={id} className="text-xs">
                {spec.label}
                {spec.type === "int_or_null" ? " (optional)" : ""}
              </Label>
              {spec.type === "enum" ? (
                <Select value={typeof raw === "string" ? raw : ""} disabled={disabled} onValueChange={(v) => onParam(name, v)}>
                  <SelectTrigger id={id} className="h-9 w-44" aria-label={`${label}: ${spec.label}`} aria-invalid={!!err}>
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    {(spec.values ?? []).map((v) => (
                      <SelectItem key={v} value={v}>
                        {enumLabel(v)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={spec.min}
                  max={spec.max}
                  step={1}
                  className="h-9 w-28"
                  placeholder={spec.type === "int_or_null" ? "None" : undefined}
                  value={paramInputValue(raw)}
                  disabled={disabled}
                  onChange={(e) => onParam(name, e.target.value)}
                  aria-label={`${label}: ${spec.label}`}
                  aria-invalid={!!err}
                  aria-describedby={err ? `${id}-err` : undefined}
                />
              )}
              {err && <FieldError id={`${id}-err`}>{err}</FieldError>}
            </div>
          );
        })}
      </div>

      {hasError && errors.other.length > 0 && (
        <div className="space-y-1">
          {errors.other.map((m) => (
            <FieldError key={m} id={`rule-${key}-other-err`}>
              {m}
            </FieldError>
          ))}
        </div>
      )}
    </li>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    // Not role="alert": the message changes on every keystroke. The control points at it with aria-describedby; this is a polite live region.
    <p id={id} aria-live="polite" className="flex items-start gap-1 text-xs text-destructive">
      <XCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export default RulesTab;
