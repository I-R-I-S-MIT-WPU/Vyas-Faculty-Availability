import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Room, Floor } from "@/types/database";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { X, Plus } from "lucide-react";

interface RoomManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room?: Room | null;
  onRoomSaved: () => void;
}

const ROOM_TYPES = [
  { value: "classroom", label: "Lecture Room" },
  { value: "lab", label: "Lab" },
  { value: "conference", label: "Conference Room" },
  { value: "auditorium", label: "Hall" },
  { value: "seminar", label: "Seminar Room" },
  { value: "discussion", label: "Discussion Room" },
];

export const RoomManagementDialog = ({
  open,
  onOpenChange,
  room,
  onRoomSaved,
}: RoomManagementDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    floor_id: "",
    room_type: "classroom" as const,
    capacity: "",
    equipment: [] as string[],
    is_active: true,
  });
  const [equipmentInput, setEquipmentInput] = useState("");

  useEffect(() => {
    if (open) {
      fetchFloors();
      if (room) {
        setFormData({
          name: room.name,
          floor_id: room.floor_id,
          room_type: room.room_type,
          capacity: room.capacity?.toString() || "",
          equipment: room.equipment || [],
          is_active: room.is_active,
        });
      } else {
        setFormData({
          name: "",
          floor_id: "",
          room_type: "classroom",
          capacity: "",
          equipment: [],
          is_active: true,
        });
      }
    }
  }, [open, room]);

  const fetchFloors = async () => {
    try {
      const { data, error } = await supabase
        .from("floors")
        .select(
          `
          *,
          building:buildings(*)
        `
        )
        .order("number");

      if (error) throw error;
      setFloors(data || []);
    } catch (error) {
      console.error("Error fetching floors:", error);
      toast({
        title: "Error",
        description: "Failed to load floors",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.floor_id) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const roomData = {
        name: formData.name.trim(),
        floor_id: formData.floor_id,
        room_type: formData.room_type,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        equipment: formData.equipment.length > 0 ? formData.equipment : null,
        is_active: formData.is_active,
        updated_at: new Date().toISOString(),
      };

      if (room) {
        // Update existing room
        const { error } = await supabase
          .from("rooms")
          .update(roomData)
          .eq("id", room.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Room updated successfully",
        });
      } else {
        // Create new room
        const { error } = await supabase.from("rooms").insert([roomData]);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Room created successfully",
        });
      }

      onRoomSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving room:", error);
      toast({
        title: "Error",
        description: `Failed to ${room ? "update" : "create"} room`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addEquipment = () => {
    if (
      equipmentInput.trim() &&
      !formData.equipment.includes(equipmentInput.trim())
    ) {
      setFormData((prev) => ({
        ...prev,
        equipment: [...prev.equipment, equipmentInput.trim()],
      }));
      setEquipmentInput("");
    }
  };

  const removeEquipment = (equipment: string) => {
    setFormData((prev) => ({
      ...prev,
      equipment: prev.equipment.filter((e) => e !== equipment),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{room ? "Edit Room" : "Add New Room"}</DialogTitle>
          <DialogDescription>
            {room
              ? "Update room details and configuration"
              : "Create a new room with its configuration"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Room Name *
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              className="col-span-3"
              placeholder="e.g., Room 101"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="floor" className="text-right">
              Floor *
            </Label>
            <Select
              value={formData.floor_id}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, floor_id: value }))
              }
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select floor" />
              </SelectTrigger>
              <SelectContent>
                {floors.map((floor) => (
                  <SelectItem key={floor.id} value={floor.id}>
                    {floor.name} - {floor.building?.name || "No Building"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="room_type" className="text-right">
              Room Type
            </Label>
            <Select
              value={formData.room_type}
              onValueChange={(value: any) =>
                setFormData((prev) => ({ ...prev, room_type: value }))
              }
            >
              <SelectTrigger className="col-span-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROOM_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="capacity" className="text-right">
              Capacity
            </Label>
            <Input
              id="capacity"
              type="number"
              value={formData.capacity}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, capacity: e.target.value }))
              }
              className="col-span-3"
              placeholder="e.g., 50"
              min="1"
            />
          </div>

          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="equipment" className="text-right mt-2">
              Equipment
            </Label>
            <div className="col-span-3 space-y-3">
              <div className="flex gap-2">
                <Input
                  value={equipmentInput}
                  onChange={(e) => setEquipmentInput(e.target.value)}
                  placeholder="Add equipment (e.g., Projector)"
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addEquipment();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={addEquipment}
                  disabled={!equipmentInput.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {formData.equipment.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.equipment.map((equipment, index) => (
                    <Badge key={index} variant="secondary" className="pr-1">
                      {equipment}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 ml-1 hover:bg-transparent"
                        onClick={() => removeEquipment(equipment)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="is_active" className="text-right">
              Status
            </Label>
            <Select
              value={formData.is_active.toString()}
              onValueChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  is_active: value === "true",
                }))
              }
            >
              <SelectTrigger className="col-span-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : room ? "Update Room" : "Create Room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
