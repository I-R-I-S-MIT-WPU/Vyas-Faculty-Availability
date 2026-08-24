import { useEffect, useRef, useState } from "react";
import { ImportJobEvent, TimetableImportJob } from "@/types/api";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, Loader2 } from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  QUEUED: "Waiting to start…",
  READING_FILE: "Reading file…",
  OCR: "Running OCR on scanned pages…",
  CALLING_LLM: "Extracting lectures with AI…",
  CORRELATING: "Cross-checking files…",
  DETECTING_CONFLICTS: "Checking for conflicts…",
  GENERATING_BOOKINGS: "Creating bookings…",
  DONE: "Finishing up…",
};

// Rotating flavor text shown under the stage heading, grouped by the phase
// of the pipeline a given backend `current_stage` belongs to. CALLING_LLM
// covers both "extracting data" and "calling Gemini" conceptually (the
// backend has no separate stage for each), so it cycles through both pools
// combined rather than picking one arbitrarily.
const READING_FILES_MICROCOPY = ["Scanning documents...", "Parsing payload...", "Ingesting uploads..."];
const EXTRACTING_DATA_MICROCOPY = ["Isolating fields...", "Mapping schema...", "Extracting attributes..."];
const PROCESSING_MICROCOPY = ["Analyzing structures...", "Synthesizing data...", "Normalizing inputs..."];
const JOB_QUEUES_MICROCOPY = ["Scheduling payload...", "Staging execution...", "Optimizing queue..."];
const GEMINI_API_MICROCOPY = ["Querying model...", "Generating response...", "Evaluating insights..."];

const MICROCOPY_BY_STAGE: Record<string, string[]> = {
  QUEUED: JOB_QUEUES_MICROCOPY,
  READING_FILE: READING_FILES_MICROCOPY,
  OCR: READING_FILES_MICROCOPY,
  CALLING_LLM: [...EXTRACTING_DATA_MICROCOPY, ...GEMINI_API_MICROCOPY],
  CORRELATING: PROCESSING_MICROCOPY,
  DETECTING_CONFLICTS: PROCESSING_MICROCOPY,
};

const MICROCOPY_ROTATE_MS = 2200;

interface ProgressPanelProps {
  job: TimetableImportJob;
  events: ImportJobEvent[];
  stale: boolean;
}

export function ProgressPanel({ job, events, stale }: ProgressPanelProps) {
  const toastedJobIdRef = useRef<string | null>(null);
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    if (toastedJobIdRef.current === job.id) return;
    const firstError = events.find((e) => e.event_type === "ERROR");
    if (firstError) {
      toastedJobIdRef.current = job.id;
      toast({ title: "Import error", description: firstError.message, variant: "destructive" });
    }
  }, [job.id, events]);

  const microcopyPool = MICROCOPY_BY_STAGE[job.current_stage ?? ""];

  // Reset to the first phrase and restart the rotation whenever the stage
  // changes, so microcopy never shows a stale phrase from a previous stage.
  useEffect(() => {
    setPhraseIndex(0);
    if (!microcopyPool || microcopyPool.length === 0) return;
    const intervalId = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % microcopyPool.length);
    }, MICROCOPY_ROTATE_MS);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.current_stage]);

  const stageLabel = STAGE_LABELS[job.current_stage ?? ""] ?? "Processing…";
  const microcopy = microcopyPool?.[phraseIndex];

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm text-blue-700">
        <Loader2 className="h-4 w-4 animate-spin" />
        {stageLabel}
        {job.files_total > 0 && (
          <span className="text-blue-600">
            (file {Math.min(job.files_completed + 1, job.files_total)} of {job.files_total})
          </span>
        )}
        {stale && <span className="ml-2 text-amber-700">Processing is taking longer than expected.</span>}
      </div>

      {microcopy && <div className="text-xs text-blue-500">{microcopy}</div>}

      <Progress value={job.progress_percent} />

      {events.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Event log ({events.length})</summary>
          <div className="mt-2 max-h-48 overflow-y-auto space-y-1 rounded border bg-background p-2">
            {events.map((event) => (
              <div
                key={event.id}
                className={
                  event.event_type === "ERROR"
                    ? "flex items-start gap-1 text-red-700"
                    : "flex items-start gap-1"
                }
              >
                {event.event_type === "ERROR" && <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />}
                <span>
                  <span className="text-muted-foreground">
                    {new Date(event.created_at).toLocaleTimeString()}
                  </span>{" "}
                  {event.message}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
