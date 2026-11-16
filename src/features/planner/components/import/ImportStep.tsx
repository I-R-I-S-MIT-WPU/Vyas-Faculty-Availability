import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  SkipForward,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useImportRows } from "../../hooks";
import { describeApiError, hasCode, isApiError } from "../../lib/errors";
import type { ImportEntity, ImportResult, ImportTemplate } from "../../types";
import { downloadTemplate } from "./downloadTemplate";
import { ImportPreviewTable } from "./ImportPreviewTable";
import { SheetParseError, checkColumns, parseSheetFile, pickColumns, type ParsedSheet } from "./parseSheet";
import { resultFromErrorDetails } from "./previewModel";

export interface ImportStepProps {
  termId: string;
  entity: ImportEntity;
  title: string;
  /** One sentence on what this file is and how rows map to data. */
  hint: string;
  template: ImportTemplate | undefined;
  templateLoading: boolean;
  templateError: unknown;
  onRetryTemplate: () => void;
  /** Whether this step is the one on screen. Hidden steps stay mounted so their state survives navigation. */
  active: boolean;
  /** Increases every time any step applies an import; a preview from before that is re-validated. */
  epoch: number;
  /** The step was already imported (the user revisits it). */
  alreadyImported: boolean;
  onApplied: (summary: ImportResult["summary"]) => void;
  onSkip: () => void;
  onNext: () => void;
  nextLabel: string;
}

type Phase = "idle" | "parsing" | "validating" | "preview" | "applying" | "done";

interface Loaded {
  fileName: string;
  sheet: ParsedSheet;
  /** Rows exactly as sent to the API (only known columns). */
  rows: Record<string, string>[];
  ignoredColumns: string[];
}

const ACCEPT = ".csv,.xlsx,.xls";

