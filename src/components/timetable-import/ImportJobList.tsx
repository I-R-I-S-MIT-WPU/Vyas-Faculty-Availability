import { useState } from "react";
import { TimetableImportJob } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { format } from "date-fns";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

const STATUS_BADGE: Record<TimetableImportJob["status"], string> = {
  CREATED: "border-slate-300 text-slate-600",
  PROCESSING: "border-blue-300 text-blue-700 bg-blue-50",
  REVIEW_REQUIRED: "border-amber-300 text-amber-700 bg-amber-50",
  APPROVED: "border-purple-300 text-purple-700 bg-purple-50",
  COMPLETED: "border-green-300 text-green-700 bg-green-50",
  FAILED: "border-red-300 text-red-700 bg-red-50",
};

interface ImportJobListProps {
  jobs: TimetableImportJob[];
  loading: boolean;
  onSelectJob: (jobId: string) => void;
  onCreateNew: () => void;
  onRefresh: () => void;
  onDeleteJob: (jobId: string) => Promise<void>;
}

export function ImportJobList({ jobs, loading, onSelectJob, onCreateNew, onRefresh, onDeleteJob }: ImportJobListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (jobId: string) => {
    setDeletingId(jobId);
    try {
      await onDeleteJob(jobId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Import jobs</h2>
          <p className="text-sm text-muted-foreground">
            Upload timetable documents and let the system extract recurring lectures for review.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={onCreateNew}>
            <Plus className="h-4 w-4 mr-2" />
            New Import
          </Button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {loading ? "Loading import jobs..." : "No import jobs yet. Click \"New Import\" to get started."}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Semester</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Files</TableHead>
                <TableHead>Created by</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.name}</TableCell>
                  <TableCell>{job.semester || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_BADGE[job.status]}>
                      {job.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>{job.file_count ?? 0}</TableCell>
                  <TableCell>{job.created_by_name || "—"}</TableCell>
                  <TableCell>{format(new Date(job.created_at), "MMM dd, yyyy")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => onSelectJob(job.id)}>
                        {job.status === "CREATED" ? "Continue" : "View"}
                      </Button>
                      {job.status !== "PROCESSING" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deletingId === job.id}
                              className="gap-1"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete "{job.name}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This cannot be undone. It removes all uploaded files, extracted lectures, and
                                conflict records for this import.
                                {(job.status === "APPROVED" || job.status === "COMPLETED") &&
                                  " Room bookings already created by this import will NOT be removed."}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={deletingId === job.id}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(job.id)}
                                disabled={deletingId === job.id}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {deletingId === job.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Delete import"
                                )}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
