import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Room, Profile } from "@/types/database";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { format, addHours, isWeekend, isBefore } from "date-fns";
import { AlertCircle, Clock, Calendar, MapPin } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";

interface BookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: Room;
  date: Date;
  time: string;
  onBookingCreated: () => void;
}

export default function BookingDialog({
  open,
  onOpenChange,
  room,
  date,
  time,
  onBookingCreated,
}: BookingDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("1");
  const [classDivision, setClassDivision] = useState("");
  const [panel, setPanel] = useState("");
  const [yearCourse, setYearCourse] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteSearchResults, setInviteSearchResults] = useState<Profile[]>([]);
  const [selectedInvitees, setSelectedInvitees] = useState<Profile[]>([]);
  const [sendEmails, setSendEmails] = useState(true);
  const [emailInput, setEmailInput] = useState("");
  const [extraEmails, setExtraEmails] = useState<string[]>([]);
  const { user } = useAuth();

  // Function to check for booking collisions using effective timetable
  const checkBookingCollision = async (
    startTime: Date,
    endTime: Date
  ): Promise<boolean> => {
    try {
      // Use the effective timetable function to check availability
      const { data, error } = await (supabase as any).rpc(
        "check_slot_availability",
        {
          p_room_id: room.id,
          p_start_time: startTime.toISOString(),
          p_end_time: endTime.toISOString(),
          p_exclude_booking_id: null,
        }
      );

      if (error) throw error;

      // Function returns true if available, false if not
      return !data;
    } catch (error) {
      console.error("Error checking booking collision:", error);
      return false; // If we can't check, allow the booking to proceed
    }
  };

  // Function to check for user booking conflicts (confirmed only)
  const checkUserBookingConflict = async (
    startTime: Date,
    endTime: Date
  ): Promise<boolean> => {
    if (!user) return false;

    try {
      // Get all bookings for this user
      const { data, error } = await (supabase as any)
        .from("bookings")
        .select("*")
        .eq("teacher_id", user.id)
        .eq("status", "confirmed");

      if (error) throw error;

      // Check for overlapping bookings manually
      const hasConflict = data?.some((booking) => {
        const bookingStart = new Date(booking.start_time);
        const bookingEnd = new Date(booking.end_time);

        // Check if the new booking overlaps with existing booking
        // Overlap occurs when: new_start < existing_end AND new_end > existing_start
        return startTime < bookingEnd && endTime > bookingStart;
      });

      return hasConflict || false;
    } catch (error) {
      console.error("Error checking user booking conflict:", error);
      return false;
    }
  };

  const validateBooking = (startTime: Date, endTime: Date): string | null => {
    const now = new Date();

    // Check if booking is in the past
    if (isBefore(startTime, now)) {
      return "Cannot create bookings in the past";
    }

    // Weekends are allowed

    // Check if booking is within allowed hours (7:30 AM to 10:30 PM)
    const startHour = startTime.getHours();
    const startMinute = startTime.getMinutes();
    const endHour = endTime.getHours();
    const endMinute = endTime.getMinutes();

    if (startHour < 7 || (startHour === 7 && startMinute < 30)) {
      return "Bookings cannot start before 7:30 AM";
    }

    if (endHour > 22 || (endHour === 22 && endMinute > 30)) {
      return "Bookings cannot end after 10:30 PM";
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const [hours, minutes] = time.split(":").map(Number);
      const startTime = new Date(date);
      startTime.setHours(hours, minutes, 0, 0);

      const endTime = new Date(startTime);
      endTime.setHours(hours + parseInt(duration), minutes, 0, 0);

      // Validate booking constraints
      const validationError = validateBooking(startTime, endTime);
      if (validationError) {
        toast({
          title: "Invalid Booking",
          description: validationError,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Check for room booking collision
      const hasRoomCollision = await checkBookingCollision(startTime, endTime);
      if (hasRoomCollision) {
        toast({
          title: "Room Already Booked",
          description:
            "This time slot conflicts with an existing booking for this room. Please choose a different time or duration.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Check for user booking conflict
      const hasUserConflict = await checkUserBookingConflict(
        startTime,
        endTime
      );
      if (hasUserConflict) {
        toast({
          title: "Personal Schedule Conflict",
          description:
            "You already have a booking that overlaps with this time period. Please choose a different time or duration.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const { data: inserted, error } = await supabase
        .from("bookings")
        .insert({
          room_id: room.id,
          teacher_id: user.id,
          title,
          description: description || null,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          class_division: classDivision || null,
          panel: panel || null,
          year_course: yearCourse || null,
          status: room.requires_approval ? "pending" : "confirmed",
        })
        .select("id, title, description, start_time, end_time")
        .single();

      if (error) {
        // Handle specific database constraint errors
        if (error.message.includes("User already has a booking")) {
          toast({
            title: "Personal Schedule Conflict",
            description:
              "You already have a booking that overlaps with this time period.",
            variant: "destructive",
          });
        } else if (
          error.message.includes("Cannot create bookings in the past")
        ) {
          toast({
            title: "Invalid Booking Time",
            description: "Cannot create bookings in the past.",
            variant: "destructive",
          });
        } else if (
          error.message.includes("Bookings cannot start before 7:30 AM")
        ) {
          toast({
            title: "Invalid Start Time",
            description: "Bookings cannot start before 7:30 AM.",
            variant: "destructive",
          });
        } else if (
          error.message.includes("Bookings cannot end after 10:30 PM")
        ) {
          toast({
            title: "Invalid End Time",
            description: "Bookings cannot end after 10:30 PM.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        setLoading(false);
        return;
      }

      // Insert invitees if any
      const bookingId = inserted?.id;
      if (bookingId && selectedInvitees.length > 0) {
        const inviteRows = selectedInvitees.map((p) => ({
          booking_id: bookingId,
          invitee_id: p.id,
        }));
        const { error: inviteErr } = await (supabase as any)
          .from("booking_invitees")
          .insert(inviteRows as any);
        if (inviteErr) {
          console.error("Failed to add invitees", inviteErr);
        }
      }

      // Send emails using external email service
      if (!room.requires_approval && sendEmails) {
        try {
          // Prepare email data
          const startTime = new Date(inserted.start_time);
          const endTime = new Date(inserted.end_time);
          const date = startTime.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          const time = startTime.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });
          const duration = Math.round(
            (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)
          ); // hours

          // Get all email addresses
          const allEmails = [
            ...selectedInvitees.map((invitee) => invitee.email),
            ...extraEmails,
          ].filter(Boolean);

          if (allEmails.length > 0) {
            // Validate that we have all required data
            if (!inserted.title || !date || !time || !room.name) {
              console.warn("Missing required booking data for email:", {
                title: inserted.title,
                date,
                time,
                room: room.name,
              });
              return;
            }

            // Send email using the curl format you provided
            const emailPayload = {
              emails: allEmails,
              bookingName: inserted.title,
              date: date,
              time: time,
              room: room.name,
              duration: `${duration} hour${duration !== 1 ? "s" : ""}`,
              additionalInfo:
                inserted.description || "No Additional Description",
              userEmail: user.email,
            };

            const EMAIL_SERVICE_URL =
              "https://oacrbzapchtoeshmmhrf.supabase.co/functions/v1/send-booking-emails";
            const AUTH_TOKEN =
              "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hY3JiemFwY2h0b2VzaG1taHJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwMzI3MDEsImV4cCI6MjA2OTYwODcwMX0.0JDDizFguhGhPT5ko3alQTEPtVHrq0AYKmqwzl0C-lg";

            // Debug: Log the payload being sent
            console.log("Sending email payload:", emailPayload);

            const res = await fetch(EMAIL_SERVICE_URL, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${AUTH_TOKEN}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(emailPayload),
            });

            if (!res.ok) {
              const errorText = await res.text().catch(() => "");
              console.warn("Email service call failed:", res.status, errorText);
            } else {
              console.log("Emails sent successfully");
            }
          }
        } catch (emailErr) {
          console.warn("Email sending failed:", emailErr);
        }
      }

      toast({
        title: room.requires_approval ? "Submitted for approval" : "Success",
        description: room.requires_approval
          ? "Your request is pending admin approval. You'll be notified upon decision."
          : "Room booked successfully!",
      });

      onBookingCreated();
      onOpenChange(false);

      // Reset form
      setTitle("");
      setDescription("");
      setDuration("1");
      setClassDivision("");
      setPanel("");
      setYearCourse("");
      setSelectedInvitees([]);
      setInviteSearch("");
      setExtraEmails([]);
      setEmailInput("");
      setSendEmails(true);
    } catch (error: any) {
      console.error("Booking error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create booking",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Invitee search
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!inviteSearch.trim()) {
        setInviteSearchResults([]);
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .or(`full_name.ilike.%${inviteSearch}%,email.ilike.%${inviteSearch}%`)
        .limit(8);
      if (cancelled) return;
      if (error) {
        console.error("Invite search failed", error);
        setInviteSearchResults([]);
      } else {
        // Exclude current user and already selected
        const selectedIds = new Set(selectedInvitees.map((s) => s.id));
        const filtered = (data || []).filter(
          (p) => p.id !== user?.id && !selectedIds.has(p.id)
        ) as Profile[];
        setInviteSearchResults(filtered);
      }
    };
    const t = setTimeout(run, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [inviteSearch, selectedInvitees, user?.id]);

  const addInvitee = (p: Profile) => {
    setSelectedInvitees((prev) => [...prev, p]);
    setInviteSearch("");
    setInviteSearchResults([]);
  };

  const removeInvitee = (id: string) => {
    setSelectedInvitees((prev) => prev.filter((p) => p.id !== id));
  };

  const addExtraEmail = () => {
    const value = emailInput.trim();
    if (!value) return;
    const email = value.toLowerCase();
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (isValid && !extraEmails.includes(email)) {
      setExtraEmails((prev) => [...prev, email]);
      setEmailInput("");
    }
  };

  const removeExtraEmail = (email: string) => {
    setExtraEmails((prev) => prev.filter((e) => e !== email));
  };

  const [hours, minutes] = time.split(":").map(Number);
  const startTime = new Date(date);
  startTime.setHours(hours, minutes, 0, 0);
  const endTime = new Date(startTime);
  endTime.setHours(hours + parseInt(duration), minutes, 0, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-3">
          <DialogTitle className="flex items-center space-x-2 text-lg">
            <MapPin className="h-5 w-5" />
            <span>Book Room {room.name}</span>
          </DialogTitle>
          <div className="space-y-1 text-sm text-muted-foreground">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4" />
              <span>{format(date, "EEEE, MMMM d, yyyy")}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4" />
              <span>
                {format(startTime, "h:mm a")} - {format(endTime, "h:mm a")}
              </span>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="title" className="text-sm">
              Title *
            </Label>
            <Input
              id="title"
              placeholder="e.g., Data Structures Lecture"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="focus:ring-2 focus:ring-blue-500 h-9"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="duration" className="text-sm">
              Duration *
            </Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="focus:ring-2 focus:ring-blue-500 h-9">
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 hour</SelectItem>
                <SelectItem value="2">2 hours</SelectItem>
                <SelectItem value="3">3 hours</SelectItem>
                <SelectItem value="4">4 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="class-division" className="text-sm">
                Class/Division
              </Label>
              <Input
                id="class-division"
                placeholder="e.g., B.Tech A"
                value={classDivision}
                onChange={(e) => setClassDivision(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="panel" className="text-sm">
                Panel
              </Label>
              <Input
                id="panel"
                placeholder="e.g., Panel 1"
                value={panel}
                onChange={(e) => setPanel(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="year-course" className="text-sm">
              Year/Course
            </Label>
            <Input
              id="year-course"
              placeholder="e.g., 2nd Year Computer Science"
              value={yearCourse}
              onChange={(e) => setYearCourse(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="description" className="text-sm">
              Description
            </Label>
            <Textarea
              id="description"
              placeholder="Additional details about the booking..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          {room.requires_approval && (
            <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 py-2">
              <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400 mt-0.5" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                <div className="space-y-0.5 text-xs">
                  <div>
                    This room requires admin approval. Your request will be
                    reviewed.
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-1">
            <Label htmlFor="invitees" className="text-sm">
              Invite people
            </Label>
            <Input
              id="invitees"
              placeholder="Search by name or email"
              value={inviteSearch}
              onChange={(e) => setInviteSearch(e.target.value)}
              className="h-9"
            />
            {inviteSearchResults.length > 0 && (
              <div className="border rounded-md divide-y">
                {inviteSearchResults.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => addInvitee(p)}
                    className="w-full text-left px-3 py-2 hover:bg-accent"
                  >
                    <div className="text-sm font-medium">{p.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.email}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selectedInvitees.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {selectedInvitees.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground px-2 py-1 rounded text-xs"
                  >
                    {p.full_name}
                    <button
                      type="button"
                      onClick={() => removeInvitee(p.id)}
                      className="opacity-70 hover:opacity-100"
                      aria-label={`Remove ${p.full_name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-sm">Additional emails</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add email and press Enter/Add"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addExtraEmail();
                  }
                }}
                className="h-9"
              />
              <Button type="button" variant="secondary" onClick={addExtraEmail}>
                Add
              </Button>
            </div>
            {extraEmails.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {extraEmails.map((em) => (
                  <span
                    key={em}
                    className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground px-2 py-1 rounded text-xs"
                  >
                    {em}
                    <button
                      type="button"
                      onClick={() => removeExtraEmail(em)}
                      className="opacity-70 hover:opacity-100"
                      aria-label={`Remove ${em}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <Label className="text-sm">Send email notifications</Label>
            <Switch checked={sendEmails} onCheckedChange={setSendEmails} />
          </div>

          {/* Booking Information Alert */}
          <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 py-2">
            <AlertCircle className="h-3 w-3 text-blue-600 dark:text-blue-400 mt-0.5" />
            <AlertDescription className="text-blue-800 dark:text-blue-200">
              <div className="space-y-0.5 text-xs">
                <div>• 7:30 AM - 10:30 PM • One booking per user</div>
              </div>
            </AlertDescription>
          </Alert>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !title.trim()}
              className="bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
            >
              {loading ? "Booking..." : "Book Room"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
