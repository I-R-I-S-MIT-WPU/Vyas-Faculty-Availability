import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ConfirmDelete } from "../ConfirmDelete";
import { DataTable, type Column } from "../DataTable";
import { useAddTermRooms, useAvailableRooms, useRemoveTermRoom, useTermRooms, useUpdateTermRoom } from "../../hooks";
import { describeApiError, hasCode } from "../../lib/errors";
import type { AvailableRoom, TermRoom } from "../../types";

const ALL_BUILDINGS = "__all__";

const roomTypeLabel = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, " ") : "-");

export function RoomsTab({ termId }: { termId: string }) {
  const rooms = useTermRooms(termId);
  const [addOpen, setAddOpen] = useState(false);
  const [toRemove, setToRemove] = useState<TermRoom | null>(null);
  const remove = useRemoveTermRoom(termId, { silent: true, successMessage: "Room removed from the pool" });
  const toggle = useUpdateTermRoom(termId);

  const columns: Column<TermRoom>[] = [
    { key: "building", header: "Building", cell: (r) => r.building_name },
    { key: "floor", header: "Floor", cell: (r) => <span className="tabular-nums">{r.floor_number ?? "-"}</span>, className: "hidden sm:table-cell" },
    { key: "room", header: "Room", cell: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: "type",
      header: "Type",
      cell: (r) => <Badge variant="outline">{roomTypeLabel(r.room_type)}</Badge>,
      className: "hidden md:table-cell",
    },
    { key: "capacity", header: "Capacity", cell: (r) => <span className="tabular-nums">{r.capacity ?? <span className="text-muted-foreground">&mdash;</span>}</span> },
    {
      key: "lab",
      header: "Lab",
      cell: (r) => (
        <Switch
          checked={r.is_lab}
          disabled={toggle.isPending && toggle.variables?.id === r.id}
          onCheckedChange={(checked) => toggle.mutate({ id: r.id, is_lab: checked })}
          aria-label={`${r.name} is a lab room`}
        />
      ),
    },
  ];

  return (
    <section className="space-y-4" aria-label="Room pool">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Room pool</h2>
          <p className="text-sm text-muted-foreground">The rooms this term's sessions can be placed in. Mark the ones that can host labs.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Add rooms
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={rooms.data}
        getRowId={(r) => r.id}
        isLoading={rooms.isLoading}
        error={rooms.error}
        onRetry={() => rooms.refetch()}
        emptyMessage="No rooms in the pool yet. Use Add rooms to pick from the campus rooms."
        actions={(r) => (
          <Button variant="ghost" size="icon" aria-label={`Remove ${r.name} from the pool`} onClick={() => setToRemove(r)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      />

      <AddRoomsDialog termId={termId} open={addOpen} onOpenChange={setAddOpen} poolRoomIds={new Set((rooms.data ?? []).map((r) => r.room_id))} />

      <ConfirmDelete
        open={!!toRemove}
        onOpenChange={(open) => !open && setToRemove(null)}
        title={toRemove ? `Remove ${toRemove.building_name} / ${toRemove.name}?` : "Remove room?"}
        description="The room leaves this term's pool. The room itself is not deleted from the campus."
        confirmLabel="Remove"
        onConfirm={() => remove.mutateAsync(toRemove!.id)}
        errorText={(err) =>
          hasCode(err, "IN_USE") || hasCode(err, "HAS_PLACED_SESSIONS")
            ? "Sessions are already placed in this room. Move them elsewhere before removing it."
            : describeApiError(err)
        }
      />
    </section>
  );
}

function AddRoomsDialog({
  termId,
  open,
  onOpenChange,
  poolRoomIds,
}: {
  termId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  poolRoomIds: Set<string>;
}) {
  const available = useAvailableRooms();
  const add = useAddTermRooms(termId, { silent: true });
  const [search, setSearch] = useState("");
  const [building, setBuilding] = useState(ALL_BUILDINGS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setBuilding(ALL_BUILDINGS);
      setSelected(new Set());
      setError(null);
    }
  }, [open]);

  const buildings = useMemo(() => Array.from(new Set((available.data ?? []).map((r) => r.building_name))).sort(), [available.data]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (available.data ?? []).filter(
      (r) =>
        (building === ALL_BUILDINGS || r.building_name === building) &&
        (!q || r.name.toLowerCase().includes(q) || r.building_name.toLowerCase().includes(q) || r.room_type.toLowerCase().includes(q)),
    );
  }, [available.data, search, building]);

  const selectable = visible.filter((r) => !poolRoomIds.has(r.id));
  const allVisibleSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));

  const toggleOne = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggleAllVisible = (checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of selectable) {
        if (checked) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });

  const submit = async () => {
    setError(null);
    try {
      await add.mutateAsync({ room_ids: Array.from(selected) });
      onOpenChange(false);
    } catch (err) {
      setError(describeApiError(err));
    }
  };

  const pending = add.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-1.5rem)] flex-col rounded-2xl sm:max-w-[640px] sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Add rooms to the pool</DialogTitle>
          <DialogDescription>Pick one or more campus rooms. Rooms already in the pool are greyed out. Lab rooms are marked as labs automatically.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rooms" aria-label="Search rooms" className="sm:flex-1" />
          <Select value={building} onValueChange={setBuilding}>
            <SelectTrigger className="sm:w-48" aria-label="Filter by building">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BUILDINGS}>All buildings</SelectItem>
              {buildings.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-h-[12rem] flex-1 overflow-y-auto rounded-md border">
          {available.isLoading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : available.error ? (
            <div className="p-8 text-center">
              <p className="text-sm text-destructive">{describeApiError(available.error)}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => available.refetch()}>
                Try again
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No rooms match.</p>
          ) : (
            <ul>
              <li className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-sm">
                <Checkbox
                  checked={allVisibleSelected}
                  disabled={selectable.length === 0}
                  onCheckedChange={(c) => toggleAllVisible(c === true)}
                  aria-label="Select all shown rooms"
                />
                <span className="text-muted-foreground">
                  Select all shown ({selectable.length} available)
                </span>
              </li>
              {visible.map((r) => (
                <RoomPickRow key={r.id} room={r} inPool={poolRoomIds.has(r.id)} checked={selected.has(r.id)} onChange={(c) => toggleOne(r.id, c)} />
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-sm text-muted-foreground">{selected.size} selected</span>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={pending || selected.size === 0}>
              {pending ? "Adding..." : selected.size > 0 ? `Add ${selected.size} room${selected.size === 1 ? "" : "s"}` : "Add rooms"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoomPickRow({ room, inPool, checked, onChange }: { room: AvailableRoom; inPool: boolean; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = `pick-room-${room.id}`;
  return (
    <li className={`flex items-center gap-3 border-b px-3 py-2 last:border-b-0 ${inPool ? "opacity-50" : ""}`}>
      <Checkbox id={id} checked={inPool || checked} disabled={inPool} onCheckedChange={(c) => onChange(c === true)} />
      <label htmlFor={id} className={`flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm ${inPool ? "" : "cursor-pointer"}`}>
        <span className="font-medium">{room.name}</span>
        <span className="text-muted-foreground">
          {room.building_name}
          {room.floor_number !== null && room.floor_number !== undefined ? `, floor ${room.floor_number}` : ""}
        </span>
        <Badge variant="outline">{roomTypeLabel(room.room_type)}</Badge>
        <span className="text-xs text-muted-foreground">{room.capacity != null ? `${room.capacity} seats` : "capacity unknown"}</span>
        {inPool && <Badge variant="secondary">In pool</Badge>}
      </label>
    </li>
  );
}
