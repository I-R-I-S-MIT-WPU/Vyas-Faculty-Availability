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
import { format } from "date-fns";

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

      // Check for booking collision before creating the booking
      const hasCollision = await checkBookingCollision(startTime, endTime);

      if (hasCollision) {
        toast({
          title: "Booking Conflict",
          description:
            "This time slot conflicts with an existing booking. Please choose a different time or duration.",
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

      if (error) throw error;

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
      toast({
        title: "Error",
        description: error.message || "Failed to create booking",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Book Room {room.name}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {format(date, "EEEE, MMMM d, yyyy")} at {time}
          </p>
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
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Duration *</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger>
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

          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Booking..." : "Book Room"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
