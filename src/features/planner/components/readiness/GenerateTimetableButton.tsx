import { useState } from "react";
import { AlertTriangle, ChevronDown, Loader2, Sparkles, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { buildGenerateRequest, cancelNote, quickActions, regenerateWarning, type QuickAction } from "../../lib/generateFlow";
import { STALLED_HINT, progressPercent, stageLabel } from "../../lib/generation";
import { useGenerateFlow } from "./useGenerateFlow";

export interface GenerateTimetableButtonProps {
  termId: string;
  versionId: string;
  /** The division on screen; when absent only the "all divisions" action is offered. */
  divisionId?: string | null;
  divisionName?: string;
  className?: string;
}

/**
 * Compact generator for the editor header: a menu with the fill/regenerate actions, inline progress with Cancel while a
 * run is active, and a toast with the result and an Undo action when it finishes.
 */
export function GenerateTimetableButton({ versionId, divisionId, divisionName, className }: GenerateTimetableButtonProps) {
  const flow = useGenerateFlow(versionId, { where: "editor", notify: true });
  const [pending, setPending] = useState<QuickAction | null>(null);
  const actions = quickActions(divisionId, divisionName);
  const { active } = flow;

  const run = async (action: QuickAction) => {
    setPending(null);
    await flow.start(buildGenerateRequest({ mode: action.request.mode, divisionIds: action.request.divisionIds, confirmed: action.confirm }));
  };
  const choose = (action: QuickAction) => {
    if (action.confirm) setPending(action);
    else void run(action);
  };

  if (active) {
    const pct = progressPercent(active);
    return (
      <div className={cn("flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5", className)} data-testid="generate-progress">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        <div className="w-28 space-y-1 sm:w-40">
          <p className="truncate text-xs font-medium">{active.status === "queued" ? "Waiting to start" : stageLabel(active.stage)}</p>
          <Progress value={pct} className="h-1.5" aria-label={`Generation progress ${pct}%`} />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
        {flow.stalled && (
          <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400" role="status" data-testid="stalled-run">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="max-w-[16rem] sm:max-w-xs">{STALLED_HINT}</span>
          </span>
        )}
        <Button
          variant={flow.stalled ? "destructive" : "ghost"}
          size={flow.stalled ? "sm" : "icon"}
          className={flow.stalled ? "h-7" : "h-7 w-7"}
          onClick={flow.cancelActive}
          disabled={flow.cancelling}
          aria-label={`Cancel generation. ${cancelNote(active.stage)}`}
          title={`Cancel generation. ${cancelNote(active.stage)}`}
        >
          <X className={flow.stalled ? "mr-1 h-4 w-4" : "h-4 w-4"} aria-hidden="true" />
          {flow.stalled ? "Cancel" : null}
        </Button>
      </div>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className={className} disabled={flow.starting} aria-label="Generate timetable options">
            {flow.starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />}
            Generate
            <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Generate timetable</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {actions.map((a) => (
            <DropdownMenuItem key={a.id} onSelect={() => choose(a)} className="flex flex-col items-start gap-0.5">
              <span className="font-medium">{a.label}</span>
              <span className="text-xs text-muted-foreground">{a.hint}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.label ?? "Regenerate"}?</AlertDialogTitle>
            <AlertDialogDescription>{regenerateWarning}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && void run(pending)}>Regenerate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default GenerateTimetableButton;
