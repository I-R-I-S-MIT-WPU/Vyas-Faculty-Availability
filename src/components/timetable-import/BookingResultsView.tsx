import { ExtractedLecture } from "@/types/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";

interface BookingResultsViewProps {
  lectures: ExtractedLecture[];
}

export function BookingResultsView({ lectures }: BookingResultsViewProps) {
  const created = lectures.filter((l) => l.status === "BOOKING_CREATED");
  const failed = lectures.filter((l) => l.status === "BOOKING_FAILED");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold">{created.length}</p>
              <p className="text-sm text-muted-foreground">Recurring slots created</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <XCircle className="h-8 w-8 text-red-600" />
            <div>
              <p className="text-2xl font-bold">{failed.length}</p>
              <p className="text-sm text-muted-foreground">Failed to create</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {failed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Failed bookings
          </h3>
          {failed.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm">
              <span>
                {l.subject || "Untitled"} — {l.teacher_name || "Unknown teacher"} — Room {l.room_number || "?"}
              </span>
              <Badge variant="outline" className="border-red-300 text-red-700">
                Failed
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
