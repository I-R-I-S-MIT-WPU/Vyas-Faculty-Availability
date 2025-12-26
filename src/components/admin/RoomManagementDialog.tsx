import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Room, Floor, RoomTimetableTemplate } from "@/types/database";
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
import { X, Plus, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { addMinutes, format } from "date-fns";

interface RoomManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room?: Room | null;
  onRoomSaved: () => void;
  currentUserId?: string | null;
}

const ROOM_TYPES = [
  { value: "classroom", label: "Lecture Room" },
  { value: "lab", label: "Lab" },
  { value: "conference", label: "Conference Room" },
  { value: "auditorium", label: "Hall" },
  { value: "seminar", label: "Seminar Room" },
  { value: "discussion", label: "Discussion Room" },
];

const WEEKDAY_OPTIONS = [
  { value: "0", label: "Monday" },
  { value: "1", label: "Tuesday" },
  { value: "2", label: "Wednesday" },
  { value: "3", label: "Thursday" },
  { value: "4", label: "Friday" },
  { value: "5", label: "Saturday" },
  { value: "6", label: "Sunday" },
];

export const RoomManagementDialog = ({
  open,
  onOpenChange,
  room,
  onRoomSaved,
  currentUserId,
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
    requires_approval: false,
  });
  const [equipmentInput, setEquipmentInput] = useState("");
  const [templates, setTemplates] = useState<RoomTimetableTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateActionLoading, setTemplateActionLoading] = useState(false);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const supabaseAdmin = supabase as any;

  const getDefaultEffectiveFrom = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = (1 - day + 7) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().split("T")[0];
  };

  const [templateForm, setTemplateForm] = useState({
    title: "",
    teacher_name: "",
    weekday: "0",
    start_time: "08:30",
    duration_minutes: "60",
    repeat_interval_weeks: "2",
    effective_from: getDefaultEffectiveFrom(),
    notes: "",
  });

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
          requires_approval: !!room.requires_approval,
        });
        fetchTemplates(room.id);
      } else {
        setFormData({
          name: "",
          floor_id: "",
          room_type: "classroom",
          capacity: "",
          equipment: [],
          is_active: true,
          requires_approval: false,
        });
        setTemplates([]);
        setShowTemplateForm(false);
        setEditingTemplateId(null);
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
        requires_approval: formData.requires_approval,
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

  const fetchTemplates = async (roomId: string) => {
    try {
      setTemplatesLoading(true);
      const { data, error } = await supabaseAdmin
        .from("room_timetable_templates")
        .select("*")
        .eq("room_id", roomId)
        .order("weekday", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) throw error;
      setTemplates((data as RoomTimetableTemplate[]) || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast({
        title: "Error",
        description: "Failed to load timetable templates",
        variant: "destructive",
      });
    } finally {
      setTemplatesLoading(false);
    }
  };

  const resetTemplateForm = () => {
    setTemplateForm({
      title: "",
      teacher_name: "",
      weekday: "0",
      start_time: "08:30",
      duration_minutes: "60",
      repeat_interval_weeks: "2",
      effective_from: getDefaultEffectiveFrom(),
      notes: "",
    });
    setEditingTemplateId(null);
  };

  const handleTemplateSave = async () => {
    if (!room) {
      toast({
        title: "Room required",
        description: "Save the room before adding timetable templates.",
        variant: "destructive",
      });
      return;
    }

    if (!templateForm.title.trim() || !templateForm.teacher_name.trim()) {
      toast({
        title: "Validation error",
        description: "Template title and teacher name are required.",
        variant: "destructive",
      });
      return;
    }

    const weekday = parseInt(templateForm.weekday, 10);
    const durationMinutes = parseInt(templateForm.duration_minutes, 10);
    const repeatInterval = parseInt(templateForm.repeat_interval_weeks, 10) || 2;

    if (Number.isNaN(weekday) || Number.isNaN(durationMinutes)) {
      toast({
        title: "Validation error",
        description: "Please provide valid numeric values for weekday and duration.",
        variant: "destructive",
      });
      return;
    }

    const startTimeValue = templateForm.start_time.includes(":")
      ? `${templateForm.start_time}${templateForm.start_time.length === 5 ? ":00" : ""}`
      : templateForm.start_time;

    setTemplateActionLoading(true);
    try {
      if (editingTemplateId) {
        const { error } = await supabaseAdmin
          .from("room_timetable_templates")
          .update({
            teacher_name: templateForm.teacher_name.trim(),
            title: templateForm.title.trim(),
            weekday,
            start_time: startTimeValue,
            duration_minutes: durationMinutes,
            repeat_interval_weeks: repeatInterval,
            effective_from: templateForm.effective_from,
            notes: templateForm.notes.trim() ? templateForm.notes.trim() : null,
          })
          .eq("id", editingTemplateId);

        if (error) throw error;

        toast({
          title: "Template updated",
          description: "The timetable slot has been updated.",
        });
      } else {
        const { error } = await supabaseAdmin
          .from("room_timetable_templates")
          .insert({
            room_id: room.id,
            teacher_name: templateForm.teacher_name.trim(),
            title: templateForm.title.trim(),
            weekday,
            start_time: startTimeValue,
            duration_minutes: durationMinutes,
            repeat_interval_weeks: repeatInterval,
            effective_from: templateForm.effective_from,
            notes: templateForm.notes.trim() ? templateForm.notes.trim() : null,
            created_by: currentUserId ?? null,
          });

        if (error) throw error;

        toast({
          title: "Template added",
          description: "The recurring timetable slot has been saved.",
        });
      }

      resetTemplateForm();
      setShowTemplateForm(false);
      fetchTemplates(room.id);
    } catch (error) {
      console.error("Error saving template:", error);
      toast({
        title: "Error",
        description: "Failed to save timetable template",
        variant: "destructive",
      });
    } finally {
      setTemplateActionLoading(false);
    }
  };

  const handleToggleTemplate = async (
    template: RoomTimetableTemplate,
    nextActive: boolean
  ) => {
    try {
      setTemplateActionLoading(true);
      const { error } = await supabaseAdmin
        .from("room_timetable_templates")
        .update({ is_active: nextActive })
        .eq("id", template.id);

      if (error) throw error;

      setTemplates((prev) =>
        prev.map((item) =>
          item.id === template.id ? { ...item, is_active: nextActive } : item
        )
      );

      toast({
        title: "Template updated",
        description: `Template ${nextActive ? "activated" : "paused"}.`,
      });
    } catch (error) {
      console.error("Error updating template:", error);
      toast({
        title: "Error",
        description: "Failed to update template",
        variant: "destructive",
      });
    } finally {
      setTemplateActionLoading(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!room) return;

    try {
      setTemplateActionLoading(true);
      const { error } = await supabaseAdmin
        .from("room_timetable_templates")
        .delete()
        .eq("id", templateId);

      if (error) throw error;

      toast({
        title: "Template removed",
        description: "The timetable slot has been deleted.",
      });

      fetchTemplates(room.id);
    } catch (error) {
      console.error("Error deleting template:", error);
      toast({
        title: "Error",
        description: "Failed to delete template",
        variant: "destructive",
      });
    } finally {
      setTemplateActionLoading(false);
    }
  };

  const getWeekdayLabel = (weekday: number) => {
    return (
      WEEKDAY_OPTIONS.find((option) => option.value === weekday.toString())?.label ||
      "Weekday"
    );
  };

  const formatTemplateRange = (startTime: string, duration: number) => {
    const [hours = "0", minutes = "0"] = startTime.split(":");
    const start = new Date();
    start.setHours(Number(hours), Number(minutes), 0, 0);
    const end = addMinutes(start, duration);
    return `${format(start, "h:mm a")} - ${format(end, "h:mm a")}`;
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

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="requires_approval" className="text-right">
              Requires approval
            </Label>
            <div className="col-span-3 flex items-center gap-3">
              <Select
                value={formData.requires_approval ? "true" : "false"}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    requires_approval: value === "true",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">No</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                </SelectContent>
              </Select>
              {formData.requires_approval && (
                <Badge variant="outline" className="text-xs">
                  Requests for this room need admin approval
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="border-t pt-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Timetable templates
              </h3>
              <p className="text-sm text-muted-foreground">
                Configure the bi-weekly schedule that auto-fills this room.
              </p>
            </div>
            {room && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTemplateForm((prev) => !prev)}
              >
                {showTemplateForm ? "Close form" : "Add template"}
              </Button>
            )}
          </div>

          {!room ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Save the room before defining timetable templates.
            </div>
          ) : (
            <>
              {showTemplateForm && (
                <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-sm">Template title *</Label>
                      <Input
                        value={templateForm.title}
                        onChange={(e) =>
                          setTemplateForm((prev) => ({
                            ...prev,
                            title: e.target.value,
                          }))
                        }
                        placeholder="e.g., Data Structures Lecture"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Teacher name *</Label>
                      <Input
                        value={templateForm.teacher_name}
                        onChange={(e) =>
                          setTemplateForm((prev) => ({
                            ...prev,
                            teacher_name: e.target.value,
                          }))
                        }
                        placeholder="Exact profile full name"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Weekday *</Label>
                      <Select
                        value={templateForm.weekday}
                        onValueChange={(value) =>
                          setTemplateForm((prev) => ({
                            ...prev,
                            weekday: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEKDAY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Start time *</Label>
                      <Input
                        type="time"
                        value={templateForm.start_time}
                        onChange={(e) =>
                          setTemplateForm((prev) => ({
                            ...prev,
                            start_time: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Duration (minutes) *</Label>
                      <Input
                        type="number"
                        min={15}
                        step={15}
                        value={templateForm.duration_minutes}
                        onChange={(e) =>
                          setTemplateForm((prev) => ({
                            ...prev,
                            duration_minutes: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Repeat interval (weeks)</Label>
                      <Select
                        value={templateForm.repeat_interval_weeks}
                        onValueChange={(value) =>
                          setTemplateForm((prev) => ({
                            ...prev,
                            repeat_interval_weeks: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Every week</SelectItem>
                          <SelectItem value="2">Every 2 weeks</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Effective from</Label>
                      <Input
                        type="date"
                        value={templateForm.effective_from}
                        onChange={(e) =>
                          setTemplateForm((prev) => ({
                            ...prev,
                            effective_from: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-sm">Notes</Label>
                      <Textarea
                        value={templateForm.notes}
                        onChange={(e) =>
                          setTemplateForm((prev) => ({
                            ...prev,
                            notes: e.target.value,
                          }))
                        }
                        rows={3}
                        placeholder="Optional context that appears on generated bookings"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetTemplateForm}
                      disabled={templateActionLoading}
                    >
                      Reset
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleTemplateSave}
                      disabled={templateActionLoading}
                    >
                      {templateActionLoading ? "Saving..." : editingTemplateId ? "Update template" : "Save template"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {templatesLoading ? (
                  <div className="text-sm text-muted-foreground">
                    Loading templates...
                  </div>
                ) : templates.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No timetable templates yet for this room.
                  </div>
                ) : (
                  templates.map((template) => (
                    <div
                      key={template.id}
                      className="rounded-lg border bg-background/60 p-4 space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-sm leading-tight">
                              {template.title}
                            </h4>
                            {!template.is_active && (
                              <Badge variant="secondary" className="text-xs">
                                Paused
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {getWeekdayLabel(template.weekday)} · {formatTemplateRange(template.start_time, template.duration_minutes)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Teacher: {template.teacher_name} · Effective from {template.effective_from ? format(new Date(template.effective_from), "MMM dd, yyyy") : "Not set"}
                          </p>
                          {template.notes && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {template.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setTemplateForm({
                                title: template.title,
                                teacher_name: template.teacher_name,
                                weekday: template.weekday.toString(),
                                start_time: template.start_time?.slice(0, 5) || "08:30",
                                duration_minutes: template.duration_minutes.toString(),
                                repeat_interval_weeks: template.repeat_interval_weeks.toString(),
                                effective_from: template.effective_from || getDefaultEffectiveFrom(),
                                notes: template.notes || "",
                              });
                              setEditingTemplateId(template.id);
                              setShowTemplateForm(true);
                            }}
                            disabled={templateActionLoading}
                          >
                            Edit
                          </Button>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Active</span>
                            <Switch
                              checked={template.is_active}
                              onCheckedChange={(value) => handleToggleTemplate(template, value)}
                              disabled={templateActionLoading}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteTemplate(template.id)}
                            disabled={templateActionLoading}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Repeats every {template.repeat_interval_weeks} week(s) · Auto-generates bookings for matching teachers
                      </p>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
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
