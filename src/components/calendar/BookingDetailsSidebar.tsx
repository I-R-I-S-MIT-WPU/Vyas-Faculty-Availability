//Vyas-Faculty-Availability\src\components\calendar\BookingDetailsSidebar.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Booking, Room } from "@/types/database";
import {
  Calendar,
  Clock,
  Loader2,
  MapPin,
  Pencil,
  Save,
  Trash2,
  User,
  X,
  XCircle,
} from "lucide-react";
import { differenceInMinutes, format, isBefore, parseISO } from "date-fns";

interface BookingDetailsSidebarProps {
  booking: Booking | null;
  template?: any | null;
  templateWeekStart?: Date | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId?: string;
  userProfile?: { full_name: string } | null;
  room: Room | null;
  onBookingUpdated?: (bookingId: string) => void | Promise<void>;
  onBookingDeleted?: (bookingId: string) => void | Promise<void>;
  onTemplateCancelled?: () => void | Promise<void>;
}

interface BookingFormState {
  title: string;
  start: string;
  duration: string;
  description: string;
  classDivision: string;
  panel: string;
  yearCourse: string;
}

const durationOptions = ["1", "2", "3", "4"];

const formatInputValue = (isoDate: string) => {
  const date = parseISO(isoDate);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const getBookingDurationHours = (startIso: string, endIso: string) => {
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  const minutes = Math.max(60, differenceInMinutes(end, start));
  const hours = Math.max(1, Math.round(minutes / 60));
  return durationOptions.includes(hours.toString()) ? `${hours}` : "1";
};

const statusColors: Record<string, string> = {
  confirmed:
    "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300",
  pending:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300",
  denied: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300",
};

export default function BookingDetailsSidebar({
  booking,
  template,
  templateWeekStart,
  open,
  onOpenChange,
  currentUserId,
  userProfile,
  room,
  onBookingUpdated,
  onBookingDeleted,
  onTemplateCancelled,
}: BookingDetailsSidebarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancellingTemplate, setIsCancellingTemplate] = useState(false);
  const [formState, setFormState] = useState<BookingFormState>({
    title: "",
    start: "",
    duration: "1",
    description: "",
    classDivision: "",
    panel: "",
    yearCourse: "",
  });

  const isOwner = booking && booking.teacher_id === currentUserId;
  const isTemplateOwner =
    template &&
    userProfile &&
    template.teacher_name &&
    template.teacher_name.toLowerCase() === userProfile.full_name.toLowerCase();

  useEffect(() => {
    if (booking) {
      setFormState({
        title: booking.title,
        start: formatInputValue(booking.start_time),
        duration: getBookingDurationHours(booking.start_time, booking.end_time),
        description: booking.description || "",
        classDivision: booking.class_division || "",
        panel: booking.panel || "",
        yearCourse: booking.year_course || "",
      });
    } else {
      setFormState({
        title: "",
        start: "",
        duration: "1",
        description: "",
        classDivision: "",
        panel: "",
        yearCourse: "",
      });
    }
    setIsEditing(false);
    setIsSaving(false);
    setIsDeleting(false);
  }, [booking]);

  const startTime = useMemo(
    () => (booking ? parseISO(booking.start_time) : null),
    [booking]
  );
  const endTime = useMemo(
    () => (booking ? parseISO(booking.end_time) : null),
    [booking]
  );

  const handleFormChange = (field: keyof BookingFormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const validateBooking = (
    startDate: Date,
    endDate: Date,
    options?: { skipPastCheck?: boolean }
  ): string | null => {
    const now = new Date();
    if (!options?.skipPastCheck && isBefore(startDate, now)) {
      return "Start time cannot be in the past.";
    }

    const startHour = startDate.getHours();
    const startMinute = startDate.getMinutes();
    const endHour = endDate.getHours();
    const endMinute = endDate.getMinutes();

    if (startHour < 7 || (startHour === 7 && startMinute < 30)) {
      return "Bookings cannot start before 7:30 AM.";
    }

    if (endHour > 22 || (endHour === 22 && endMinute > 30)) {
      return "Bookings cannot end after 10:30 PM.";
    }

    return null;
  };

  const checkBookingCollision = async (
    startDate: Date,
    endDate: Date
  ): Promise<boolean> => {
    if (!booking || !room) return false;
    try {
      // Use the effective timetable function to check availability
      const { data, error } = await (supabase as any).rpc(
        "check_slot_availability",
        {
          p_room_id: room.id,
          p_start_time: startDate.toISOString(),
          p_end_time: endDate.toISOString(),
          p_exclude_booking_id: booking.id,
        }
      );

      if (error) {
        console.error("Collision check failed", error);
        return false;
      }

      // Function returns true if available, false if not
      return !data;
    } catch (error) {
      console.error("Error checking booking collision:", error);
      return false;
    }
  };

  const checkUserConflict = async (
    startDate: Date,
    endDate: Date
  ): Promise<boolean> => {
    if (!booking || !currentUserId) return false;
    const { data, error } = await supabase
      .from("bookings")
      .select("id, start_time, end_time")
      .eq("teacher_id", currentUserId)
      .eq("status", "confirmed")
      .neq("id", booking.id);
    if (error) {
      console.error("User conflict check failed", error);
      return false;
    }

    return (
      data?.some((existing) => {
        const existingStart = parseISO(existing.start_time);
        const existingEnd = parseISO(existing.end_time);
        return startDate < existingEnd && endDate > existingStart;
      }) || false
    );
  };

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!booking || !isOwner) return;

    const parsedStart = new Date(formState.start);
    if (Number.isNaN(parsedStart.getTime())) {
      toast({
        title: "Invalid start time",
        description: "Provide a valid start time before saving.",
        variant: "destructive",
      });
      return;
    }

    const hours = parseInt(formState.duration, 10);
    const parsedEnd = new Date(parsedStart);
    parsedEnd.setHours(parsedEnd.getHours() + hours);

    const originalStart = parseISO(booking.start_time);
    const startChanged =
      Math.abs(parsedStart.getTime() - originalStart.getTime()) > 60 * 1000;

    const validationMessage = validateBooking(parsedStart, parsedEnd, {
      skipPastCheck: !startChanged,
    });
    if (validationMessage) {
      toast({
        title: "Cannot save booking",
        description: validationMessage,
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const hasCollision = await checkBookingCollision(parsedStart, parsedEnd);
      if (hasCollision) {
        toast({
          title: "Slot unavailable",
          description: "This room already has a booking in that time window.",
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }

      const hasUserConflict = await checkUserConflict(parsedStart, parsedEnd);
      if (hasUserConflict) {
        toast({
          title: "Schedule conflict",
          description:
            "You already have a booking that overlaps with this time.",
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }

      const { error } = await supabase
        .from("bookings")
        .update({
          title: formState.title.trim(),
          description: formState.description.trim() || null,
          class_division: formState.classDivision.trim() || null,
          panel: formState.panel.trim() || null,
          year_course: formState.yearCourse.trim() || null,
          start_time: parsedStart.toISOString(),
          end_time: parsedEnd.toISOString(),
        })
        .eq("id", booking.id)
        .eq("teacher_id", currentUserId);

      if (error) {
        throw error;
      }

      toast({
        title: "Booking updated",
        description: "Your event details were saved successfully.",
      });
      setIsEditing(false);
      await onBookingUpdated?.(booking.id);
    } catch (err: any) {
      console.error("Failed to update booking", err);
      toast({
        title: "Update failed",
        description: err.message || "Could not update this booking.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!booking || !isOwner) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .delete()
        .eq("id", booking.id)
        .eq("teacher_id", currentUserId);
      if (error) throw error;

      toast({
        title: "Booking deleted",
        description: "The event has been removed from this room.",
      });
      await onBookingDeleted?.(booking.id);
      onOpenChange(false);
    } catch (err: any) {
      console.error("Failed to delete booking", err);
      toast({
        title: "Delete failed",
        description: err.message || "Could not remove this booking.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setIsEditing(false);
    }
    onOpenChange(nextOpen);
  };

  const handleCancelTemplate = async () => {
    if (!template || !templateWeekStart || !isTemplateOwner) return;

    setIsCancellingTemplate(true);
    try {
      const weekStartDate = format(templateWeekStart, "yyyy-MM-dd");
      const { error } = await (supabase as any).rpc(
        "create_template_exception",
        {
          p_template_id: template.template_id,
          p_week_start_date: weekStartDate,
          p_reason: "Cancelled by teacher",
        }
      );

      if (error) throw error;

      toast({
        title: "Class cancelled",
        description: "This class has been cancelled for this week.",
      });

      await onTemplateCancelled?.();
    } catch (err: any) {
      console.error("Failed to cancel template", err);
      toast({
        title: "Cancel failed",
        description: err.message || "Could not cancel this class.",
        variant: "destructive",
      });
    } finally {
      setIsCancellingTemplate(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[360px] px-0 border-none bg-transparent data-[state=open]:shadow-none [&>button:last-child]:hidden"
      >
        <div
          className=" 
            relative
            mx-auto
            sm:ml-auto
            m-3
            sm:mr-6 sm:mt-6 sm:mb-6
            flex
            h-[90vh]
            sm:h-[calc(100vh-4rem)]
            w-full
            max-w-[95vw]
            sm:max-w-[360]
            flex-col
            overflow-hidden
            rounded-3xl
            sm:rounded-2xl
            scale-[0.97]
            sm:scale-100
            border
            border-white/40
            bg-white/85
            shadow-[0_20px_70px_rgba(15,23,42,0.35)]
            backdrop-blur-xl
            dark:border-white/10
            dark:bg-slate-900/50
            sm:translate-y-[-0.5rem]
          "
        >
          <SheetHeader className="px-5 pt-5 sm:px-6 sm:pt-6">
            <div className="flex items-start justify-between gap-3">
              <SheetTitle className="text-left text-lg sm:text-xl">
                {booking
                  ? "Booking Details"
                  : template
                  ? "Template Details"
                  : "Event Details"}
              </SheetTitle>
              <SheetClose asChild className="rounded-full">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 border border-white/40 bg-white/40 text-foreground hover:bg-white/70 dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/20"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </Button>
              </SheetClose>
            </div>
          </SheetHeader>
          <Separator className="mt-4" />
          <div className="flex-1 min-h-0 px-5 py-4 sm:px-6">
            <ScrollArea className="h-full pr-3 pb-4">
              {!booking && !template ? (
                <p className="text-sm text-muted-foreground">
                  Select an event from the timetable to view its details.
                </p>
              ) : template ? (
                <div className="space-y-6 pb-10">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">
                        {room?.name}
                      </p>
                      <h3 className="text-lg font-semibold leading-tight">
                        {template.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Template class by {template.teacher_name || "Unknown"}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300"
                    >
                      Template
                    </Badge>
                  </div>

                  <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {format(
                          parseISO(template.start_time),
                          "EEEE, MMM d, yyyy"
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {format(parseISO(template.start_time), "h:mm a")} –{" "}
                        {format(parseISO(template.end_time), "h:mm a")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{room?.name || "Room"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{template.teacher_name || "Unknown"}</span>
                    </div>
                  </div>

                  {template.description && (
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                        Description
                      </p>
                      <p className="rounded-md border bg-background p-3 text-sm leading-relaxed">
                        {template.description}
                      </p>
                    </div>
                  )}

                  {isTemplateOwner && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleCancelTemplate}
                        disabled={isCancellingTemplate}
                        className="gap-1"
                      >
                        {isCancellingTemplate ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        Cancel this class for this week
                      </Button>
                    </div>
                  )}

                  {!isTemplateOwner && (
                    <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                      Only {template.teacher_name} can cancel this template
                      class.
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6 pb-10">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">
                        {room?.name}
                      </p>
                      <h3 className="text-lg font-semibold leading-tight">
                        {booking.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Organized by{" "}
                        {booking.profiles?.full_name || "Unknown member"}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={
                        statusColors[booking.status || "confirmed"] ||
                        "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300"
                      }
                    >
                      {booking.status || "confirmed"}
                    </Badge>
                  </div>

                  <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {startTime
                          ? format(startTime, "EEEE, MMM d, yyyy")
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {startTime && endTime
                          ? `${format(startTime, "h:mm a")} – ${format(
                              endTime,
                              "h:mm a"
                            )}`
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{room?.name || "Room"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {booking.profiles?.full_name || "Unknown member"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    {booking.class_division && (
                      <div>
                        <p className="text-xs font-medium uppercase text-muted-foreground">
                          Division
                        </p>
                        <p className="font-medium">{booking.class_division}</p>
                      </div>
                    )}
                    {booking.panel && (
                      <div>
                        <p className="text-xs font-medium uppercase text-muted-foreground">
                          Panel
                        </p>
                        <p className="font-medium">{booking.panel}</p>
                      </div>
                    )}
                    {booking.year_course && (
                      <div>
                        <p className="text-xs font-medium uppercase text-muted-foreground">
                          Year / Course
                        </p>
                        <p className="font-medium">{booking.year_course}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                      Description
                    </p>
                    <p className="rounded-md border bg-background p-3 text-sm leading-relaxed">
                      {booking.description ||
                        "No additional details were added."}
                    </p>
                  </div>

                  {isOwner && !isEditing && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                        className="gap-1"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit Event
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="gap-1"
                            disabled={isDeleting}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete this booking?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. The slot will become
                              available for others immediately.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeleting}>
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleDelete}
                              disabled={isDeleting}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {isDeleting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Delete booking"
                              )}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}

                  {isOwner && isEditing && (
                    <form className="space-y-4" onSubmit={handleUpdate}>
                      <div className="space-y-1">
                        <Label htmlFor="booking-title">Title</Label>
                        <Input
                          id="booking-title"
                          value={formState.title}
                          onChange={(event) =>
                            handleFormChange("title", event.target.value)
                          }
                          required
                          disabled={isSaving}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor="booking-start">Start time</Label>
                          <Input
                            id="booking-start"
                            type="datetime-local"
                            value={formState.start}
                            onChange={(event) =>
                              handleFormChange("start", event.target.value)
                            }
                            required
                            disabled={isSaving}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="booking-duration">Duration</Label>
                          <select
                            id="booking-duration"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={formState.duration}
                            onChange={(event) =>
                              handleFormChange("duration", event.target.value)
                            }
                            disabled={isSaving}
                          >
                            {durationOptions.map((hours) => (
                              <option key={hours} value={hours}>
                                {hours} {hours === "1" ? "hour" : "hours"}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor="booking-division">
                            Class / Division
                          </Label>
                          <Input
                            id="booking-division"
                            value={formState.classDivision}
                            onChange={(event) =>
                              handleFormChange(
                                "classDivision",
                                event.target.value
                              )
                            }
                            disabled={isSaving}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="booking-panel">Panel</Label>
                          <Input
                            id="booking-panel"
                            value={formState.panel}
                            onChange={(event) =>
                              handleFormChange("panel", event.target.value)
                            }
                            disabled={isSaving}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="booking-year">Year / Course</Label>
                        <Input
                          id="booking-year"
                          value={formState.yearCourse}
                          onChange={(event) =>
                            handleFormChange("yearCourse", event.target.value)
                          }
                          disabled={isSaving}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="booking-description">Description</Label>
                        <Textarea
                          id="booking-description"
                          rows={3}
                          value={formState.description}
                          onChange={(event) =>
                            handleFormChange("description", event.target.value)
                          }
                          disabled={isSaving}
                        />
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsEditing(false)}
                          disabled={isSaving}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={isSaving}>
                          {isSaving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          Save changes
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
