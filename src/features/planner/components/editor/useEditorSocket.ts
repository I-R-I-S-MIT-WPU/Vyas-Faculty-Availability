// Live sync for the editor (contract section 8.3).
//
//   useEditorSocket(versionId, { ownClientId, onPatch?, onRefetch?, onStatus? }) -> { status }
//
// On mount: connectSocket() (the shared singleton), emit `join:planner` {version_id} with an ack, and listen for
// `planner:changed`. Each event is judged by decideEvent() against the CURRENT cached rev (read from the query cache
// at event time, never from a closure):
//   patch   -> merge the event's sessions into the snapshot cache and set rev (onPatch is notified)
//   refetch -> invalidate the snapshot so it reloads (onRefetch is notified)
//   ignore  -> own echo or stale
// After every successful join ack we close the gap between the first fetch (or the outage) and the join, WITHOUT
// cancelling a snapshot fetch that is already running (cancelling would restart the initial load): the server's
// current rev is read from the cheap sessions-summary endpoint, any in-flight snapshot fetch is allowed to finish,
// and the snapshot is refetched (cancelRefetch:false) only when the cached rev is behind the server's. If the rev
// check itself fails we fall back to a non-cancelling refetch. A socket 'connect' after a drop re-emits the join,
// which does the same. A rev gap seen on an event still refetches immediately (restarting an older fetch is right there).
// Status: 'connecting' | 'live' | 'offline' | 'error' (join refused). Cleanup removes exactly the handlers added here
// and emits `leave:planner`; if the unmount happens before the join ack, the ack callback emits the leave (the server
// finishes the join asynchronously, so a leave sent at unmount time could run before it). It never calls
// disconnectSocket(): the socket is shared with the rest of the app.

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectSocket } from "@/lib/socket";
import { plannerApi } from "../../api";
import { plannerKeys, refreshDiagnosticsSoon } from "../../hooks";
import { applyChanged } from "../../lib/patch";
import { decideEvent } from "../../lib/revSync";
import type { PlannerChangedEvent, Snapshot } from "../../types";

export type SyncStatus = "connecting" | "live" | "offline" | "error";

interface JoinAck {
  ok: boolean;
  error?: string;
}

export interface EditorSocketOptions {
  /** This tab's client id: events carrying it are our own echo and are ignored. */
  ownClientId: string;
  onPatch?: (evt: PlannerChangedEvent) => void;
  onRefetch?: () => void;
  onStatus?: (status: SyncStatus) => void;
}

export function useEditorSocket(versionId: string | null | undefined, options: EditorSocketOptions): { status: SyncStatus } {
  const qc = useQueryClient();
  const [status, setStatusState] = useState<SyncStatus>("connecting");

  // Callbacks change identity every render; keep the latest in a ref so the effect depends on the version only.
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    if (!versionId) return;
    const snapshotKey = plannerKeys.snapshot(versionId);
    const socket = connectSocket();
    let active = true;

    const setStatus = (next: SyncStatus) => {
      if (!active) return;
      setStatusState(next);
      optsRef.current.onStatus?.(next);
    };

    const refetch = () => {
      optsRef.current.onRefetch?.();
      void qc.invalidateQueries({ queryKey: snapshotKey });
      // The snapshot is about to change in ways the patch path does not see: the issues are stale too.
      refreshDiagnosticsSoon(qc, versionId);
    };

    /** The subscription of a catchUp that is waiting for an in-flight snapshot fetch (one at a time). */
    let stopWaiting: (() => void) | null = null;

    /** Refetch the snapshot only if the server is ahead of the cache; never cancels a fetch in flight. */
    const catchUp = async () => {
      let serverRev: number | null = null;
      try {
        serverRev = (await plannerApi.sessionsSummary(versionId)).rev;
      } catch {
        /* unknown: fall through to the unconditional (non-cancelling) refetch */
      }
      if (!active) return;
      const check = () => {
        const cached = qc.getQueryData<Snapshot>(snapshotKey);
        // No data yet (the first load failed or was cancelled): load it. Otherwise only when behind.
        if (!cached || serverRev == null || serverRev > cached.rev) {
          optsRef.current.onRefetch?.();
          void qc.invalidateQueries({ queryKey: snapshotKey }, { cancelRefetch: false });
          void qc.invalidateQueries({ queryKey: plannerKeys.diagnostics(versionId) }, { cancelRefetch: false });
        }
      };
      if (qc.isFetching({ queryKey: snapshotKey }) === 0) {
        check();
        return;
      }
      // A snapshot fetch is running (typically the initial load): let it finish, then compare its rev.
      stopWaiting?.(); // a newer join supersedes an older wait
      const cache = qc.getQueryCache();
      const unsubscribe = cache.subscribe(() => {
        if (!active) {
          unsubscribe();
          return;
        }
        if (qc.isFetching({ queryKey: snapshotKey }) === 0) {
          unsubscribe();
          check();
        }
      });
      stopWaiting = unsubscribe;
    };

    const join = () => {
      setStatus("connecting");
      socket.emit("join:planner", { version_id: versionId }, (ack?: JoinAck) => {
        if (!active) {
          // Unmounted before the ack: the server may have just put this socket in the room. Leave it again.
          if (ack?.ok) socket.emit("leave:planner", { version_id: versionId });
          return;
        }
        if (ack?.ok) {
          setStatus("live");
          void catchUp();
        } else {
          console.warn("[planner] join:planner refused:", ack?.error ?? "no acknowledgement");
          setStatus("error");
        }
      });
    };

    const onChanged = (evt: PlannerChangedEvent) => {
      if (!active || evt?.version_id !== versionId) return;
      const snap = qc.getQueryData<Snapshot>(snapshotKey);
      if (!snap) return; // the first load will include this change
      const decision = decideEvent(snap.rev, evt, optsRef.current.ownClientId);
      if (decision === "patch") {
        qc.setQueryData<Snapshot>(snapshotKey, (s) =>
          s ? { ...s, rev: evt.rev, sessions: applyChanged(s.sessions, evt.sessions ?? [], { append: true }) } : s,
        );
        void qc.invalidateQueries({ queryKey: plannerKeys.sessionsSummary(versionId) });
        void qc.invalidateQueries({ queryKey: plannerKeys.readiness(snap.version.term_id) });
        refreshDiagnosticsSoon(qc, versionId);
        optsRef.current.onPatch?.(evt);
      } else if (decision === "refetch") {
        refetch();
      }
    };

    const onConnect = () => join();
    const onDisconnect = () => setStatus("offline");
    const onConnectError = () => setStatus("offline");

    socket.on("planner:changed", onChanged);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    // Already connected (another page opened the socket): the 'connect' event will not fire again.
    if (socket.connected) join();
    else setStatus("connecting");

    return () => {
      active = false;
      stopWaiting?.();
      socket.off("planner:changed", onChanged);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      if (socket.connected) socket.emit("leave:planner", { version_id: versionId });
    };
  }, [versionId, qc]);

  return { status };
}
