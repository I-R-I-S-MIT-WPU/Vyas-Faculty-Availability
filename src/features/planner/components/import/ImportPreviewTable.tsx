import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ImportResult, ImportRowStatus } from "../../types";
import { PREVIEW_PAGE_SIZE, countWarningRows, filterRows, messagesByField, pageCount, pageSlice } from "./previewModel";

interface ImportPreviewTableProps {
  /** Column keys to show, in template order. */
  columnKeys: string[];
  /** The rows that were sent (index = result row - 1). */
  rows: Record<string, string>[];
  /** For each sent row, its line in the file, to help find it in the spreadsheet. */
  lines?: number[];
  result: ImportResult;
}

const STATUS_STYLE: Record<ImportRowStatus, string> = {
  create: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  update: "border-transparent bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  error: "border-transparent bg-destructive text-destructive-foreground",
};

const STATUS_LABEL: Record<ImportRowStatus, string> = { create: "Create", update: "Update", error: "Error" };

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "info" | "bad" }) {
  return (
    <div className={cn("rounded-md border px-3 py-2", tone === "bad" && value > 0 && "border-destructive/50 bg-destructive/5")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "bad" && value > 0 && "text-destructive",
          tone === "good" && "text-emerald-700 dark:text-emerald-300",
          tone === "info" && "text-sky-700 dark:text-sky-300",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/** Dry-run preview: summary counts, "only errors" filter, 50-row pages, per-cell error highlighting. */
export function ImportPreviewTable({ columnKeys, rows, lines, result }: ImportPreviewTableProps) {
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => filterRows(result.rows, onlyProblems), [result.rows, onlyProblems]);
  const pages = pageCount(filtered.length);
  const visible = pageSlice(filtered, Math.min(page, pages - 1));
  const warningRows = useMemo(() => countWarningRows(result.rows), [result.rows]);

  // New result (re-validation / new file) or filter change: go back to page 1.
  useEffect(() => setPage(0), [result, onlyProblems]);

  const current = Math.min(page, pages - 1);
  const from = filtered.length === 0 ? 0 : current * PREVIEW_PAGE_SIZE + 1;
  const to = Math.min(filtered.length, (current + 1) * PREVIEW_PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Rows" value={result.summary.total} />
        <Stat label="Will create" value={result.summary.create} tone="good" />
        <Stat label="Will update" value={result.summary.update} tone="info" />
        <Stat label="With errors" value={result.summary.error} tone="bad" />
        <Stat label="With warnings" value={warningRows} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch id="only-errors" checked={onlyProblems} onCheckedChange={setOnlyProblems} />
          <Label htmlFor="only-errors" className="text-sm">
            Show only errors
          </Label>
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {filtered.length === 0 ? "No rows to show" : `Rows ${from}-${to} of ${filtered.length}`}
        </p>
      </div>

      <div className="max-w-full overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Row</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Key</TableHead>
              {columnKeys.map((k) => (
                <TableHead key={k} className="whitespace-nowrap font-mono text-xs">
                  {k}
                </TableHead>
              ))}
              <TableHead className="min-w-[16rem]">Problems</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnKeys.length + 4} className="py-8 text-center text-sm text-muted-foreground">
                  {onlyProblems ? "No rows have errors." : "Nothing to preview."}
                </TableCell>
              </TableRow>
            )}
            {visible.map((r) => {
              const data = rows[r.row - 1] ?? {};
              const line = lines?.[r.row - 1];
              const errorFields = messagesByField(r.errors);
              const warningFields = messagesByField(r.warnings);
              return (
                <TableRow key={r.row} className={cn(r.status === "error" && "bg-destructive/5")}>
                  <TableCell className="align-top tabular-nums">
                    {r.row}
                    {line !== undefined && line !== r.row + 1 && (
                      <span className="block text-xs text-muted-foreground">line {line}</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[14rem] break-words align-top font-medium">{r.key || "-"}</TableCell>
                  {columnKeys.map((k) => {
                    const hasError = k in errorFields;
                    const hasWarning = !hasError && k in warningFields;
                    return (
                      <TableCell
                        key={k}
                        title={[...(errorFields[k] ?? []), ...(warningFields[k] ?? [])].join("\n") || undefined}
                        className={cn(
                          "max-w-[14rem] break-words align-top",
                          hasError && "bg-destructive/15 font-medium text-destructive",
                          hasWarning && "bg-amber-500/15",
                        )}
                      >
                        {data[k] || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                    );
                  })}
                  <TableCell className="align-top">
                    {r.errors.length === 0 && r.warnings.length === 0 ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <ul className="space-y-1 text-sm">
                        {r.errors.map((m, i) => (
                          <li key={`e${i}`} className="flex items-start gap-1.5 text-destructive">
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>
                              <span className="sr-only">Error: </span>
                              {m.field ? <span className="font-mono text-xs">{m.field}: </span> : null}
                              {m.message}
                            </span>
                          </li>
                        ))}
                        {r.warnings.map((m, i) => (
                          <li key={`w${i}`} className="flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>
                              <span className="sr-only">Warning: </span>
                              {m.field ? <span className="font-mono text-xs">{m.field}: </span> : null}
                              {m.message}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {current + 1} of {pages}
          </span>
          <Button variant="outline" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            Next
            <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
