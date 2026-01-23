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
import BookingDetailsSidebar from "./BookingDetailsSidebar";
import TemplateExceptionDialog from "./TemplateExceptionDialog";
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
  const [effectiveTimetable, setEffectiveTimetable] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState<{
    room: Room;
    date: Date;
    time: string;
  } | null>(null);
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<{
    slot: any;
    weekStart: Date;
  } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [exceptionDialogOpen, setExceptionDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<{
    id: string;
    title: string;
    weekStart: Date;
  } | null>(null);
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<{ full_name: string } | null>(
    null,
  );

  // Simple discovery state when no room selected
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [floors, setFloors] = useState<
    (Floor & { rooms: Room[]; building: Building })[]
  >([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [roomType, setRoomType] = useState("");
  const [minCapacity, setMinCapacity] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  useEffect(() => {
    if (user) {
      const fetchUserProfile = async () => {
        const { data } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        if (data) {
          setUserProfile(data);
        }
      };
      fetchUserProfile();
    }
  }, [user]);

  useEffect(() => {
    if (selectedRoom) {
      fetchEffectiveTimetable();
    }
  }, [currentWeek, selectedRoom]);

  useEffect(() => {
    // Fetch buildings once for discovery view
    const fetchBuildings = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("buildings")
          .select("*")
          .eq("is_active", true)
          .order("name");
        if (error) throw error;
        const list = (data || []) as Building[];
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
        const { data, error } = await (supabase as any)
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

  const fetchEffectiveTimetable = async (
    options: { silent?: boolean } = {},
  ) => {
    if (!selectedRoom) return [];

    if (!options.silent) {
      setLoading(true);
    }

    try {
      // Calculate week start (Monday)
      const weekStartDate = format(weekStart, "yyyy-MM-dd");

      // DEBUG: Fetch all templates directly from database to compare
      const { data: allTemplates, error: templatesError } = await (
        supabase as any
      )
        .from("room_timetable_templates")
        .select("*")
        .eq("room_id", selectedRoom.id)
        .eq("is_active", true);

      // DEBUG: Check for exceptions that might cancel templates
      const { data: exceptions, error: exceptionsError } = await (
        supabase as any
      )
        .from("room_timetable_template_exceptions")
        .select("*")
        .eq("week_start_date", weekStartDate);

      if (!templatesError && allTemplates) {
        console.log("🔍 ALL ACTIVE TEMPLATES IN DATABASE:", {
          count: allTemplates.length,
          templates: allTemplates.map((t: any) => {
            // Calculate if this template should show this week
            const templateWeekday = t.weekday;
            const weekHasThisWeekday = weekDays.some((d) => {
              const dWeekday = d.getDay() === 0 ? 6 : d.getDay() - 1;
              return dWeekday === templateWeekday;
            });

            // Check repeat interval
            const weekDiff = Math.floor(
              (weekStart.getTime() - new Date(t.effective_from).getTime()) /
                (7 * 24 * 60 * 60 * 1000),
            );
            const shouldShowByRepeat =
              t.repeat_interval_weeks === 1 ||
              weekDiff % t.repeat_interval_weeks === 0;

            // Check if cancelled
            const isCancelled = exceptions?.some(
              (e: any) => e.template_id === t.id,
            );

            return {
              id: t.id,
              title: t.title,
              weekday: t.weekday,
              start_time: t.start_time,
              effective_from: t.effective_from,
              repeat_interval_weeks: t.repeat_interval_weeks,
              teacher: t.teacher_name,
              shouldShow:
                weekHasThisWeekday && shouldShowByRepeat && !isCancelled,
              weekHasWeekday: weekHasThisWeekday,
              shouldShowByRepeat,
              isCancelled,
              weekDiff,
            };
          }),
          currentWeekStart: weekStartDate,
          weekDays: weekDays.map((d) => ({
            date: format(d, "yyyy-MM-dd"),
            weekday: d.getDay() === 0 ? 6 : d.getDay() - 1, // Convert to 0-6 (Mon-Sun)
          })),
          exceptions: exceptions || [],
        });
      }

      // Call the effective timetable function
      const { data, error } = await (supabase as any).rpc(
        "get_effective_timetable",
        {
          p_room_id: selectedRoom.id,
          p_week_start: weekStartDate,
        },
      );

      if (error) {
        console.error("Effective timetable error:", error);
        throw error;
      }

      const timetable = (data || []) as any[];
      const templates = timetable.filter((s) => s.slot_type === "template");
      console.log("✅ EFFECTIVE TIMETABLE FROM SQL FUNCTION:", {
        count: timetable.length,
        templateCount: templates.length,
        templates: templates.map((t) => ({
          id: t.template_id,
          title: t.title,
          start_time: t.start_time,
          teacher: t.teacher_name,
          weekday:
            new Date(t.start_time).getDay() === 0
              ? 6
              : new Date(t.start_time).getDay() - 1,
        })),
        bookings: timetable.filter((s) => s.slot_type === "booking").length,
        cancelled: timetable.filter(
          (s) => s.slot_type === "exception_cancelled",
        ).length,
        weekStart: weekStartDate,
      });
      setEffectiveTimetable(timetable);

      // Also fetch regular bookings for the sidebar/details view
      const { data: bookingsData, error: bookingsError } = await (
        supabase as any
      )
        .from("bookings")
        .select(
          `
          *,
          profiles:profiles!bookings_teacher_id_fkey(full_name, email)
        `,
        )
        .eq("room_id", selectedRoom.id)
        .eq("status", "confirmed")
        .gte("start_time", weekStart.toISOString())
        .lte("start_time", weekEnd.toISOString());

      if (bookingsError) throw bookingsError;
      const list = (bookingsData || []) as Booking[];
      setBookings(list);

      return timetable;
    } catch (error) {
      console.error("Error fetching effective timetable:", error);
      toast({
        title: "Error",
        description: "Failed to load room timetable",
        variant: "destructive",
      });
      return [];
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  };

  // Keep fetchBookings for backward compatibility
  const fetchBookings = fetchEffectiveTimetable;

  const getSlotForTime = (day: Date, timeSlot: string) => {
    // Create the time slot window (1 hour slot) in local time
    const [hours, minutes] = timeSlot.split(":").map(Number);
    const slotDate = new Date(day);
    slotDate.setHours(hours, minutes, 0, 0);
    const slotEnd = new Date(slotDate);
    slotEnd.setHours(slotEnd.getHours() + 1);

    // Find all slots that overlap with this time slot
    const matchingSlots = effectiveTimetable.filter((slot) => {
      // Parse the slot times - these come from the database as timestamps
      const slotStart = parseISO(slot.start_time);
      const slotEndTime = parseISO(slot.end_time);

      // Get local time components for day comparison
      const slotStartLocal = new Date(slotStart);
      const dayLocal = new Date(day);

      // Check if it's the same day (ignoring time)
      const isSameDay =
        slotStartLocal.getFullYear() === dayLocal.getFullYear() &&
        slotStartLocal.getMonth() === dayLocal.getMonth() &&
        slotStartLocal.getDate() === dayLocal.getDate();

      if (!isSameDay) return false;

      // Check if the slot overlaps with this time slot
      // A slot matches if it starts within this time slot OR overlaps with it
      // slotStart < slotEnd (the 1-hour calendar slot) AND slotEndTime > slotDate
      const overlaps = slotStart < slotEnd && slotEndTime > slotDate;

      return overlaps;
    });

    // Return the first matching slot (prioritize bookings over templates if both exist)
    // If multiple slots overlap, prefer the one that starts closest to the slot start time
    const sortedSlots = matchingSlots.sort((a, b) => {
      const aStart = parseISO(a.start_time).getTime();
      const bStart = parseISO(b.start_time).getTime();
      const slotStartTime = slotDate.getTime();
      return (
        Math.abs(aStart - slotStartTime) - Math.abs(bStart - slotStartTime)
      );
    });

    return sortedSlots.find((s) => s.slot_type === "booking") || sortedSlots[0];
  };

  const isSlotDisabled = (
    day: Date,
    timeSlot: { hour: number; minute: number },
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

  const handleBookingClick = (booking: Booking) => {
    setActiveBooking(booking);
    setDetailsOpen(true);
  };

  const handleBookingUpdated = async (bookingId: string) => {
    const refreshed = await fetchBookings({ silent: true });
    const updatedBooking =
      refreshed.find((item) => item.id === bookingId) || null;
    if (updatedBooking) {
      setActiveBooking(updatedBooking);
    } else {
      setActiveBooking(null);
      setDetailsOpen(false);
    }
  };

  const handleBookingDeleted = async (bookingId: string) => {
    await fetchBookings({ silent: true });
    if (activeBooking?.id === bookingId) {
      setActiveBooking(null);
      setDetailsOpen(false);
    }
  };

  if (!selectedRoom) {
    // Filter and flatten rooms
    const allRooms = floors.flatMap((f) =>
      f.rooms.map((r) => ({ room: r, floor: f })),
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
                  }, new Map<string, typeof filteredRooms>()),
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
    <div className="space-y-4 h-full flex flex-col">
      {/* Week Navigation */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 pt-4">
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
      <Card className="shadow-lg border-0 bg-transparent w-full h-full flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0 px-4 pt-4 bg-transparent">
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
        <CardContent className="px-0 w-full flex-1 flex flex-col min-h-0 bg-transparent">
          {/* Show Cancelled Toggle Button */}
          <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0 bg-transparent">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCancelled(!showCancelled)}
                className="text-xs"
              >
                {showCancelled ? "Hide" : "Show"} Cancelled Classes
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Continuous Timeline View - Google Calendar Style */}
            <div
              className="hidden md:flex border-t border-l"
              style={{ minHeight: "1088px" }}
            >
              {/* Time column */}
              <div className="w-20 sm:w-24 flex-shrink-0 border-r bg-muted/30 sticky left-0 z-30">
                <div className="h-12 border-b bg-muted/50 sticky top-0"></div>
                {/* Time markers from 7:00 to 23:00 */}
                {Array.from({ length: 17 }, (_, i) => {
                  const hour = 7 + i;
                  const isLunchHour = hour === 12;
                  return (
                    <div
                      key={hour}
                      className={`h-16 border-b border-dashed border-muted-foreground/20 relative ${
                        isLunchHour
                          ? "bg-orange-50/30 dark:bg-orange-950/10"
                          : ""
                      }`}
                    >
                      <div className="absolute left-1 top-0 text-xs text-muted-foreground font-medium whitespace-nowrap pr-2">
                        {hour <= 12
                          ? `${hour === 0 ? 12 : hour}:00`
                          : `${hour - 12}:00`}
                        {hour >= 12 ? " PM" : hour === 0 ? " AM" : " AM"}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Days columns */}
              <div className="flex-1 flex">
                {weekDays.map((day) => {
                  // Get all events for this day (filter out cancelled if not showing)
                  const dayEvents = effectiveTimetable.filter((slot) => {
                    const slotStart = parseISO(slot.start_time);
                    const isSameDay =
                      slotStart.getFullYear() === day.getFullYear() &&
                      slotStart.getMonth() === day.getMonth() &&
                      slotStart.getDate() === day.getDate();

                    // Filter out cancelled slots if not showing them
                    if (!showCancelled && slot.is_cancelled) {
                      return false;
                    }

                    return isSameDay;
                  });

                  // Group overlapping events together (transitive closure)
                  const eventGroups: (typeof dayEvents)[] = [];
                  const processed = new Set<string>();

                  dayEvents.forEach((slot) => {
                    if (processed.has(slot.slot_id)) return;

                    const slotStart = parseISO(slot.start_time);
                    const slotEnd = parseISO(slot.end_time);
                    const group: typeof dayEvents = [slot];
                    processed.add(slot.slot_id);

                    // Find all events that overlap with any event in this group
                    let foundNew = true;
                    while (foundNew) {
                      foundNew = false;
                      dayEvents.forEach((otherSlot) => {
                        if (processed.has(otherSlot.slot_id)) return;

                        const otherStart = parseISO(otherSlot.start_time);
                        const otherEnd = parseISO(otherSlot.end_time);

                        // Check if this event overlaps with any event in the current group
                        const overlaps = group.some((groupSlot) => {
                          const groupStart = parseISO(groupSlot.start_time);
                          const groupEnd = parseISO(groupSlot.end_time);
                          return otherStart < groupEnd && otherEnd > groupStart;
                        });

                        if (overlaps) {
                          group.push(otherSlot);
                          processed.add(otherSlot.slot_id);
                          foundNew = true;
                        }
                      });
                    }

                    // Sort group by start time
                    group.sort((a, b) => {
                      const aStart = parseISO(a.start_time).getTime();
                      const bStart = parseISO(b.start_time).getTime();
                      return aStart - bStart;
                    });

                    eventGroups.push(group);
                  });

                  // Calculate positions for overlapping events
                  const eventsWithPositions = dayEvents.map((slot) => {
                    const slotStart = parseISO(slot.start_time);
                    const slotEnd = parseISO(slot.end_time);

                    // Calculate position from top (7:00 AM = 0)
                    const startHour = slotStart.getHours();
                    const startMinute = slotStart.getMinutes();
                    const startPosition =
                      (startHour - 7) * 64 + (startMinute / 60) * 64;

                    // Calculate height based on duration
                    const durationMinutes =
                      (slotEnd.getTime() - slotStart.getTime()) / (1000 * 60);
                    const height = (durationMinutes / 60) * 64;

                    // Find which group this slot belongs to
                    const group = eventGroups.find((g) =>
                      g.some((e) => e.slot_id === slot.slot_id),
                    ) || [slot];

                    const overlapIndex = group.findIndex(
                      (e) => e.slot_id === slot.slot_id,
                    );
                    const overlapCount = group.length;

                    // Calculate width and position for side-by-side display
                    const widthPercent =
                      overlapCount > 1 ? 100 / overlapCount : 100;
                    const leftPercent =
                      overlapCount > 1 ? overlapIndex * widthPercent : 0;

                    // Check if slot is in the past
                    const now = new Date();
                    const isPast = slotEnd < now;

                    // Check if it's lunch time (12:30-1:30)
                    const isLunchTime =
                      (startHour === 12 && startMinute === 30) ||
                      (startHour === 13 && startMinute === 30);

                    // Determine slot type and permissions
                    const isTemplate = slot.slot_type === "template";
                    const isCancelled = slot.is_cancelled === true;
                    const isBooking = slot.slot_type === "booking";
                    const isUserSlot =
                      (isBooking &&
                        slot.booking_id &&
                        bookings.find((b) => b.id === slot.booking_id)
                          ?.teacher_id === user?.id) ||
                      (isTemplate &&
                        slot.teacher_name &&
                        userProfile?.full_name &&
                        slot.teacher_name.toLowerCase() ===
                          userProfile.full_name.toLowerCase());

                    return {
                      ...slot,
                      startPosition,
                      height,
                      isTemplate,
                      isCancelled,
                      isBooking,
                      isUserSlot,
                      isPast,
                      isLunchTime,
                      widthPercent,
                      leftPercent,
                    };
                  });

                  return (
                    <div
                      key={day.toISOString()}
                      className="flex-1 border-r relative"
                      style={{ minWidth: "calc((100% - 96px) / 7)" }}
                    >
                      {/* Day header */}
                      <div className="h-12 border-b bg-muted/50 p-2 text-center sticky top-0 z-20 backdrop-blur-sm">
                        <div className="font-bold text-xs sm:text-sm">
                          {format(day, "EEE")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(day, "MMM d")}
                        </div>
                      </div>

                      {/* Day timeline container */}
                      <div className="relative" style={{ height: "1088px" }}>
                        {/* Hour lines */}
                        {Array.from({ length: 17 }, (_, i) => (
                          <div
                            key={i}
                            className="absolute left-0 right-0 border-b border-dashed border-muted-foreground/10"
                            style={{ top: `${i * 64}px` }}
                          />
                        ))}

                        {/* Events */}
                        {eventsWithPositions.map((event) => (
                          <div
                            key={`${event.slot_id}-${event.start_time}`}
                            className={`absolute rounded-md border p-1.5 sm:p-2 cursor-pointer transition-all hover:shadow-md z-20 overflow-hidden ${
                              event.isCancelled
                                ? showCancelled
                                  ? "bg-yellow-50/30 dark:bg-yellow-900/10 text-yellow-700/70 dark:text-yellow-300/70 border-yellow-200/50 dark:border-yellow-800/50 border-dashed opacity-50"
                                  : "hidden"
                                : event.isPast
                                  ? "bg-gray-200/50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-500 border-gray-300 dark:border-gray-700 opacity-60"
                                  : event.isLunchTime
                                    ? "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-200 dark:border-orange-700"
                                    : event.isTemplate
                                      ? "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-700"
                                      : event.isBooking
                                        ? event.isUserSlot
                                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-700"
                                          : "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
                                        : "bg-gray-100 dark:bg-gray-800"
                            }`}
                            style={{
                              top: `${event.startPosition}px`,
                              height: `${Math.max(event.height, 56)}px`,
                              minHeight: "56px",
                              left: `${event.leftPercent}%`,

                              width: `${event.widthPercent * 0.95}%`,

                              marginLeft: event.leftPercent === 0 ? "4px" : "0",
                              marginRight:
                                event.leftPercent + event.widthPercent >= 100
                                  ? "4px"
                                  : "2px",
                            }}
                            onClick={() => {
                              if (event.isCancelled) {
                                handleSlotClick(
                                  day,
                                  format(parseISO(event.start_time), "HH:mm"),
                                );
                                return;
                              }
                              if (event.isBooking && event.booking_id) {
                                const booking = bookings.find(
                                  (b) => b.id === event.booking_id,
                                );
                                if (booking) {
                                  handleBookingClick(booking);
                                  return;
                                }
                              }
                              // Open sidebar for templates (both user and non-user)
                              if (event.isTemplate) {
                                const weekStartForException = startOfWeek(day, {
                                  weekStartsOn: 1,
                                });
                                setActiveTemplate({
                                  slot: event,
                                  weekStart: weekStartForException,
                                });
                                setDetailsOpen(true);
                                return;
                              }
                            }}
                          >
                            <div className="h-full flex flex-col overflow-hidden gap-0.5">
                              <div
                                className="text-xs sm:text-sm font-semibold leading-tight line-clamp-1 flex-shrink-0 truncate"
                                title={event.title}
                              >
                                {event.title}
                              </div>
                              <div className="text-[10px] sm:text-xs opacity-80 line-clamp-1 flex-shrink-0 truncate">
                                {format(parseISO(event.start_time), "h:mm a")} -{" "}
                                {format(parseISO(event.end_time), "h:mm a")}
                              </div>
                              {event.teacher_name && (
                                <div
                                  className="text-[10px] sm:text-xs opacity-75 line-clamp-1 flex-shrink-0 truncate"
                                  title={event.teacher_name}
                                >
                                  {event.teacher_name}
                                </div>
                              )}
                              {event.isTemplate && (
                                <div className="text-[9px] font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300 mt-auto flex-shrink-0">
                                  Template
                                </div>
                              )}
                              {event.isUserSlot && !event.isTemplate && (
                                <div className="text-[9px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 mt-auto flex-shrink-0">
                                  Manage
                                </div>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Clickable empty slots and hour markers */}
                        {Array.from({ length: 17 }, (_, i) => {
                          const hour = 7 + i;
                          const slotTime = new Date(day);
                          slotTime.setHours(hour, 0, 0, 0);
                          const slotInPast = isBefore(slotTime, new Date());
                          // Lunch time is 12:30-1:30, highlight the 12:00-1:00 and 1:00-2:00 slots
                          const isLunchHour = hour === 12 || hour === 13;

                          return (
                            <div
                              key={hour}
                              className={`absolute left-0 right-0 transition-colors ${
                                slotInPast
                                  ? "bg-gray-100/30 dark:bg-gray-800/30 cursor-not-allowed"
                                  : isLunchHour
                                    ? "bg-orange-50/20 dark:bg-orange-950/10 cursor-pointer hover:bg-orange-100/30 dark:hover:bg-orange-950/20"
                                    : "cursor-pointer hover:bg-green-50/50 dark:hover:bg-green-950/10"
                              }`}
                              style={{
                                top: `${i * 64}px`,
                                height: "64px",
                              }}
                              onClick={() => {
                                if (!slotInPast && user) {
                                  handleSlotClick(
                                    day,
                                    `${hour.toString().padStart(2, "0")}:00`,
                                  );
                                }
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* MOBILE CALENDAR */}
            <div className="md:hidden border-t border-l">
              <div className="flex">
                {/* Fixed Time Column */}
                <div className="w-20 flex-shrink-0 border-r bg-muted/30 sticky left-0 z-30">
                  <div className="h-12 border-b bg-muted/50 sticky top-0"></div>

                  {Array.from({ length: 17 }, (_, i) => {
                    const hour = 7 + i;
                    const isLunchHour = hour === 12;
                    return (
                      <div
                        key={hour}
                        className={`h-16 border-b border-dashed border-muted-foreground/20 relative ${
                          isLunchHour
                            ? "bg-orange-50/30 dark:bg-orange-950/10"
                            : ""
                        }`}
                      >
                        <div className="absolute left-1 top-0 text-xs text-muted-foreground font-medium whitespace-nowrap pr-2">
                          {hour <= 12
                            ? `${hour === 0 ? 12 : hour}:00`
                            : `${hour - 12}:00`}
                          {hour >= 12 ? " PM" : " AM"}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Scrollable Days */}
                <div className="flex-1 overflow-x-auto touch-auto">
                  <div className="flex min-w-[900px] sm:min-w-[1050px]">
                    {weekDays.map((day) => {
                      // Get all events for this day (filter out cancelled if not showing)
                      const dayEvents = effectiveTimetable.filter((slot) => {
                        const slotStart = parseISO(slot.start_time);
                        const isSameDay =
                          slotStart.getFullYear() === day.getFullYear() &&
                          slotStart.getMonth() === day.getMonth() &&
                          slotStart.getDate() === day.getDate();

                        // Filter out cancelled slots if not showing them
                        if (!showCancelled && slot.is_cancelled) {
                          return false;
                        }

                        return isSameDay;
                      });

                      // Group overlapping events together (transitive closure)
                      const eventGroups: (typeof dayEvents)[] = [];
                      const processed = new Set<string>();

                      dayEvents.forEach((slot) => {
                        if (processed.has(slot.slot_id)) return;

                        const slotStart = parseISO(slot.start_time);
                        const slotEnd = parseISO(slot.end_time);
                        const group: typeof dayEvents = [slot];
                        processed.add(slot.slot_id);

                        // Find all events that overlap with any event in this group
                        let foundNew = true;
                        while (foundNew) {
                          foundNew = false;
                          dayEvents.forEach((otherSlot) => {
                            if (processed.has(otherSlot.slot_id)) return;

                            const otherStart = parseISO(otherSlot.start_time);
                            const otherEnd = parseISO(otherSlot.end_time);

                            // Check if this event overlaps with any event in the current group
                            const overlaps = group.some((groupSlot) => {
                              const groupStart = parseISO(groupSlot.start_time);
                              const groupEnd = parseISO(groupSlot.end_time);
                              return (
                                otherStart < groupEnd && otherEnd > groupStart
                              );
                            });

                            if (overlaps) {
                              group.push(otherSlot);
                              processed.add(otherSlot.slot_id);
                              foundNew = true;
                            }
                          });
                        }

                        // Sort group by start time
                        group.sort((a, b) => {
                          const aStart = parseISO(a.start_time).getTime();
                          const bStart = parseISO(b.start_time).getTime();
                          return aStart - bStart;
                        });

                        eventGroups.push(group);
                      });

                      // Calculate positions for overlapping events
                      const eventsWithPositions = dayEvents.map((slot) => {
                        const slotStart = parseISO(slot.start_time);
                        const slotEnd = parseISO(slot.end_time);

                        // Calculate position from top (7:00 AM = 0)
                        const startHour = slotStart.getHours();
                        const startMinute = slotStart.getMinutes();
                        const startPosition =
                          (startHour - 7) * 64 + (startMinute / 60) * 64;

                        // Calculate height based on duration
                        const durationMinutes =
                          (slotEnd.getTime() - slotStart.getTime()) /
                          (1000 * 60);
                        const height = (durationMinutes / 60) * 64;

                        // Find which group this slot belongs to
                        const group = eventGroups.find((g) =>
                          g.some((e) => e.slot_id === slot.slot_id),
                        ) || [slot];

                        const overlapIndex = group.findIndex(
                          (e) => e.slot_id === slot.slot_id,
                        );
                        const overlapCount = group.length;

                        // Calculate width and position for side-by-side display
                        const widthPercent =
                          overlapCount > 1 ? 100 / overlapCount : 100;
                        const leftPercent =
                          overlapCount > 1 ? overlapIndex * widthPercent : 0;

                        // Check if slot is in the past
                        const now = new Date();
                        const isPast = slotEnd < now;

                        // Check if it's lunch time (12:30-1:30)
                        const isLunchTime =
                          (startHour === 12 && startMinute === 30) ||
                          (startHour === 13 && startMinute === 30);

                        // Determine slot type and permissions
                        const isTemplate = slot.slot_type === "template";
                        const isCancelled = slot.is_cancelled === true;
                        const isBooking = slot.slot_type === "booking";
                        const isUserSlot =
                          (isBooking &&
                            slot.booking_id &&
                            bookings.find((b) => b.id === slot.booking_id)
                              ?.teacher_id === user?.id) ||
                          (isTemplate &&
                            slot.teacher_name &&
                            userProfile?.full_name &&
                            slot.teacher_name.toLowerCase() ===
                              userProfile.full_name.toLowerCase());

                        return {
                          ...slot,
                          startPosition,
                          height,
                          isTemplate,
                          isCancelled,
                          isBooking,
                          isUserSlot,
                          isPast,
                          isLunchTime,
                          widthPercent,
                          leftPercent,
                        };
                      });

                      return (
                        <div
                          key={day.toISOString()}
                          className="w-[130px] sm:w-[150px] border-r relative"
                        >
                          {/* Day header */}
                          <div className="h-12 border-b bg-muted/50 p-2 text-center sticky top-0 z-20">
                            <div className="font-bold text-xs">
                              {format(day, "EEE")}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(day, "MMM d")}
                            </div>
                          </div>

                          {/* Day timeline container */}
                          <div
                            className="relative"
                            style={{ height: "1088px" }}
                          >
                            {/* Hour lines */}
                            {Array.from({ length: 17 }, (_, i) => (
                              <div
                                key={i}
                                className="absolute left-0 right-0 border-b border-dashed border-muted-foreground/10"
                                style={{ top: `${i * 64}px` }}
                              />
                            ))}

                            {/* Events */}
                            {eventsWithPositions.map((event) => (
                              <div
                                key={`${event.slot_id}-${event.start_time}`}
                                className={`absolute rounded-md border p-1.5 sm:p-2 cursor-pointer transition-all hover:shadow-md z-20 overflow-hidden ${
                                  event.isCancelled
                                    ? showCancelled
                                      ? "bg-yellow-50/30 dark:bg-yellow-900/10 text-yellow-700/70 dark:text-yellow-300/70 border-yellow-200/50 dark:border-yellow-800/50 border-dashed opacity-50"
                                      : "hidden"
                                    : event.isPast
                                      ? "bg-gray-200/50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-500 border-gray-300 dark:border-gray-700 opacity-60"
                                      : event.isLunchTime
                                        ? "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-200 dark:border-orange-700"
                                        : event.isTemplate
                                          ? "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-700"
                                          : event.isBooking
                                            ? event.isUserSlot
                                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-700"
                                              : "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
                                            : "bg-gray-100 dark:bg-gray-800"
                                }`}
                                style={{
                                  top: `${event.startPosition}px`,
                                  height: `${Math.max(event.height, 56)}px`,
                                  minHeight: "56px",
                                  left: `${event.leftPercent}%`,

                                  width: `${event.widthPercent * 0.95}%`,

                                  marginLeft:
                                    event.leftPercent === 0 ? "4px" : "0",

                                  marginRight:
                                    event.leftPercent + event.widthPercent >=
                                    100
                                      ? "4px"
                                      : "2px",
                                }}
                                onClick={() => {
                                  if (event.isCancelled) {
                                    handleSlotClick(
                                      day,
                                      format(
                                        parseISO(event.start_time),
                                        "HH:mm",
                                      ),
                                    );
                                    return;
                                  }
                                  if (event.isBooking && event.booking_id) {
                                    const booking = bookings.find(
                                      (b) => b.id === event.booking_id,
                                    );
                                    if (booking) {
                                      handleBookingClick(booking);
                                      return;
                                    }
                                  }
                                  // Open sidebar for templates (both user and non-user)
                                  if (event.isTemplate) {
                                    const weekStartForException = startOfWeek(
                                      day,
                                      {
                                        weekStartsOn: 1,
                                      },
                                    );
                                    setActiveTemplate({
                                      slot: event,
                                      weekStart: weekStartForException,
                                    });
                                    setDetailsOpen(true);
                                    return;
                                  }
                                }}
                              >
                                <div className="h-full flex flex-col overflow-hidden gap-0.5">
                                  <div
                                    className="text-xs sm:text-sm font-semibold leading-tight line-clamp-1 flex-shrink-0 truncate"
                                    title={event.title}
                                  >
                                    {event.title}
                                  </div>
                                  <div className="text-[10px] sm:text-xs opacity-80 line-clamp-1 flex-shrink-0 truncate">
                                    {format(
                                      parseISO(event.start_time),
                                      "h:mm a",
                                    )}{" "}
                                    -{" "}
                                    {format(parseISO(event.end_time), "h:mm a")}
                                  </div>
                                  {event.teacher_name && (
                                    <div
                                      className="text-[10px] sm:text-xs opacity-75 line-clamp-1 flex-shrink-0 truncate"
                                      title={event.teacher_name}
                                    >
                                      {event.teacher_name}
                                    </div>
                                  )}
                                  {event.isTemplate && (
                                    <div className="text-[9px] font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300 mt-auto flex-shrink-0">
                                      Template
                                    </div>
                                  )}
                                  {event.isUserSlot && !event.isTemplate && (
                                    <div className="text-[9px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 mt-auto flex-shrink-0">
                                      Manage
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}

                            {/* Clickable empty slots and hour markers */}
                            {Array.from({ length: 17 }, (_, i) => {
                              const hour = 7 + i;
                              const slotTime = new Date(day);
                              slotTime.setHours(hour, 0, 0, 0);
                              const slotInPast = isBefore(slotTime, new Date());
                              // Lunch time is 12:30-1:30, highlight the 12:00-1:00 and 1:00-2:00 slots
                              const isLunchHour = hour === 12 || hour === 13;

                              return (
                                <div
                                  key={hour}
                                  className={`absolute left-0 right-0 transition-colors ${
                                    slotInPast
                                      ? "bg-gray-100/30 dark:bg-gray-800/30 cursor-not-allowed"
                                      : isLunchHour
                                        ? "bg-orange-50/20 dark:bg-orange-950/10 cursor-pointer hover:bg-orange-100/30 dark:hover:bg-orange-950/20"
                                        : "cursor-pointer hover:bg-green-50/50 dark:hover:bg-green-950/10"
                                  }`}
                                  style={{
                                    top: `${i * 64}px`,
                                    height: "64px",
                                  }}
                                  onClick={() => {
                                    if (!slotInPast && user) {
                                      handleSlotClick(
                                        day,
                                        `${hour.toString().padStart(2, "0")}:00`,
                                      );
                                    }
                                  }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4 sm:pt-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-4 text-xs sm:text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-green-100 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded"></div>
              <span>Available</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded"></div>
              <span>Template</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded border-dashed"></div>
              <span>Cancelled</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded"></div>
              <span>Booked</span>
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
          onBookingCreated={() => fetchBookings()}
        />
      )}

      <BookingDetailsSidebar
        booking={activeBooking}
        template={activeTemplate?.slot}
        templateWeekStart={activeTemplate?.weekStart}
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            setActiveBooking(null);
            setActiveTemplate(null);
          }
        }}
        room={selectedRoom}
        currentUserId={user?.id}
        userProfile={userProfile}
        onBookingUpdated={handleBookingUpdated}
        onBookingDeleted={handleBookingDeleted}
        onTemplateCancelled={() => {
          fetchEffectiveTimetable();
          setActiveTemplate(null);
          setDetailsOpen(false);
        }}
      />

      {selectedTemplate && (
        <TemplateExceptionDialog
          open={exceptionDialogOpen}
          onOpenChange={(open) => {
            setExceptionDialogOpen(open);
            if (!open) {
              setSelectedTemplate(null);
            }
          }}
          templateId={selectedTemplate.id}
          templateTitle={selectedTemplate.title}
          weekStart={selectedTemplate.weekStart}
          onExceptionCreated={() => {
            fetchEffectiveTimetable({ silent: true });
          }}
        />
      )}
    </div>
  );
}
