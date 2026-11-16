import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { describeApiError } from "../lib/errors";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string;
  isLoading?: boolean;
  /** The query error, if any. Shown instead of the rows. */
  error?: unknown;
  onRetry?: () => void;
  emptyMessage?: ReactNode;
  /** Renders a right-aligned "Actions" column (buttons, menus). */
  actions?: (row: T) => ReactNode;
  className?: string;
}

/** Thin wrapper over the shadcn Table: header + typed columns, skeleton while loading, empty and error states. */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  isLoading,
  error,
  onRetry,
  emptyMessage = "Nothing here yet.",
  actions,
  className,
}: DataTableProps<T>) {
  const span = columns.length + (actions ? 1 : 0);

  let body: ReactNode;
  if (isLoading) {
    body = [0, 1, 2].map((i) => (
      <TableRow key={i}>
        <TableCell colSpan={span}>
          <Skeleton className="h-5 w-full" />
        </TableCell>
      </TableRow>
    ));
  } else if (error) {
    body = (
      <TableRow>
        <TableCell colSpan={span} className="py-8 text-center">
          <p className="text-sm text-destructive">{describeApiError(error)}</p>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              Try again
            </Button>
          )}
        </TableCell>
      </TableRow>
    );
  } else if (!rows || rows.length === 0) {
    body = (
      <TableRow>
        <TableCell colSpan={span} className="py-8 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </TableCell>
      </TableRow>
    );
  } else {
    body = rows.map((row) => (
      <TableRow key={getRowId(row)}>
        {columns.map((col) => (
          <TableCell key={col.key} className={col.className}>
            {col.cell(row)}
          </TableCell>
        ))}
        {actions && <TableCell className="text-right">{<div className="flex justify-end gap-1">{actions(row)}</div>}</TableCell>}
      </TableRow>
    ));
  }

  return (
    <div className={cn("rounded-md border", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={col.className}>
                {col.header}
              </TableHead>
            ))}
            {actions && (
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>{body}</TableBody>
      </Table>
    </div>
  );
}
