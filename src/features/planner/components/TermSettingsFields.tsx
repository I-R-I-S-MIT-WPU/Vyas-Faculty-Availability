import { useFieldArray, useFormContext } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { WEEKDAY_LABELS } from "../lib/time";
import type { TermFormInput } from "../lib/termForm";
import { SelectField, TextField } from "./FormFields";

/**
 * Every editable term setting. Shared by the "New term" dialog and the Settings tab.
 * Must render inside <Form {...form}> where form = useForm<TermFormInput, any, TermFormValues>.
 */
export function TermSettingsFields({ showIdentity = true }: { showIdentity?: boolean }) {
  const { control } = useFormContext<TermFormInput>();
  const breaks = useFieldArray({ control, name: "breaks" });

  return (
    <div className="space-y-5">
      {showIdentity && (
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField name="academic_year" label="Academic year" placeholder="2026-27" />
          <SelectField
            name="half"
            label="Semester half"
            options={[
              { value: "odd", label: "Odd" },
              { value: "even", label: "Even" },
            ]}
          />
          <TextField name="branch" label="Branch" placeholder="CSE" />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="start_date" label="Term start" type="date" description="Optional. Needed for semester-total checks." />
        <TextField name="end_date" label="Term end" type="date" />
      </div>

      <FormField
        control={control}
        name="working_days"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Working days</FormLabel>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {WEEKDAY_LABELS.map((label, day) => (
                <label key={day} className="flex cursor-pointer items-center gap-2 text-sm">
                  <FormControl>
                    <Checkbox
                      checked={field.value.includes(day)}
                      onCheckedChange={(checked) =>
                        field.onChange(checked ? [...field.value, day].sort((a, b) => a - b) : field.value.filter((d) => d !== day))
                      }
                    />
                  </FormControl>
                  {label}
                </label>
              ))}
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="day_start" label="Day starts" type="time" />
        <TextField name="day_end" label="Day ends" type="time" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="grid_minutes" label="Grid (minutes)" type="number" inputMode="numeric" min={1} />
        <TextField name="theory_minutes" label="Theory slot (min)" type="number" inputMode="numeric" min={1} />
        <TextField name="lab_minutes" label="Lab slot (min)" type="number" inputMode="numeric" min={1} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium leading-none">Breaks</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => breaks.append({ label: "", start: "", end: "" })}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Add break
          </Button>
        </div>
        {breaks.fields.length === 0 && <p className="text-sm text-muted-foreground">No breaks. Sessions can be placed all day.</p>}
        {breaks.fields.map((item, i) => (
          <div key={item.id} className="grid grid-cols-2 items-start gap-2 sm:grid-cols-[1fr_8rem_8rem_auto]">
            <TextField name={`breaks.${i}.label`} label="Name (optional)" className="col-span-2 sm:col-span-1" />
            <TextField name={`breaks.${i}.start`} label="From" type="time" />
            <TextField name={`breaks.${i}.end`} label="To" type="time" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="col-span-2 justify-self-end sm:col-span-1 sm:mt-8"
              aria-label={`Remove break ${i + 1}`}
              onClick={() => breaks.remove(i)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
