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
import { apiClient } from "@/lib/apiClient";
import { getBookingErrorMessage } from "@/lib/bookingErrors";
import { Room, Profile, Booking } from "@/types/api";
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

  // Mirrors the backend's validate_booking_times trigger so obvious violations
  // are caught before a round-trip (the trigger is still the source of truth).
  const validateBooking = (startTime: Date, endTime: Date): string | null => {
    const now = new Date();

    if (isBefore(startTime, now)) {
      return "Cannot create bookings in the past";
    }

    if (isWeekend(startTime)) {
      return "Bookings are not allowed on weekends";
    }

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

      let inserted: Booking;
      try {
        const res = await apiClient.post<{ success: boolean; booking: Booking }>("/booking", {
          roomId: room.id,
          title,
          description: description || undefined,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          classDivision: classDivision || undefined,
          panel: panel || undefined,
          yearCourse: yearCourse || undefined,
        });
        inserted = res.booking;
      } catch (err) {
        const { title: errTitle, description: errDescription } = getBookingErrorMessage(err);
        toast({ title: errTitle, description: errDescription, variant: "destructive" });
        setLoading(false);
        return;
      }

      // TODO: migrate to backend — no booking_invitees endpoint exists yet on Vyas-Backend.
      // The Supabase "send-booking-emails" edge function this used to call has been
      // decommissioned (unauthenticated, service-role key, open CORS); wire this up to
      // a POST /booking/:id/invite endpoint on Vyas-Backend once it exists.

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
      try {
        const { users: data } = await apiClient.get<{ success: boolean; users: Profile[] }>(
          `/user/search?q=${encodeURIComponent(inviteSearch)}`,
        );
        if (cancelled) return;
        // Exclude current user and already selected
        const selectedIds = new Set(selectedInvitees.map((s) => s.id));
        const filtered = (data || []).filter(
          (p) => p.id !== user?.id && !selectedIds.has(p.id),
        );
        setInviteSearchResults(filtered);
      } catch (error) {
        if (cancelled) return;
        console.error("Invite search failed", error);
        setInviteSearchResults([]);
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
      <DialogContent className="w-[95vw] scale-[0.95] sm:scale-100 sm:max-w-[425px] max-h-[90vh] overflow-y-auto rounded-2xl sm:rounded-lg">
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
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-[2px]" />

              <AlertDescription className="text-blue-800 dark:text-blue-200">
                <div className="text-xs leading-relaxed">
                  • 7:30 AM – 10:30 PM • One booking per user
                </div>
              </AlertDescription>
            </div>
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
