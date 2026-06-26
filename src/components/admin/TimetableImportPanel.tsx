import { useEffect, useRef, useState } from "react";
import { timetableImportApi } from "@/lib/timetableImportApi";
import { ExtractedLecture, ImportJobDetail, TimetableImportJob } from "@/types/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";
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
import { ConflictsPanel } from "@/components/timetable-import/ConflictsPanel";
import { ReviewTable } from "@/components/timetable-import/ReviewTable";
import { BookingResultsView } from "@/components/timetable-import/BookingResultsView";

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
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

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

  const openJob = (jobId: string) => {
    setSelectedJobId(jobId);
    setJobDetail(null);
    setProcessingStale(false);
    setView("review");
    fetchJobDetail(jobId);
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

  const handleResolveConflict = async (conflictId: string) => {
    if (!jobDetail) return;
    setResolvingConflictId(conflictId);
    try {
      await timetableImportApi.resolveConflict(jobDetail.job.id, conflictId);
      setJobDetail((prev) =>
        prev
          ? { ...prev, conflicts: prev.conflicts.map((c) => (c.id === conflictId ? { ...c, resolved: true } : c)) }
          : prev
      );
    } catch {
      toast({ title: "Error", description: "Failed to resolve conflict", variant: "destructive" });
    } finally {
      setResolvingConflictId(null);
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
                <CardHeader>
                  <CardTitle>{jobDetail.job.name}</CardTitle>
                  <CardDescription>
                    {jobDetail.job.semester || "No semester set"} · Status: {jobDetail.job.status.replace("_", " ")}
                  </CardDescription>
                </CardHeader>
              </Card>

              {jobDetail.job.status === "PROCESSING" && (
                <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Extracting lectures from {jobDetail.files.length} file(s)...
                  {processingStale && (
                    <span className="ml-2 text-amber-700">Processing is taking longer than expected.</span>
                  )}
                </div>
              )}

              {jobDetail.job.status === "FAILED" && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Import failed: {jobDetail.job.error_message || "Unknown error"}
                </div>
              )}

              {jobDetail.job.status !== "CREATED" && jobDetail.job.status !== "PROCESSING" && (
                <>
                  <ConflictsPanel
                    conflicts={jobDetail.conflicts}
                    onResolve={handleResolveConflict}
                    resolvingId={resolvingConflictId}
                  />

                  <ReviewTable
                    jobId={jobDetail.job.id}
                    lectures={jobDetail.lectures}
                    onLectureUpdated={handleLectureUpdated}
                    onLectureRejected={handleLectureRejected}
                    readOnly={jobDetail.job.status !== "REVIEW_REQUIRED"}
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
