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
  isWeekend,
  isBefore,
  addHours,
  setHours,
  setMinutes,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  AlertCircle,
} from "lucide-react";
import BookingDialog from "./BookingDialog";
import { toast } from "@/hooks/use-toast";

interface RoomCalendarProps {
  selectedRoom: Room | null;
}

// Updated time slots from 7:30 to 22:30 (10:30 PM)
const timeSlots = [
  { start: "07:30", display: "7:30-8:30", hour: 7, minute: 30 },
  { start: "08:30", display: "8:30-9:30", hour: 8, minute: 30 },
  { start: "09:30", display: "9:30-10:30", hour: 9, minute: 30 },
  { start: "10:30", display: "10:30-11:30", hour: 10, minute: 30 },
  { start: "11:30", display: "11:30-12:30", hour: 11, minute: 30 },
  { start: "12:30", display: "12:30-1:30", hour: 12, minute: 30 },
  { start: "13:30", display: "1:30-2:30", hour: 13, minute: 30 },
  { start: "14:30", display: "2:30-3:30", hour: 14, minute: 30 },
  { start: "15:30", display: "3:30-4:30", hour: 15, minute: 30 },
  { start: "16:30", display: "4:30-5:30", hour: 16, minute: 30 },
  { start: "17:30", display: "5:30-6:30", hour: 17, minute: 30 },
  { start: "18:30", display: "6:30-7:30", hour: 18, minute: 30 },
  { start: "19:30", display: "7:30-8:30", hour: 19, minute: 30 },
  { start: "20:30", display: "8:30-9:30", hour: 20, minute: 30 },
  { start: "21:30", display: "9:30-10:30", hour: 21, minute: 30 },
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

  const isSlotDisabled = (
    day: Date,
    timeSlot: { hour: number; minute: number }
  ) => {
    const now = new Date();
    const slotTime = new Date(day);
    slotTime.setHours(timeSlot.hour, timeSlot.minute, 0, 0);

    // Disable if slot is in the past
    if (isBefore(slotTime, now)) {
      return true;
    }

    // Disable if it's a weekend
    if (isWeekend(day)) {
      return true;
    }

    return false;
  };

  const isLunchTime = (timeSlot: { hour: number; minute: number }) => {
    // Lunch time: 12:30 - 1:30
    return timeSlot.hour === 12 && timeSlot.minute === 30;
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

    // Check if slot is disabled
    const timeSlotObj = timeSlots.find((ts) => ts.start === timeSlot);
    if (timeSlotObj && isSlotDisabled(day, timeSlotObj)) {
      toast({
        title: "Slot Unavailable",
        description: "This time slot is not available for booking",
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
          <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
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
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-2 sm:space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
            className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-base sm:text-lg font-semibold text-center">
            {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
            className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          onClick={() => setCurrentWeek(new Date())}
          variant="outline"
          size="sm"
          className="h-8 px-3 text-sm"
        >
          Today
        </Button>
      </div>

      {/* Room Info */}
      <Card className="shadow-lg border-0 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <span className="text-lg sm:text-xl font-bold">
              {selectedRoom.name}
            </span>
            <Badge variant="secondary" className="text-xs sm:text-sm">
              {selectedRoom.room_type} • {selectedRoom.capacity} seats
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <div className="min-w-[800px] sm:min-w-[900px]">
              {/* Header with days */}
              <div className="grid grid-cols-8 gap-1 sm:gap-2 mb-3 sm:mb-4">
                <div className="p-2 sm:p-3 font-semibold text-center bg-muted/50 rounded-lg text-xs sm:text-sm">
                  Time
                </div>
                {weekDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    className={`p-2 sm:p-3 text-center font-semibold border-b rounded-lg ${
                      isWeekend(day)
                        ? "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400"
                        : "bg-muted/50"
                    }`}
                  >
                    <div className="font-bold text-xs sm:text-sm">
                      {format(day, "EEE")}
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      {format(day, "MMM d")}
                    </div>
                    {isWeekend(day) && (
                      <div className="text-xs text-red-500 mt-1 hidden sm:block">
                        Weekend
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Time slot rows */}
              {timeSlots.map((timeSlot) => (
                <div
                  key={timeSlot.start}
                  className="grid grid-cols-8 gap-1 sm:gap-2 mb-1 sm:mb-2"
                >
                  <div
                    className={`p-2 sm:p-3 text-center font-medium border-r rounded-lg ${
                      isLunchTime(timeSlot)
                        ? "bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400"
                        : "bg-muted/30"
                    }`}
                  >
                    <div className="font-semibold text-xs sm:text-sm">
                      {timeSlot.display}
                    </div>
                    {isLunchTime(timeSlot) && (
                      <div className="text-xs text-orange-500 mt-1 hidden sm:block">
                        Lunch
                      </div>
                    )}
                  </div>
                  {weekDays.map((day) => {
                    const booking = getBookingForSlot(day, timeSlot.start);
                    const isDisabled = isSlotDisabled(day, timeSlot);
                    const isWeekendDay = isWeekend(day);

                    return (
                      <div
                        key={`${timeSlot.start}-${day.toISOString()}`}
                        className={`p-2 sm:p-3 min-h-[60px] sm:min-h-[80px] rounded-lg border transition-all duration-200 ${
                          isDisabled
                            ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed border-gray-200 dark:border-gray-700"
                            : booking
                            ? "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800 cursor-not-allowed"
                            : isWeekendDay
                            ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 cursor-not-allowed"
                            : user
                            ? "bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-900/30 border-green-200 dark:border-green-800 cursor-pointer hover:shadow-md"
                            : "bg-muted/50 cursor-not-allowed"
                        }`}
                        onClick={() =>
                          !isDisabled &&
                          !booking &&
                          !isWeekendDay &&
                          handleSlotClick(day, timeSlot.start)
                        }
                      >
                        {booking ? (
                          <div className="space-y-0.5 sm:space-y-1">
                            <div className="font-semibold text-xs sm:text-sm leading-tight">
                              {booking.title}
                            </div>
                            <div className="text-xs opacity-90 hidden sm:block">
                              {booking.profiles?.full_name}
                            </div>
                            {booking.class_division && (
                              <div className="text-xs opacity-75 hidden sm:block">
                                {booking.class_division}
                              </div>
                            )}
                          </div>
                        ) : isDisabled ? (
                          <div className="flex items-center justify-center h-full">
                            <div className="text-center text-muted-foreground">
                              <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 mx-auto mb-0.5 sm:mb-1" />
                              <div className="text-xs">
                                {isWeekendDay ? "Weekend" : "Past"}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            {user && (
                              <div className="text-center text-muted-foreground">
                                <Plus className="h-3 w-3 sm:h-4 sm:w-4 mx-auto mb-0.5 sm:mb-1" />
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

      {/* Legend */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4 sm:pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 text-xs sm:text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-green-100 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded"></div>
              <span>Available</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded"></div>
              <span>Booked</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded"></div>
              <span>Lunch Time</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded"></div>
              <span>Unavailable</span>
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
