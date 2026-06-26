import { ImportConflict } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";

interface ConflictsPanelProps {
  conflicts: ImportConflict[];
  onResolve: (conflictId: string) => void;
  resolvingId: string | null;
}

export function ConflictsPanel({ conflicts, onResolve, resolvingId }: ConflictsPanelProps) {
  const unresolved = conflicts.filter((c) => !c.resolved);

  if (conflicts.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
        <CheckCircle2 className="h-4 w-4" />
        No conflicts detected.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Conflicts ({unresolved.length} unresolved of {conflicts.length})
      </h3>
      {conflicts.map((conflict) => (
        <div
          key={conflict.id}
          className={`flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm ${
            conflict.resolved
              ? "border-muted bg-muted/30 opacity-60"
              : conflict.severity === "ERROR"
                ? "border-red-200 bg-red-50"
                : "border-amber-200 bg-amber-50"
          }`}
        >
          <div className="flex items-start gap-2">
            {conflict.severity === "ERROR" ? (
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            )}
            <div>
              <Badge variant="outline" className="mb-1 text-xs">
                {conflict.conflict_type.replace("_", " ")}
              </Badge>
              <p>{conflict.description}</p>
            </div>
          </div>
          {!conflict.resolved && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={resolvingId === conflict.id}
              onClick={() => onResolve(conflict.id)}
            >
              {resolvingId === conflict.id ? "Resolving..." : "Mark resolved"}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
