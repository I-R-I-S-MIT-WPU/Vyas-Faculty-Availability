import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PlannerLayout } from "../components/PlannerLayout";
import { EditorBoard } from "../components/editor/EditorBoard";
import { GenerateTimetableButton } from "../components/readiness/GenerateTimetableButton";
import { useEditorSocket } from "../components/editor/useEditorSocket";
import { useGenerationRuns, useSnapshot, useTerm } from "../hooks";
import { describeApiError } from "../lib/errors";
import { plannerEnabled } from "../lib/flag";
import { divisionLabel } from "../lib/generateFlow";
import { isActive } from "../lib/generation";
import { sortDivisions } from "../lib/sessionFilters";
import { termLabel } from "../lib/time";

/** A per-tab id sent with every edit so the socket echo of our own change can be recognised and skipped. */
function newClientId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* insecure context: fall through */
  }
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function PlannerEditorPage() {
  const { termId = "" } = useParams();
  const { user, isAdmin } = useAuth();

  // PlannerLayout does the flag / sign-in / admin guard; start the data hooks only for an allowed viewer.
  if (!plannerEnabled() || !user || !isAdmin) {
    return <PlannerLayout title="Timetable editor">{null}</PlannerLayout>;
  }
  return <EditorPage termId={termId} />;
}

function EditorPage({ termId }: { termId: string }) {
  const detail = useTerm(termId);
  const term = detail.data?.term;
  const versionId = detail.data?.draft_version_id ?? null;
  const setupPath = `/admin/planner/terms/${termId}`;

  return (
    <PlannerLayout
      wide
      title="Timetable editor"
      description={term ? termLabel(term) : undefined}
      crumbs={[{ label: "Term setup", to: setupPath }, { label: "Editor" }]}
      actions={
        <>
          {versionId && <HeaderGenerate termId={termId} versionId={versionId} />}
          <Button asChild variant="outline" size="sm">
            <Link to={setupPath}>
              <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Term setup
            </Link>
          </Button>
        </>
      }
    >
      {detail.error ? (
        <div className="rounded-md border p-8 text-center">
          <p className="text-sm text-destructive">{describeApiError(detail.error)}</p>
          <div className="mt-3 flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => detail.refetch()}>
              Try again
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/planner">Back to terms</Link>
            </Button>
          </div>
        </div>
      ) : detail.isLoading ? (
        <EditorSkeleton />
      ) : !versionId ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <h2 className="text-lg font-semibold">This term has no draft version</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            The editor works on the draft timetable, and there is no draft to edit right now.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to={setupPath}>Back to term setup</Link>
          </Button>
        </div>
      ) : (
        <EditorLoader termId={termId} versionId={versionId} />
      )}
    </PlannerLayout>
  );
}

/**
 * The header's Generate button. The division on screen is worked out the same way EditorLoader does it (?division= if it
 * names a real division, else the first), from the snapshot query the editor already shares.
 */
function HeaderGenerate({ termId, versionId }: { termId: string; versionId: string }) {
  const [params] = useSearchParams();
  const snapshot = useSnapshot(versionId);
  const divisions = sortDivisions(snapshot.data?.divisions ?? []);
  const requested = params.get("division");
  const division = divisions.find((d) => d.id === requested) ?? divisions[0] ?? null;
  return (
    <GenerateTimetableButton
      termId={termId}
      versionId={versionId}
      divisionId={division?.id ?? null}
      divisionName={division ? divisionLabel(division) : undefined}
    />
  );
}

function EditorSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)]" aria-busy="true" aria-label="Loading the editor">
      <Skeleton className="h-64" />
      <Skeleton className="h-[32rem]" />
    </div>
  );
}

/** Loads the snapshot, keeps it live through the socket, and picks the active division from ?division=. */
function EditorLoader({ termId, versionId }: { termId: string; versionId: string }) {
  const [clientId] = useState(newClientId);
  const [params, setParams] = useSearchParams();
  const snapshot = useSnapshot(versionId);
  const { status } = useEditorSocket(versionId, { ownClientId: clientId });
  // A run is queued/running: the board is read-only until it finishes. Shares the query (and its polling) with the header
  // button; only that one refreshes the editor's data when the run ends.
  const runs = useGenerationRuns(versionId, { refreshOnFinish: false });
  const generationActive = !!runs.data && (!!runs.data.active || runs.data.runs.some(isActive));
  const data = snapshot.data;

  if (!data) {
    if (snapshot.error) {
      return (
        <div className="rounded-md border p-8 text-center">
          <p className="text-sm text-destructive">{describeApiError(snapshot.error)}</p>
          <div className="mt-3 flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => snapshot.refetch()}>
              Try again
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to={`/admin/planner/terms/${termId}`}>Back to term setup</Link>
            </Button>
          </div>
        </div>
      );
    }
    return <EditorSkeleton />;
  }

  const divisions = sortDivisions(data.divisions);
  const requested = params.get("division");
  const divisionId = divisions.find((d) => d.id === requested)?.id ?? divisions[0]?.id ?? null;

  const setDivision = (id: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("division", id);
        return p;
      },
      { replace: true },
    );

  return (
    <EditorBoard
      snapshot={data}
      versionId={versionId}
      clientId={clientId}
      divisionId={divisionId}
      onDivisionChange={setDivision}
      sync={status}
      generationActive={generationActive}
      outOfDate={snapshot.isError ? { retrying: snapshot.isFetching, onReload: () => void snapshot.refetch() } : undefined}
    />
  );
}
