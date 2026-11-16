import type { ComponentProps, ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Thin wrappers that remove the FormField/FormItem/FormLabel/FormControl/FormMessage boilerplate.
// They read the form from context, so use them inside shadcn's <Form {...form}> (see FormDialog).
// `name` is a plain string because the planner forms are small; zod + the resolver keep it honest.

interface BaseProps {
  name: string;
  label: string;
  description?: ReactNode;
  className?: string;
}

export function TextField({
  name,
  label,
  description,
  className,
  ...input
}: BaseProps & Omit<ComponentProps<typeof Input>, "name" | "value" | "onChange" | "onBlur" | "ref">) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...input} {...field} value={field.value ?? ""} />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function SelectField({
  name,
  label,
  description,
  className,
  options,
  placeholder,
}: BaseProps & { options: { value: string; label: string }[]; placeholder?: string }) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <Select value={field.value ?? ""} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function SwitchField({ name, label, description, className }: BaseProps) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className ?? "flex items-center justify-between gap-4 rounded-md border p-3"}>
          <div className="space-y-0.5">
            <FormLabel>{label}</FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
          </div>
          <FormControl>
            <Switch checked={!!field.value} onCheckedChange={field.onChange} />
          </FormControl>
        </FormItem>
      )}
    />
  );
}
