// Bottom bar of the editor: progress, version state, revision, rule diagnostics and live-sync indicator.
// The diagnostics badge ('Ready to publish' / 'Not ready: N hard issues' / 'N warnings') comes from the optional `diagnostics`
// prop. Clashes themselves cannot happen (the database refuses them); the issues are rule violations and warnings.

import { AlertTriangle, Loader2, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DiagnosticsResponse, VersionStatus } from "../../types";
import { DiagnosticsBadges } from "./DiagnosticsPanel";
import type { SyncStatus } from "./useEditorSocket";

interface Counts {
  placed: number;
  total: number;
}

export interface StatusBarProps {
  divisionName: string | null;
  division: Counts;
  term: Counts;
  versionStatus: VersionStatus;
  rev: number;
  sync: SyncStatus;
  /** Number of edits sent and not yet confirmed. */
  saving: number;
  /** The snapshot reload failed but cached data is shown: say so instead of "Live". */
  outOfDate?: OutOfDate;
  /** Latest diagnostics (null/undefined until loaded): shows the readiness badge. Omit to hide it. */
  diagnostics?: DiagnosticsResponse | null;
}

export interface OutOfDate {
  /** A reload attempt is running right now. */
  retrying: boolean;
  onReload: () => void;
}

const SYNC = {
  connecting: { icon: Loader2, word: "Connecting", spin: true, hint: "Connecting to live updates" },
  live: { icon: Wifi, word: "Live", spin: false, hint: "Changes from other admins appear automatically" },
  offline: { icon: WifiOff, word: "Offline", spin: false, hint: "Reconnecting. The grid reloads when the connection is back" },
  error: { icon: AlertTriangle, word: "Sync error", spin: false, hint: "Live updates could not start. Reload the page to retry" },
} as const;

const STATUS_WORD: Record<VersionStatus, string> = { draft: "Draft", published: "Published", historical: "Historical" };

export function StatusBar({ divisionName, division, term, versionStatus, rev, sync, saving, outOfDate, diagnostics }: StatusBarProps) {
  const s = SYNC[sync];
  const SyncIcon = s.icon;
  return (
    // Not a live region: only the sync-state text below announces changes (one announcement, not the whole bar).
    <div
      role="group"
      aria-label="Editor status"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-card px-3 py-2 text-sm"
    >
      {divisionName && (
        <span>
          <span className="text-muted-foreground">{divisionName}:</span>{" "}
          <strong>
            {division.placed}/{division.total}
          </strong>{" "}
          placed
        </span>
      )}
      <span>
        <span className="text-muted-foreground">Whole term:</span>{" "}
        <strong>
          {term.placed}/{term.total}
        </strong>{" "}
        placed
      </span>
      <Badge variant={versionStatus === "draft" ? "secondary" : "outline"}>{STATUS_WORD[versionStatus]}</Badge>
      <span className="text-muted-foreground">Rev {rev}</span>
      {diagnostics !== undefined && <DiagnosticsBadges diagnostics={diagnostics} />}
      {saving > 0 && (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Saving
        </span>
      )}
      {outOfDate ? (
        <span
          className="ml-auto flex items-center gap-2"
          title="The last reload failed, so what you see may be behind the server. Edits may be refused until it reloads."
        >
          <span className="flex items-center gap-1 text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <span aria-live="polite">{outOfDate.retrying ? "Out of date — retrying" : "Out of date"}</span>
          </span>
          <Button type="button" variant="outline" size="sm" onClick={outOfDate.onReload} disabled={outOfDate.retrying}>
            Reload
          </Button>
        </span>
      ) : (
        <span className="ml-auto flex items-center gap-1" title={s.hint}>
          <SyncIcon className={s.spin ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
          <span aria-live="polite">{s.word}</span>
        </span>
      )}
    </div>
  );
}
