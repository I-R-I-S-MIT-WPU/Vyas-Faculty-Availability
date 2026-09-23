import { useEffect, useRef, useState } from "react";
import { timetableImportApi } from "@/lib/timetableImportApi";
import { ExtractedLecture, ImportJobDetail, ImportJobEvent, TimetableImportJob } from "@/types/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ImportJobList } from "@/components/timetable-import/ImportJobList";
import { FileUploadZone } from "@/components/timetable-import/FileUploadZone";
import { ReviewTable } from "@/components/timetable-import/ReviewTable";
import { BookingResultsView } from "@/components/timetable-import/BookingResultsView";
import { ProgressPanel } from "@/components/timetable-import/ProgressPanel";

type View = "list" | "create" | "review";

const PROCESSING_STALL_MS = 10 * 60 * 1000;

export const TimetableImportPanel = () => {
  const [view, setView] = useState<View>("list");

  const [jobs, setJobs] = useState<TimetableImportJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobDetail, setJobDetail] = useState<ImportJobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [processingStale, setProcessingStale] = useState(false);
  const [approving, setApproving] = useState(false);
  const [jobEvents, setJobEvents] = useState<ImportJobEvent[]>([]);
  const [stopping, setStopping] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [retryingFileId, setRetryingFileId] = useState<string | null>(null);
  const eventsSinceRef = useRef<string | undefined>(undefined);

  const [createForm, setCreateForm] = useState({ name: "", semester: "", effective_from: "" });
  const [creatingJob, setCreatingJob] = useState(false);
  const [draftJobId, setDraftJobId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const pollStartRef = useRef<number | null>(null);

  useEffect(() => {
    fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchJobs = async () => {
    setJobsLoading(true);
    try {
      const { jobs: list } = await timetableImportApi.listJobs();
      setJobs(list || []);
    } catch {
      toast({ title: "Error", description: "Failed to load import jobs", variant: "destructive" });
    } finally {
      setJobsLoading(false);
    }
  };

  const fetchJobDetail = async (jobId: string) => {
    setDetailLoading(true);
    try {
      const detail = await timetableImportApi.getJob(jobId);
      setJobDetail(detail);
      return detail;
    } catch {
      toast({ title: "Error", description: "Failed to load job details", variant: "destructive" });
      return null;
    } finally {
      setDetailLoading(false);
    }
  };

  const fetchJobEvents = async (jobId: string) => {
    try {
      const { events } = await timetableImportApi.getEvents(jobId, eventsSinceRef.current);
      if (events.length) {
        // The `since` cursor is inclusive (millisecond-precision Date vs.
        // microsecond-precision TIMESTAMPTZ), so the boundary row can come
        // back again — dedupe by id rather than dropping it server-side.
        setJobEvents((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          const fresh = events.filter((e) => !seen.has(e.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
        eventsSinceRef.current = events[events.length - 1].created_at;
      }
    } catch {
      // Events are supplementary — don't spam toasts if a single poll fails.
    }
  };

  const openJob = (jobId: string) => {
    setSelectedJobId(jobId);
    setJobDetail(null);
    setProcessingStale(false);
    setJobEvents([]);
    eventsSinceRef.current = undefined;
    setView("review");
    fetchJobDetail(jobId);
    fetchJobEvents(jobId);
  };

  const backToList = () => {
    setView("list");
    setSelectedJobId(null);
    setJobDetail(null);
    setDraftJobId(null);
    setSelectedFiles([]);
    setCreateForm({ name: "", semester: "", effective_from: "" });
    fetchJobs();
  };

  // Poll while the background worker is actively processing or generating bookings.
  useEffect(() => {
    const status = jobDetail?.job.status;
    if (view !== "review" || !selectedJobId) return;
    if (status !== "PROCESSING" && status !== "APPROVED") return;

    if (pollStartRef.current === null) pollStartRef.current = Date.now();

    const intervalId = setInterval(async () => {
      const detail = await fetchJobDetail(selectedJobId);
      fetchJobEvents(selectedJobId);
      if (!detail) return;
      const stillRunning = detail.job.status === "PROCESSING" || detail.job.status === "APPROVED";
      const tooLong = Date.now() - (pollStartRef.current ?? Date.now()) > PROCESSING_STALL_MS;
      if (tooLong) setProcessingStale(true);
      if (!stillRunning || tooLong) clearInterval(intervalId);
    }, 5000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedJobId, jobDetail?.job.status]);

  useEffect(() => {
    if (jobDetail?.job.status !== "PROCESSING" && jobDetail?.job.status !== "APPROVED") {
      pollStartRef.current = null;
    }
  }, [jobDetail?.job.status]);

  const handleCreateJob = async () => {
    if (!createForm.name.trim()) {
      toast({ title: "Validation error", description: "Import name is required", variant: "destructive" });
      return;
    }
    setCreatingJob(true);
    try {
      const { job } = await timetableImportApi.createJob({
        name: createForm.name.trim(),
        semester: createForm.semester.trim() || undefined,
        effective_from: createForm.effective_from || undefined,
      });
      setDraftJobId(job.id);
    } catch {
      toast({ title: "Error", description: "Failed to create import job", variant: "destructive" });
    } finally {
      setCreatingJob(false);
    }
  };

  const handleStartProcessing = async () => {
    if (!draftJobId || selectedFiles.length === 0) return;
    setUploading(true);
    try {
      await timetableImportApi.uploadFiles(draftJobId, selectedFiles);
      await timetableImportApi.startProcessing(draftJobId);
      toast({ title: "Processing started", description: "Extraction is running in the background." });
      openJob(draftJobId);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to start processing",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleLectureUpdated = (updated: ExtractedLecture) => {
    setJobDetail((prev) =>
      prev ? { ...prev, lectures: prev.lectures.map((l) => (l.id === updated.id ? updated : l)) } : prev
    );
  };

  const handleLectureRejected = (lectureId: string) => {
    setJobDetail((prev) =>
      prev
        ? { ...prev, lectures: prev.lectures.map((l) => (l.id === lectureId ? { ...l, status: "REJECTED" } : l)) }
        : prev
    );
  };

  const handleApprove = async () => {
    if (!jobDetail) return;
    setApproving(true);
    try {
      await timetableImportApi.approveJob(jobDetail.job.id);
      toast({ title: "Approved", description: "Booking generation started." });
      fetchJobDetail(jobDetail.job.id);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to approve import",
        variant: "destructive",
      });
    } finally {
      setApproving(false);
    }
  };

  const handleStop = async () => {
    if (!jobDetail) return;
    setStopping(true);
    try {
      await timetableImportApi.stopJob(jobDetail.job.id);
      toast({ title: "Stop requested", description: "Processing will halt at the next checkpoint." });
      fetchJobDetail(jobDetail.job.id);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to stop import",
        variant: "destructive",
      });
    } finally {
      setStopping(false);
    }
  };

  const handleRetryFailedChunks = async (fileId: string) => {
    if (!jobDetail) return;
    setRetryingFileId(fileId);
    try {
      await timetableImportApi.retryFailedChunks(jobDetail.job.id, fileId);
      toast({ title: "Retry started", description: "Re-processing the failed sections in the background." });
      // The retry runs as a background job (same pattern as the rest of this
      // pipeline) — poll once now and rely on the existing 5s poll loop
      // (only active while status is PROCESSING/APPROVED) to pick up
      // further changes; a manual refetch here still shows progress sooner
      // if the retry finishes quickly.
      fetchJobDetail(jobDetail.job.id);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to start retry",
        variant: "destructive",
      });
    } finally {
      setRetryingFileId(null);
    }
  };

  const handleDelete = async () => {
    if (!jobDetail) return;
    setDeleting(true);
    try {
      await timetableImportApi.deleteJob(jobDetail.job.id);
      toast({ title: "Deleted", description: "Import job and its data were removed." });
      backToList();
    } catch (err) {
      const description =
        err instanceof Error && err.message.toLowerCase().includes("still processing")
          ? "Stop requested. Once processing has fully stopped, you can delete this job."
          : err instanceof Error
            ? err.message
            : "Failed to delete import job";
      toast({ title: "Error", description, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteFromList = async (jobId: string) => {
    try {
      await timetableImportApi.deleteJob(jobId);
      toast({ title: "Deleted", description: "Import job and its data were removed." });
      fetchJobs();
    } catch (err) {
      const description =
        err instanceof Error && err.message.toLowerCase().includes("still processing")
          ? "Stop requested. Once processing has fully stopped, you can delete this job."
          : err instanceof Error
            ? err.message
            : "Failed to delete import job";
      toast({ title: "Error", description, variant: "destructive" });
    }
  };

  const unresolvedErrors = jobDetail?.conflicts.filter((c) => c.severity === "ERROR" && !c.resolved) ?? [];
  const pendingCount = jobDetail?.lectures.filter((l) => l.status === "PENDING").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Timetable Import</h1>
        <p className="text-muted-foreground">Upload timetable documents and review LLM-extracted lectures before booking.</p>
      </div>

      {view === "list" && (
        <ImportJobList
          jobs={jobs}
          loading={jobsLoading}
          onSelectJob={openJob}
          onCreateNew={() => setView("create")}
          onRefresh={fetchJobs}
          onDeleteJob={handleDeleteFromList}
        />
      )}

      {view === "create" && (
        <div className="space-y-4 max-w-2xl mx-auto">
          <Button variant="ghost" size="sm" onClick={backToList}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to jobs
          </Button>
          <Card>
            <CardHeader>
              <CardTitle>New timetable import</CardTitle>
              <CardDescription>
                {!draftJobId
                  ? "Name this import batch, then upload the source documents."
                  : "Upload one or more timetable files, then start processing."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!draftJobId ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="import-name">Import name *</Label>
                    <Input
                      id="import-name"
                      value={createForm.name}
                      onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="e.g., Sem 2 2026 — Computer Engineering"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="import-semester">Semester</Label>
                    <Input
                      id="import-semester"
                      value={createForm.semester}
                      onChange={(e) => setCreateForm((p) => ({ ...p, semester: e.target.value }))}
                      placeholder="e.g., Sem 2 2026"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="import-effective">Effective from</Label>
                    <Input
                      id="import-effective"
                      type="date"
                      value={createForm.effective_from}
                      onChange={(e) => setCreateForm((p) => ({ ...p, effective_from: e.target.value }))}
                    />
                  </div>
                  <Button onClick={handleCreateJob} disabled={creatingJob}>
                    {creatingJob ? "Creating..." : "Create job"}
                  </Button>
                </>
              ) : (
                <>
                  <FileUploadZone selectedFiles={selectedFiles} onFilesSelected={setSelectedFiles} disabled={uploading} />
                  <Button onClick={handleStartProcessing} disabled={uploading || selectedFiles.length === 0}>
                    {uploading ? "Uploading..." : "Upload & start processing"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {view === "review" && (
        <div className="space-y-6">
          <Button variant="ghost" size="sm" onClick={backToList}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to jobs
          </Button>

          {detailLoading && !jobDetail ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : jobDetail ? (
            <>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>{jobDetail.job.name}</CardTitle>
                    <CardDescription>
                      {jobDetail.job.semester || "No semester set"} · Status: {jobDetail.job.status.replace("_", " ")}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {jobDetail.job.status === "PROCESSING" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" disabled={stopping || jobDetail.job.cancel_requested}>
                            {jobDetail.job.cancel_requested ? "Stopping..." : "Stop"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Stop this import?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will stop processing at the next safe checkpoint. Files already read will keep
                              their partial results for review — nothing new will be added.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleStop} disabled={stopping}>
                              {stopping ? "Stopping..." : "Stop"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {jobDetail.job.status !== "PROCESSING" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" disabled={deleting} className="gap-1">
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this import job?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This cannot be undone. It removes all uploaded files, extracted lectures, and
                              conflict records for this import.
                              {(jobDetail.job.status === "APPROVED" || jobDetail.job.status === "COMPLETED") &&
                                " Room bookings already created by this import will NOT be removed."}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleDelete}
                              disabled={deleting}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete import"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardHeader>
              </Card>

              {jobDetail.job.status === "PROCESSING" && (
                <ProgressPanel job={jobDetail.job} events={jobEvents} stale={processingStale} />
              )}

              {jobDetail.job.status === "CANCELLED" && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  Import stopped by admin.
                  {jobDetail.job.stopped_at && ` (${new Date(jobDetail.job.stopped_at).toLocaleString()})`}
                </div>
              )}

              {jobDetail.job.status === "FAILED" && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Import failed: {jobDetail.job.error_message || "Unknown error"}
                </div>
              )}

              {jobDetail.job.status !== "CREATED" && jobDetail.job.status !== "PROCESSING" && (
                <>
                  {jobDetail.files.some((f) => f.failed_chunks.length > 0) && (
                    <div className="space-y-2">
                      {jobDetail.files
                        .filter((f) => f.failed_chunks.length > 0)
                        .map((f) => {
                          const totalChunks = f.failed_chunks[0]?.totalChunks ?? f.failed_chunks.length;
                          return (
                            <div
                              key={f.id}
                              className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                            >
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>
                                  {f.failed_chunks.length} of {totalChunks} section{totalChunks === 1 ? "" : "s"} of
                                  "{f.original_filename}" could not be processed — some lectures may be missing.
                                </span>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="shrink-0"
                                disabled={retryingFileId === f.id}
                                onClick={() => handleRetryFailedChunks(f.id)}
                              >
                                {retryingFileId === f.id ? "Starting..." : "Retry failed sections"}
                              </Button>
                            </div>
                          );
                        })}
                    </div>
                  )}

                  <ReviewTable
                    jobId={jobDetail.job.id}
                    lectures={jobDetail.lectures}
                    onLectureUpdated={handleLectureUpdated}
                    onLectureRejected={handleLectureRejected}
                    readOnly={jobDetail.job.status !== "REVIEW_REQUIRED"}
                    conflicts={jobDetail.conflicts}
                  />

                  {jobDetail.job.status === "REVIEW_REQUIRED" && (
                    <div className="flex justify-end">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button disabled={unresolvedErrors.length > 0 || pendingCount === 0}>
                            Approve &amp; generate {pendingCount} booking{pendingCount === 1 ? "" : "s"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Approve this import?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {pendingCount} lecture{pendingCount === 1 ? "" : "s"} will be submitted as recurring
                              room bookings. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleApprove} disabled={approving}>
                              {approving ? "Approving..." : "Approve"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}

                  {(jobDetail.job.status === "APPROVED" || jobDetail.job.status === "COMPLETED") && (
                    <BookingResultsView lectures={jobDetail.lectures} />
                  )}
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Job not found.</p>
          )}
        </div>
      )}
    </div>
  );
};
