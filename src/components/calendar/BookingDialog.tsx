import { useState } from "react";
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
import { Room } from "@/types/database";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { format, addHours, isWeekend, isBefore } from "date-fns";
import { AlertCircle, Clock, Calendar, MapPin } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  const { user } = useAuth();

  // Function to check for booking collisions
  const checkBookingCollision = async (
    startTime: Date,
    endTime: Date
  ): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("room_id", room.id)
        .or(
          `start_time.lt.${endTime.toISOString()},end_time.gt.${startTime.toISOString()}`
        );

      if (error) throw error;

      // If there are any overlapping bookings, return true (collision detected)
      return data && data.length > 0;
    } catch (error) {
      console.error("Error checking booking collision:", error);
      return false; // If we can't check, allow the booking to proceed
    }
  };

  // Function to check for user booking conflicts
  const checkUserBookingConflict = async (
    startTime: Date,
    endTime: Date
  ): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("teacher_id", user.id)
        .or(
          `start_time.lt.${endTime.toISOString()},end_time.gt.${startTime.toISOString()}`
        );

      if (error) throw error;

      // If there are any overlapping bookings for the same user, return true (conflict detected)
      return data && data.length > 0;
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
    
    // Check if it's a weekend
    if (isWeekend(startTime)) {
      return "Bookings are not allowed on weekends";
    }
    
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
          description: "This time slot conflicts with an existing booking for this room. Please choose a different time or duration.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Check for user booking conflict
      const hasUserConflict = await checkUserBookingConflict(startTime, endTime);
      if (hasUserConflict) {
        toast({
          title: "Personal Schedule Conflict",
          description: "You already have a booking that overlaps with this time period. Please choose a different time or duration.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const { error } = await supabase.from("bookings").insert({
        room_id: room.id,
        teacher_id: user.id,
        title,
        description: description || null,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        class_division: classDivision || null,
        panel: panel || null,
        year_course: yearCourse || null,
      });

      if (error) {
        // Handle specific database constraint errors
        if (error.message.includes("User already has a booking")) {
          toast({
            title: "Personal Schedule Conflict",
            description: "You already have a booking that overlaps with this time period.",
            variant: "destructive",
          });
        } else if (error.message.includes("Cannot create bookings in the past")) {
          toast({
            title: "Invalid Booking Time",
            description: "Cannot create bookings in the past.",
            variant: "destructive",
          });
        } else if (error.message.includes("Bookings are not allowed on weekends")) {
          toast({
            title: "Weekend Booking Not Allowed",
            description: "Bookings are not allowed on weekends.",
            variant: "destructive",
          });
        } else if (error.message.includes("Bookings cannot start before 7:30 AM")) {
          toast({
            title: "Invalid Start Time",
            description: "Bookings cannot start before 7:30 AM.",
            variant: "destructive",
          });
        } else if (error.message.includes("Bookings cannot end after 10:30 PM")) {
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

      toast({
        title: "Success",
        description: "Room booked successfully!",
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

  const [hours, minutes] = time.split(":").map(Number);
  const startTime = new Date(date);
  startTime.setHours(hours, minutes, 0, 0);
  const endTime = new Date(startTime);
  endTime.setHours(hours + parseInt(duration), minutes, 0, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <MapPin className="h-5 w-5" />
            <span>Book Room {room.name}</span>
          </DialogTitle>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4" />
              <span>{format(date, "EEEE, MMMM d, yyyy")}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4" />
              <span>{format(startTime, "h:mm a")} - {format(endTime, "h:mm a")}</span>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="e.g., Data Structures Lecture"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Duration *</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="focus:ring-2 focus:ring-blue-500">
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="class-division">Class/Division</Label>
              <Input
                id="class-division"
                placeholder="e.g., B.Tech A"
                value={classDivision}
                onChange={(e) => setClassDivision(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="panel">Panel</Label>
              <Input
                id="panel"
                placeholder="e.g., Panel 1"
                value={panel}
                onChange={(e) => setPanel(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="year-course">Year/Course</Label>
            <Input
              id="year-course"
              placeholder="e.g., 2nd Year Computer Science"
              value={yearCourse}
              onChange={(e) => setYearCourse(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Additional details about the booking..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Booking Information Alert */}
          <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-blue-800 dark:text-blue-200">
              <div className="space-y-1 text-sm">
                <div>• Bookings are available from 7:30 AM to 10:30 PM</div>
                <div>• Weekends are not available for booking</div>
                <div>• You can only have one booking at a time</div>
                <div>• Past time slots are automatically disabled</div>
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
