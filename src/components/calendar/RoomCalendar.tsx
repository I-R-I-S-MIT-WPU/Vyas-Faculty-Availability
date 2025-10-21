import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Room, Booking, Floor, Building } from "@/types/database";
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
  Building2,
  MapPin,
  Users,
  X,
} from "lucide-react";
import BookingDialog from "./BookingDialog";
import { toast } from "@/hooks/use-toast";
import FreeRooms from "@/components/selectors/FreeRooms";

// Room type mapping (mirrors left sidebar look & feel)
const roomTypeLabels: Record<
  string,
  { label: string; color: string; icon: any }
> = {
  classroom: {
    label: "Lecture Room",
    icon: Building2,
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300",
  },
  lab: {
    label: "Lab",
    icon: Users,
    color:
      "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300",
  },
  conference: {
    label: "Conference Room",
    icon: Users,
    color:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300",
  },
  auditorium: {
    label: "Hall",
    icon: Users,
    color:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300",
  },
  seminar: {
    label: "Seminar Room",
    icon: Users,
    color:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300",
  },
  discussion: {
    label: "Discussion Room",
    icon: Users,
    color: "bg-teal-100 text-teal-800 dark:bg-teal-900/20 dark:text-teal-300",
  },
};

const getRoomTypeLabel = (roomType: string) =>
  roomTypeLabels[roomType]?.label || roomType;
const getRoomTypeColor = (roomType: string) =>
  roomTypeLabels[roomType]?.color ||
  "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300";
const getRoomTypeIcon = (roomType: string) =>
  roomTypeLabels[roomType]?.icon || Building2;

// Capacity-based subtle background
const getCapacityBgClass = (capacity?: number) => {
  if (!capacity) return "bg-muted/30";
  if (capacity > 100)
    return "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800";
  if (capacity > 60)
    return "bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800";
  if (capacity > 30)
    return "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800";
  return "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800";
};

