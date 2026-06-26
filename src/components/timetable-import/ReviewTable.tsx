import { useState } from "react";
import { ExtractedLecture } from "@/types/api";
import { timetableImportApi } from "@/lib/timetableImportApi";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Pencil, Save, X, Trash2 } from "lucide-react";

const WEEKDAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const CONFIDENCE_BADGE: Record<ExtractedLecture["confidence"], string> = {
  HIGH: "border-green-300 text-green-700 bg-green-50",
  MEDIUM: "border-yellow-300 text-yellow-700 bg-yellow-50",
  LOW: "border-red-300 text-red-700 bg-red-50",
};

type EditableField =
  | "teacher_name"
  | "subject"
  | "room_number"
  | "weekday_number"
  | "start_time"
  | "duration_minutes"
  | "batch"
  | "lecture_type";

interface ReviewTableProps {
  jobId: string;
  lectures: ExtractedLecture[];
  onLectureUpdated: (lecture: ExtractedLecture) => void;
  onLectureRejected: (lectureId: string) => void;
  readOnly?: boolean;
}

export function ReviewTable({ jobId, lectures, onLectureUpdated, onLectureRejected, readOnly }: ReviewTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<Record<EditableField, string>>({} as Record<EditableField, string>);
  const [saving, setSaving] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const visibleLectures = lectures.filter((l) => l.status !== "REJECTED");

  const startEdit = (lecture: ExtractedLecture) => {
    setEditingId(lecture.id);
    setEditBuffer({
      teacher_name: lecture.teacher_name ?? "",
      subject: lecture.subject ?? "",
      room_number: lecture.room_number ?? "",
      weekday_number: lecture.weekday_number ? String(lecture.weekday_number) : "",
      start_time: lecture.start_time?.slice(0, 5) ?? "",
      duration_minutes: lecture.duration_minutes ? String(lecture.duration_minutes) : "",
      batch: lecture.batch ?? "",
      lecture_type: lecture.lecture_type ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditBuffer({} as Record<EditableField, string>);
  };

  const saveEdit = async (lecture: ExtractedLecture) => {
    setSaving(true);
    try {
      const updates: Record<string, string | number> = {
        teacher_name: editBuffer.teacher_name,
        subject: editBuffer.subject,
        room_number: editBuffer.room_number,
        weekday_number: parseInt(editBuffer.weekday_number, 10),
        start_time: editBuffer.start_time,
        duration_minutes: parseInt(editBuffer.duration_minutes, 10),
        batch: editBuffer.batch,
        lecture_type: editBuffer.lecture_type,
      };
      const { lecture: updated } = await timetableImportApi.updateLecture(jobId, lecture.id, updates);
      onLectureUpdated(updated);
      toast({ title: "Saved", description: "Lecture updated." });
      cancelEdit();
    } catch (err) {
      toast({ title: "Error", description: "Failed to save changes", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (lectureId: string) => {
    setRejectingId(lectureId);
    try {
      await timetableImportApi.rejectLecture(jobId, lectureId);
      onLectureRejected(lectureId);
      toast({ title: "Rejected", description: "Lecture removed from the import." });
    } catch (err) {
      toast({ title: "Error", description: "Failed to reject lecture", variant: "destructive" });
    } finally {
      setRejectingId(null);
    }
  };

  if (visibleLectures.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        No lectures extracted yet.
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Subject</TableHead>
            <TableHead>Teacher</TableHead>
            <TableHead>Room</TableHead>
            <TableHead>Day</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>Status</TableHead>
            {!readOnly && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleLectures.map((lecture) => {
            const isEditing = editingId === lecture.id;
            return (
              <TableRow key={lecture.id}>
                <TableCell>
                  {isEditing ? (
                    <Input
                      value={editBuffer.subject}
                      onChange={(e) => setEditBuffer((p) => ({ ...p, subject: e.target.value }))}
                      className="h-8 min-w-[140px]"
                    />
                  ) : (
                    lecture.subject || <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <Input
                      value={editBuffer.teacher_name}
                      onChange={(e) => setEditBuffer((p) => ({ ...p, teacher_name: e.target.value }))}
                      className="h-8 min-w-[140px]"
                    />
                  ) : (
                    lecture.teacher_name || <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <Input
                      value={editBuffer.room_number}
                      onChange={(e) => setEditBuffer((p) => ({ ...p, room_number: e.target.value }))}
                      className="h-8 w-24"
                    />
                  ) : (
                    lecture.room_number || <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <Select
                      value={editBuffer.weekday_number}
                      onValueChange={(v) => setEditBuffer((p) => ({ ...p, weekday_number: v }))}
                    >
                      <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAY_NAMES.slice(1).map((name, i) => (
                          <SelectItem key={name} value={String(i + 1)}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    WEEKDAY_NAMES[lecture.weekday_number ?? 0] || <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <Input
                      type="time"
                      value={editBuffer.start_time}
                      onChange={(e) => setEditBuffer((p) => ({ ...p, start_time: e.target.value }))}
                      className="h-8 w-28"
                    />
                  ) : (
                    lecture.start_time?.slice(0, 5) || <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <Input
                      type="number"
                      value={editBuffer.duration_minutes}
                      onChange={(e) => setEditBuffer((p) => ({ ...p, duration_minutes: e.target.value }))}
                      className="h-8 w-20"
                    />
                  ) : lecture.duration_minutes ? (
                    `${lecture.duration_minutes}m`
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <Input
                      value={editBuffer.batch}
                      onChange={(e) => setEditBuffer((p) => ({ ...p, batch: e.target.value }))}
                      className="h-8 w-24"
                    />
                  ) : (
                    lecture.batch || <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <Select
                      value={editBuffer.lecture_type}
                      onValueChange={(v) => setEditBuffer((p) => ({ ...p, lecture_type: v }))}
                    >
                      <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CLASSROOM">Classroom</SelectItem>
                        <SelectItem value="LAB">Lab</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    lecture.lecture_type || <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={CONFIDENCE_BADGE[lecture.confidence]}>
                    {lecture.confidence}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{lecture.status.replace("_", " ")}</Badge>
                </TableCell>
                {!readOnly && (
                  <TableCell className="text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={saving} onClick={() => saveEdit(lecture)}>
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={saving} onClick={cancelEdit}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(lecture)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={rejectingId === lecture.id}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reject this lecture?</AlertDialogTitle>
                              <AlertDialogDescription>
                                "{lecture.subject || "This entry"}" will be excluded from booking generation.
                                This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleReject(lecture.id)}>Reject</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
