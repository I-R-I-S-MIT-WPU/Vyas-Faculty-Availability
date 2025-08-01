import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Room, Booking } from "@/types/database";
import { useAuth } from "@/hooks/useAuth";
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addWeeks,
  subWeeks,
  isSameDay,
  parseISO,
  isWithinInterval,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import BookingDialog from "./BookingDialog";
import { toast } from "@/hooks/use-toast";

interface RoomCalendarProps {
  selectedRoom: Room | null;
}

// Time slots with ranges (start time for booking, display format)
const timeSlots = [
  { start: "08:30", display: "8:30-9:30" },
  { start: "09:30", display: "9:30-10:30" },
  { start: "10:30", display: "10:30-11:30" },
  { start: "11:30", display: "11:30-12:30" },
  { start: "12:30", display: "12:30-1:30" },
  { start: "13:30", display: "1:30-2:30" },
  { start: "14:30", display: "2:30-3:30" },
  { start: "15:30", display: "3:30-4:30" },
  { start: "16:30", display: "4:30-5:30" },
  { start: "17:30", display: "5:30-6:30" },
  { start: "18:30", display: "6:30-7:30" },
];

export default function RoomCalendar({ selectedRoom }: RoomCalendarProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState<{
    room: Room;
    date: Date;
    time: string;
  } | null>(null);
  const { user } = useAuth();

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  useEffect(() => {
    if (selectedRoom) {
      fetchBookings();
    }
  }, [currentWeek, selectedRoom]);

  const fetchBookings = async () => {
    if (!selectedRoom) return;

    setLoading(true);
    try {
      const { data: bookingsData, error } = await supabase
        .from("bookings")
        .select(
          `
          *,
          profiles (full_name)
        `
        )
        .eq("room_id", selectedRoom.id)
        .gte("start_time", weekStart.toISOString())
        .lte("start_time", weekEnd.toISOString());

      if (error) throw error;
      setBookings(bookingsData || []);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      toast({
        title: "Error",
        description: "Failed to load room bookings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getBookingForSlot = (day: Date, timeSlot: string) => {
    return bookings.find((booking) => {
      const bookingStart = parseISO(booking.start_time);
      const bookingEnd = parseISO(booking.end_time);
      const slotDate = new Date(day);
      slotDate.setHours(
        parseInt(timeSlot.split(":")[0]),
        parseInt(timeSlot.split(":")[1])
      );

      return (
        isSameDay(bookingStart, day) &&
        bookingStart <= slotDate &&
        bookingEnd > slotDate
      );
    });
  };

  const handleSlotClick = (day: Date, timeSlot: string) => {
    if (!selectedRoom) return;
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to make bookings",
        variant: "destructive",
      });
      return;
    }
    setSelectedBooking({ room: selectedRoom, date: day, time: timeSlot });
  };

  if (!selectedRoom) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-muted-foreground">
            Please select a room to view its schedule
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading room schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold">
            {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          onClick={() => setCurrentWeek(new Date())}
          variant="outline"
          size="sm"
        >
          Today
        </Button>
      </div>

      {/* Room Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{selectedRoom.name}</span>
            <Badge variant="secondary">
              {selectedRoom.room_type} • {selectedRoom.capacity} seats
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Header with days */}
              <div className="grid grid-cols-8 gap-2 mb-4">
                <div className="p-3 font-semibold text-center">Time</div>
                {weekDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    className="p-3 text-center font-semibold border-b"
                  >
                    <div>{format(day, "EEE")}</div>
                    <div className="text-sm text-muted-foreground">
                      {format(day, "MMM d")}
                    </div>
                  </div>
                ))}
              </div>

              {/* Time slot rows */}
              {timeSlots.map((timeSlot) => (
                <div
                  key={timeSlot.start}
                  className="grid grid-cols-8 gap-2 mb-2"
                >
                  <div className="p-3 text-center font-medium border-r">
                    {timeSlot.display}
                  </div>
                  {weekDays.map((day) => {
                    const booking = getBookingForSlot(day, timeSlot.start);
                    return (
                      <div
                        key={`${timeSlot.start}-${day.toISOString()}`}
                        className={`p-3 min-h-[80px] rounded border cursor-pointer transition-colors ${
                          booking
                            ? "bg-destructive text-destructive-foreground"
                            : user
                            ? "bg-muted hover:bg-accent border-dashed"
                            : "bg-muted/50"
                        }`}
                        onClick={() =>
                          !booking && handleSlotClick(day, timeSlot.start)
                        }
                      >
                        {booking ? (
                          <div className="space-y-1">
                            <div className="font-semibold text-sm">
                              {booking.title}
                            </div>
                            <div className="text-xs opacity-90">
                              {booking.profiles?.full_name}
                            </div>
                            {booking.class_division && (
                              <div className="text-xs opacity-75">
                                {booking.class_division}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            {user && (
                              <div className="text-center text-muted-foreground">
                                <Plus className="h-4 w-4 mx-auto mb-1" />
                                <div className="text-xs">Book</div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Booking Dialog */}
      {selectedBooking && (
        <BookingDialog
          open={!!selectedBooking}
          onOpenChange={(open) => !open && setSelectedBooking(null)}
          room={selectedBooking.room}
          date={selectedBooking.date}
          time={selectedBooking.time}
          onBookingCreated={fetchBookings}
        />
      )}
    </div>
  );
}