interface RoomCalendarProps {
  selectedRoom: Room | null;
  onRoomSelect?: (room: Room | null) => void;
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

export default function RoomCalendar({
  selectedRoom,
  onRoomSelect,
}: RoomCalendarProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState<{
    room: Room;
    date: Date;
    time: string;
  } | null>(null);
  const { user } = useAuth();

  // Simple discovery state when no room selected
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [floors, setFloors] = useState<
    (Floor & { rooms: Room[]; building: Building })[]
  >([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [roomType, setRoomType] = useState("");
  const [minCapacity, setMinCapacity] = useState("");

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  useEffect(() => {
    if (selectedRoom) {
      fetchBookings();
    }
  }, [currentWeek, selectedRoom]);

  useEffect(() => {
    // Fetch buildings once for discovery view
    const fetchBuildings = async () => {
      try {
        const { data, error } = await supabase
          .from("buildings")
          .select("*")
          .eq("is_active", true)
          .order("name");
        if (error) throw error;
        const list = data || [];
        setBuildings(list);
        // Default to Vyas if present
        const vyas = list.find((b) => b.name?.toLowerCase() === "vyas");
        setSelectedBuildingId((vyas || list[0])?.id || "");
      } catch (e) {
        console.error("Error loading buildings", e);
      }
    };
    if (!selectedRoom) {
      fetchBuildings();
    }
  }, [selectedRoom]);

  useEffect(() => {
    const fetchFloors = async () => {
      if (!selectedBuildingId) return;
      try {
        const { data, error } = await supabase
          .from("floors")
          .select(`*, rooms (*), building:buildings(*)`)
          .eq("building_id", selectedBuildingId)
          .order("number");
        if (error) throw error;
        setFloors((data as any) || []);
      } catch (e) {
        console.error("Error loading floors", e);
      }
    };
    if (!selectedRoom) {
      fetchFloors();
    }
  }, [selectedBuildingId, selectedRoom]);

  const fetchBookings = async () => {
    if (!selectedRoom) return;

    setLoading(true);
    try {
      const { data: bookingsData, error } = await supabase
        .from("bookings")
        .select(
          `
          *,
          owner:profiles!bookings_teacher_id_fkey(full_name)
        `
        )
        .eq("room_id", selectedRoom.id)
        .eq("status", "confirmed")
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

    // Weekends are allowed

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
    // Filter and flatten rooms
    const allRooms = floors.flatMap((f) =>
      f.rooms.map((r) => ({ room: r, floor: f }))
    );
    const filteredRooms = allRooms.filter(({ room }) => {
      const matchesSearch = searchTerm
        ? room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          room.room_type.toLowerCase().includes(searchTerm.toLowerCase())
        : true;
      const matchesType =
        roomType && roomType !== "any" ? room.room_type === roomType : true;
      const matchesCapacity =
        minCapacity && minCapacity !== "any"
          ? (room.capacity || 0) >= parseInt(minCapacity)
          : true;
      return matchesSearch && matchesType && matchesCapacity;
    });

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Start by choosing a building
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Building</label>
                <Select
                  value={selectedBuildingId}
                  onValueChange={setSelectedBuildingId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select building" />
                  </SelectTrigger>
                  <SelectContent>
                    {buildings.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Search</label>
                <Input
                  placeholder="Room name or type"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Room type</label>
                  <Select value={roomType} onValueChange={setRoomType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="classroom">Classroom</SelectItem>
                      <SelectItem value="lab">Laboratory</SelectItem>
                      <SelectItem value="conference">Conference</SelectItem>
                      <SelectItem value="auditorium">Auditorium</SelectItem>
                      <SelectItem value="seminar">Seminar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Min capacity</label>
                  <Select value={minCapacity} onValueChange={setMinCapacity}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="20">20+</SelectItem>
                      <SelectItem value="30">30+</SelectItem>
                      <SelectItem value="50">50+</SelectItem>
                      <SelectItem value="100">100+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Rooms</CardTitle>
            {/* Compact Find Free Rooms trigger inside selector box */}
            <FreeRooms
              compactTrigger
              onRoomSelect={(r) =>
                onRoomSelect && onRoomSelect(r as unknown as Room)
              }
            />
          </CardHeader>
          <CardContent>
            {filteredRooms.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Clock className="h-10 w-10 mx-auto mb-2" />
                <div>No rooms match your filters</div>
              </div>
            ) : (
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                {Array.from(
                  filteredRooms.reduce((map, item) => {
                    const floorName = item.floor?.name || "Other";
                    if (!map.has(floorName))
                      map.set(floorName, [] as typeof filteredRooms);
                    map.get(floorName)!.push(item);
                    return map;
                  }, new Map<string, typeof filteredRooms>())
                ).map(([floorName, roomsOnFloor]) => (
                  <div key={floorName}>
                    <div className="sticky top-0 z-10 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-1 py-1">
                      <div className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                        <MapPin className="h-3 w-3" /> {floorName}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-1">
                      {roomsOnFloor.map(({ room, floor }) => {
                        const TypeIcon = getRoomTypeIcon(room.room_type);
                        const typeColor = getRoomTypeColor(room.room_type);
                        const capBg = getCapacityBgClass(room.capacity);
                        return (
                          <div
                            key={room.id}
                            className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm hover:border-primary/50 ${capBg}`}
                            onClick={() => onRoomSelect && onRoomSelect(room)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-1">
                                  <h4 className="font-medium text-sm">
                                    {room.name}
                                  </h4>
                                  <Badge
                                    variant="secondary"
                                    className={`text-xs ${typeColor}`}
                                  >
                                    <TypeIcon className="h-3 w-3 mr-1" />
                                    {getRoomTypeLabel(room.room_type)}
                                  </Badge>
                                </div>
                                <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                  <div className="flex items-center space-x-1">
                                    <Building2 className="h-3 w-3" />
                                    <span>{floor.building.name}</span>
                                  </div>
                                  <div className="flex items-center space-x-1">
                                    <Users className="h-3 w-3" />
                                    <span>{room.capacity || "N/A"} seats</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs sm:text-sm">
                {selectedRoom.room_type} • {selectedRoom.capacity} seats
              </Badge>
              {onRoomSelect && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onRoomSelect && onRoomSelect(null)}
                  aria-label="Close room"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
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
                    className={`p-2 sm:p-3 text-center font-semibold border-b rounded-lg bg-muted/50`}
                  >
                    <div className="font-bold text-xs sm:text-sm">
                      {format(day, "EEE")}
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      {format(day, "MMM d")}
                    </div>
                    {/* Weekends allowed */}
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
                    const isWeekendDay = false;

                    return (
                      <div
                        key={`${timeSlot.start}-${day.toISOString()}`}
                        className={`p-2 sm:p-3 min-h-[60px] sm:min-h-[80px] rounded-lg border transition-all duration-200 ${
                          isDisabled
                            ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed border-gray-200 dark:border-gray-700"
                            : booking
                            ? "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800 cursor-not-allowed"
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
                              <div className="text-xs">{"Past"}</div>
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