export function ImportStep(props: ImportStepProps) {
  const { termId, entity, title, hint, template, active, epoch } = props;
  const importMutation = useImportRows(termId, { silent: true });

  const [phase, setPhase] = useState<Phase>("idle");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [dryResult, setDryResult] = useState<ImportResult | null>(null);
  const [applied, setApplied] = useState<ImportResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [validatedEpoch, setValidatedEpoch] = useState(epoch);
  const [dragging, setDragging] = useState(false);
  const runId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const columnKeys = template?.columns.map((c) => c.key) ?? [];

  const validate = useCallback(
    async (rows: Record<string, string>[]) => {
      const id = ++runId.current;
      setPhase("validating");
      setProblem(null);
      setValidatedEpoch(epoch);
      try {
        const result = (await importMutation.mutateAsync({ entity, rows, dryRun: true })) as ImportResult;
        if (id !== runId.current) return; // a newer file or run replaced this one
        setDryResult(result);
        setPhase("preview");
      } catch (err) {
        if (id !== runId.current) return;
        const fromDetails =
          isApiError(err) && hasCode(err, "IMPORT_HAS_ERRORS") ? resultFromErrorDetails(err.details, true) : null;
        if (fromDetails) {
          setDryResult(fromDetails);
          setPhase("preview");
        } else {
          setDryResult(null);
          setProblem(describeApiError(err));
          setPhase("idle");
        }
      }
    },
    // importMutation changes identity every render; mutateAsync is stable enough for our one-shot use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity, epoch],
  );

  const handleFile = async (file: File | undefined | null) => {
    if (!file || !template) return;
    runId.current++;
    setApplied(null);
    setDryResult(null);
    setProblem(null);
    setLoaded(null);
    setPhase("parsing");
    try {
      const sheet = await parseSheetFile(file);
      const check = checkColumns(sheet.headers, template.columns);
      if (check.missingRequired.length > 0) {
        setProblem(
          `The file is missing required column${check.missingRequired.length > 1 ? "s" : ""}: ${check.missingRequired.join(", ")}. Download the template to see the expected headers.`,
        );
        setPhase("idle");
        return;
      }
      const rows = pickColumns(sheet.rows, columnKeys);
      setLoaded({ fileName: file.name, sheet, rows, ignoredColumns: check.unknown });
      await validate(rows);
    } catch (err) {
      setProblem(err instanceof SheetParseError ? err.message : "Could not read this file.");
      setPhase("idle");
    }
  };

  const reset = () => {
    runId.current++;
    setLoaded(null);
    setDryResult(null);
    setApplied(null);
    setProblem(null);
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  // An earlier step was applied since this preview was made: its references may have changed.
  useEffect(() => {
    if (active && phase === "preview" && loaded && validatedEpoch !== epoch) void validate(loaded.rows);
  }, [active, phase, loaded, validatedEpoch, epoch, validate]);

  const confirm = async () => {
    if (!loaded) return;
    setPhase("applying");
    setProblem(null);
    try {
      const result = (await importMutation.mutateAsync({ entity, rows: loaded.rows, dryRun: false })) as ImportResult;
      setApplied(result);
      setPhase("done");
      props.onApplied(result.summary);
    } catch (err) {
      const fromDetails =
        hasCode(err, "IMPORT_HAS_ERRORS") && isApiError(err) ? resultFromErrorDetails(err.details, false) : null;
      if (fromDetails) {
        setDryResult({ ...fromDetails, dry_run: true });
        setProblem("The server found errors in these rows, so nothing was imported. Fix the file and upload it again.");
      } else {
        setProblem(describeApiError(err));
      }
      setPhase("preview");
    }
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    if (phase === "parsing" || phase === "validating" || phase === "applying") return;
    void handleFile(e.dataTransfer.files?.[0]);
  };

  const busy = phase === "parsing" || phase === "validating" || phase === "applying";
  const canConfirm = phase === "preview" && !!dryResult && dryResult.summary.error === 0 && dryResult.summary.total > 0 && !busy;

  return (
    <Card hidden={!active} aria-label={title}>
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {props.templateLoading && <Skeleton className="h-10 w-full" />}
        {!props.templateLoading && props.templateError ? (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Could not load the file format</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{describeApiError(props.templateError)}</p>
              <Button variant="outline" size="sm" onClick={props.onRetryTemplate}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {template && (
          <>
            {/* (a) templates + (b) columns help */}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => downloadTemplate(entity, template, "csv")}>
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                Download template
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadTemplate(entity, template, "xlsx")}>
                <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
                Download XLSX template
              </Button>
            </div>

            <ColumnsHelp template={template} />

            {/* (c) drop zone */}
            {phase !== "done" && (
              <label
                htmlFor={`import-file-${entity}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 hover:bg-muted/50",
                  dragging && "border-primary bg-primary/5",
                  busy && "pointer-events-none opacity-60",
                )}
              >
                {phase === "parsing" ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
                ) : (
                  <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="text-sm font-medium">
                  {loaded ? "Choose a different file" : "Drop a file here, or click to choose"}
                </span>
                <span className="text-xs text-muted-foreground">
                  .csv, .xlsx or .xls, up to 2000 rows. The first row must be the column names.
                </span>
                <input
                  ref={inputRef}
                  id={`import-file-${entity}`}
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => void handleFile(e.target.files?.[0])}
                />
              </label>
            )}

            {problem && (
              <Alert variant="destructive" role="alert">
                <XCircle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>{phase === "preview" ? "Import not applied" : "Problem with this file"}</AlertTitle>
                <AlertDescription>{problem}</AlertDescription>
              </Alert>
            )}

            {loaded && phase !== "done" && (
              <div className="space-y-1 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="font-medium">{loaded.fileName}</span>
                  <span className="text-muted-foreground">
                    {loaded.rows.length} row{loaded.rows.length === 1 ? "" : "s"}
                    {loaded.sheet.droppedBlank > 0 ? `, ${loaded.sheet.droppedBlank} blank skipped` : ""}
                  </span>
                </p>
                {loaded.ignoredColumns.length > 0 && (
                  <p className="text-muted-foreground">Ignored columns: {loaded.ignoredColumns.join(", ")}</p>
                )}
              </div>
            )}

            {/* (d) dry run */}
            {phase === "validating" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Checking your file. Nothing is saved yet.
              </div>
            )}

            {(phase === "preview" || phase === "applying") && dryResult && loaded && (
              <>
                <ImportPreviewTable columnKeys={columnKeys} rows={loaded.rows} lines={loaded.sheet.lines} result={dryResult} />
                {dryResult.summary.error > 0 ? (
                  <p className="text-sm text-destructive">
                    {dryResult.summary.error} row{dryResult.summary.error === 1 ? " has" : "s have"} errors. Fix them in your file
                    and upload it again; nothing is imported until every row is valid.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Looks good. Confirm to save {dryResult.summary.create} new and {dryResult.summary.update} updated record
                    {dryResult.summary.create + dryResult.summary.update === 1 ? "" : "s"}. Existing records missing from the file
                    are left alone.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => void confirm()} disabled={!canConfirm}>
                    {phase === "applying" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    {phase === "applying" ? "Importing..." : "Confirm import"}
                  </Button>
                  <Button variant="outline" onClick={() => void validate(loaded.rows)} disabled={busy}>
                    <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                    Re-check
                  </Button>
                  <Button variant="ghost" onClick={reset} disabled={busy}>
                    Remove file
                  </Button>
                </div>
              </>
            )}

            {/* success */}
            {phase === "done" && applied && (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                <AlertTitle>{title} imported</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>
                    {applied.summary.create} created, {applied.summary.update} updated ({applied.summary.total} row
                    {applied.summary.total === 1 ? "" : "s"}).
                  </p>
                  <Button variant="link" className="h-auto p-0" onClick={reset}>
                    Import another file for this step
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        {/* footer: next / skip */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          {phase === "done" || props.alreadyImported ? (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              Imported
            </Badge>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {phase !== "done" && (
              <Button variant="ghost" onClick={props.onSkip} disabled={busy}>
                <SkipForward className="mr-2 h-4 w-4" aria-hidden="true" />
                {props.alreadyImported ? "Continue" : "Skip this step"}
              </Button>
            )}
            {phase === "done" && (
              <Button onClick={props.onNext}>
                {props.nextLabel}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ColumnsHelp({ template }: { template: ImportTemplate }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-2 gap-1">
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
          Columns ({template.columns.length})
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-2 divide-y rounded-md border text-sm">
          {template.columns.map((c) => (
            <li key={c.key} className="grid gap-1 px-3 py-2 sm:grid-cols-[11rem_1fr_11rem] sm:gap-3">
              <div className="flex items-center gap-2">
                <code className="font-mono text-xs font-semibold">{c.key}</code>
                {c.required ? (
                  <Badge variant="outline">Required</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">optional</span>
                )}
              </div>
              <p className="text-muted-foreground">{c.description}</p>
              <p className="min-w-0 break-words text-xs text-muted-foreground">
                {c.example ? (
                  <>
                    e.g. <span className="font-mono">{c.example}</span>
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
