import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Booking, Building, Floor, Room } from "@/types/database";
import {
  addHours,
  endOfDay,
  format,
  isAfter,
  isBefore,
  setHours,
  setMinutes,
  startOfDay,
} from "date-fns";
import {
  Clock,
  CalendarDays,
  Search,
  MapPin,
  Users,
  Building2,
} from "lucide-react";

type Preset = "now" | "+1h" | "+2h" | "custom";

interface RoomWithFloor extends Room {
  floor: Floor & {
    building: Building;
  };
}

interface FreeRoomsProps {
  classOnly?: boolean; // if true, filter to classroom type
  onRoomSelect?: (room: RoomWithFloor) => void; // callback to select a room
  compactTrigger?: boolean; // if true, render only a small trigger button + dialog
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

function isRoomFree(
  bookingsByRoom: Record<string, Booking[]>,
  roomId: string,
  start: Date,
  end: Date,
) {
  const list = bookingsByRoom[roomId] || [];
  for (const b of list) {
    const bs = new Date(b.start_time);
    const be = new Date(b.end_time);
    if (overlaps(start, end, bs, be)) return false;
  }
  return true;
}

export default function FreeRooms({
  classOnly = true,
  onRoomSelect,
  compactTrigger = false,
}: FreeRoomsProps) {
  const [rooms, setRooms] = useState<RoomWithFloor[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [preset, setPreset] = useState<Preset>("now");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [filterRoomType, setFilterRoomType] = useState<string>("any");
  const [filterMinCapacity, setFilterMinCapacity] = useState<string>("any");

  // Load buildings, rooms and today's bookings in one go
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        // Load buildings
        const buildingsQuery = supabase
          .from("buildings")
          .select("*")
          .eq("is_active", true)
          .order("name");

        const roomsQuery = supabase
          .from("rooms")
          .select(
            `
            *,
            floor:floors(
              *,
              building:buildings(*)
            )
          `,
          )
          .eq("is_active", true)
          .order("name");

        const start = startOfDay(new Date()).toISOString();
        const end = endOfDay(new Date()).toISOString();
        const bookingsQuery = supabase
          .from("bookings")
          .select("*")
          .eq("status", "confirmed")
          .gte("start_time", start)
          .lte("end_time", end);

        const [buildingsRes, roomsRes, bookingsRes] = await Promise.all([
          buildingsQuery,
          roomsQuery,
          bookingsQuery,
        ]);

        if (buildingsRes.error) {
          console.error("Buildings error:", buildingsRes.error);
          throw buildingsRes.error;
        }
        if (roomsRes.error) {
          console.error("Rooms error:", roomsRes.error);
          throw roomsRes.error;
        }
        if (bookingsRes.error) {
          console.error("Bookings error:", bookingsRes.error);
          throw bookingsRes.error;
        }

        setBuildings(buildingsRes.data || []);

        // Set default building if none selected
        if (
          buildingsRes.data &&
          buildingsRes.data.length > 0 &&
          !selectedBuilding
        ) {
          setSelectedBuilding(buildingsRes.data[0].id);
        }

        const roomsWithFloorData = roomsRes.data as Array<
          Room & { floor: Floor & { building: Building } }
        >;
        const flattened: RoomWithFloor[] = roomsWithFloorData.map((r) => ({
          ...r,
          floor: r.floor,
        }));

        console.log("Fetched rooms:", flattened);
        console.log("Fetched bookings:", bookingsRes.data);

        // Temporarily show all rooms for debugging
        setRooms(flattened);
        console.log(
          "All room types found:",
          flattened.map((r) => r.room_type),
        );
        setBookings(bookingsRes.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [classOnly, selectedBuilding]);

  // Filter rooms by selected building
  const filteredRooms = useMemo(() => {
    if (!selectedBuilding) return rooms;
    return rooms.filter((room) => room.floor.building.id === selectedBuilding);
  }, [rooms, selectedBuilding]);

  const bookingsByRoom = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    for (const b of bookings) {
      if (!map[b.room_id]) map[b.room_id] = [];
      map[b.room_id].push(b);
    }
    return map;
  }, [bookings]);

  // Compute window for preset/custom
  const { windowStart, windowEnd } = useMemo(() => {
    const now = new Date();
    if (preset === "now")
      return { windowStart: now, windowEnd: addHours(now, 1) };
    if (preset === "+1h")
      return { windowStart: addHours(now, 1), windowEnd: addHours(now, 2) };
    if (preset === "+2h")
      return { windowStart: addHours(now, 2), windowEnd: addHours(now, 3) };
    // custom
    const s = customStart ? new Date(customStart) : now;
    const e = customEnd ? new Date(customEnd) : addHours(s, 1);
    return { windowStart: s, windowEnd: e };
  }, [preset, customStart, customEnd]);

  const typeMatches = (room: RoomWithFloor) =>
    filterRoomType === "any" || room.room_type === filterRoomType;
  const capacityMatches = (room: RoomWithFloor) =>
    filterMinCapacity === "any" ||
    (room.capacity || 0) >= parseInt(filterMinCapacity);

  const freeRoomsInWindow = useMemo(() => {
    return filteredRooms
      .filter((r) => filterRoomType === "any" || r.room_type === filterRoomType)
      .filter(
        (r) =>
          filterMinCapacity === "any" ||
          (r.capacity || 0) >= parseInt(filterMinCapacity),
      )
      .filter((r) => isRoomFree(bookingsByRoom, r.id, windowStart, windowEnd));
  }, [
    filteredRooms,
    bookingsByRoom,
    windowStart,
    windowEnd,
    filterRoomType,
    filterMinCapacity,
  ]);

  // Get all free rooms from current time onwards for the dialog
  const getFreeRoomsFromNow = useMemo(() => {
    const now = new Date();
    const endOfToday = endOfDay(now);
    const hourlySlots: Array<{ hour: string; rooms: RoomWithFloor[] }> = [];

    // Generate hourly slots from current time to end of day
    // Use the same time format as the calendar (e.g., "2:30-3:30")
    let currentHour = new Date(now);

    // Round to the nearest 30-minute slot
    const minutes = currentHour.getMinutes();
    if (minutes < 30) {
      currentHour.setMinutes(30, 0, 0);
    } else {
      currentHour.setMinutes(0, 0, 0);
      currentHour.setHours(currentHour.getHours() + 1);
    }

    while (currentHour < endOfToday) {
      const nextHour = new Date(currentHour);
      nextHour.setHours(nextHour.getHours() + 1);

      // Find rooms free in this hour, applying filters
      const freeRoomsInHour = filteredRooms
        .filter(
          (room) =>
            filterRoomType === "any" || room.room_type === filterRoomType,
        )
        .filter(
          (room) =>
            filterMinCapacity === "any" ||
            (room.capacity || 0) >= parseInt(filterMinCapacity),
        )
        .filter((room) =>
          isRoomFree(bookingsByRoom, room.id, currentHour, nextHour),
        );

      if (freeRoomsInHour.length > 0) {
        // Format time like the calendar: "2:30-3:30"
        const startTime = format(currentHour, "h:mm");
        const endTime = format(nextHour, "h:mm");
        hourlySlots.push({
          hour: `${startTime}-${endTime}`,
          rooms: freeRoomsInHour,
        });
      }

      currentHour = nextHour;
    }

    return hourlySlots;
  }, [filteredRooms, bookingsByRoom]);

  const scrollToTopIfMobile = () => {
    if (typeof window === "undefined") return;

    // Tailwind md = 768px
    if (window.innerWidth < 768) {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  };

  const handleRoomClick = (room: RoomWithFloor) => {
    setDialogOpen(false);
    // Use the onRoomSelect callback to select the room
    if (onRoomSelect) {
      onRoomSelect(room);
    }
    scrollToTopIfMobile();
  };

  if (compactTrigger) {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Search className="h-4 w-4 mr-2" />
            Find Free Rooms
          </Button>
        </DialogTrigger>

        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] rounded-2xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="flex items-center space-x-2 text-lg sm:text-xl">
              <Clock className="h-5 w-5 text-blue-600" />
              <span>Free Rooms by Hour</span>
            </DialogTitle>
            <DialogDescription className="text-sm">
              Showing all rooms that are free in each time slot from now until
              end of day
            </DialogDescription>
          </DialogHeader>
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Building</label>
              <Select
                value={selectedBuilding}
                onValueChange={setSelectedBuilding}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Any" />
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
              <label className="text-xs font-medium">Room type</label>
              <Select value={filterRoomType} onValueChange={setFilterRoomType}>
                <SelectTrigger className="h-9">
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
              <Select
                value={filterMinCapacity}
                onValueChange={setFilterMinCapacity}
              >
                <SelectTrigger className="h-9">
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
          <div className="space-y-3">
            {getFreeRoomsFromNow.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  No free rooms available for the rest of the day
                </p>
              </div>
            ) : (
              getFreeRoomsFromNow.map(({ hour, rooms }) => (
                <div
                  key={hour}
                  className="flex flex-col p-3 sm:p-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <div>
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {hour}
                      </h3>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        {rooms.length} room{rooms.length !== 1 ? "s" : ""}{" "}
                        available
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rooms.slice(0, 3).map((room) => (
                      <div
                        key={room.id}
                        className="px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors cursor-pointer group"
                        onClick={() => handleRoomClick(room)}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 space-y-1 sm:space-y-0">
                          <span className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-300 group-hover:text-blue-800 dark:group-hover:text-blue-200">
                            {room.name}
                          </span>
                          <div className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400">
                            <Building2 className="h-3 w-3" />
                            <span className="hidden sm:inline">
                              {room.floor.building.name}
                            </span>
                            <span className="sm:hidden">
                              {room.floor.building.name.split(" ")[0]}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400">
                            <MapPin className="h-3 w-3" />
                            <span>{room.floor.name}</span>
                          </div>
                          <div className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400">
                            <Users className="h-3 w-3" />
                            <span>{room.capacity || "N/A"}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {rooms.length > 3 && (
                      <div className="px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs sm:text-sm font-medium">
                        +{rooms.length - 3} more rooms
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Card className="shadow-lg border-0 bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 overflow-hidden">
      <CardHeader className="pb-6 bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-700 dark:to-indigo-700 text-white">
        <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xl font-bold">
          {/* Left section */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm shrink-0">
              <Clock className="h-6 w-6" />
            </div>
            <span>Find Free Rooms</span>
          </div>

          {/* Right section */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <Button
              size="sm"
              onClick={() => setDialogOpen(true)}
              className="bg-white/20 hover:bg-white/30 text-white border-white/30 backdrop-blur-sm"
            >
              <Search className="h-4 w-4 mr-2" />
              Find All Free
            </Button>

            <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <DialogHeader className="mb-4">
                <DialogTitle className="flex items-center space-x-2 text-lg sm:text-xl">
                  <Clock className="h-5 w-5 text-blue-600" />
                  <span>Free Rooms by Hour</span>
                </DialogTitle>
                <DialogDescription className="text-sm">
                  Showing all rooms that are free in each time slot from now
                  until end of day
                </DialogDescription>
              </DialogHeader>
              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Building</label>
                  <Select
                    value={selectedBuilding}
                    onValueChange={setSelectedBuilding}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Any" />
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
                  <label className="text-xs font-medium">Room type</label>
                  <Select
                    value={filterRoomType}
                    onValueChange={setFilterRoomType}
                  >
                    <SelectTrigger className="h-9">
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
                  <Select
                    value={filterMinCapacity}
                    onValueChange={setFilterMinCapacity}
                  >
                    <SelectTrigger className="h-9">
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
              <div className="space-y-3">
                {getFreeRoomsFromNow.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                      No free rooms available for the rest of the day
                    </p>
                  </div>
                ) : (
                  getFreeRoomsFromNow.map(({ hour, rooms }) => (
                    <div
                      key={hour}
                      className="flex flex-col p-3 sm:p-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex items-center space-x-3 mb-3">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <div>
                          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {hour}
                          </h3>
                          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                            {rooms.length} room{rooms.length !== 1 ? "s" : ""}{" "}
                            available
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {rooms.slice(0, 3).map((room) => (
                          <div
                            key={room.id}
                            className="px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors cursor-pointer group"
                            onClick={() => handleRoomClick(room)}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 space-y-1 sm:space-y-0">
                              <span className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-300 group-hover:text-blue-800 dark:group-hover:text-blue-200">
                                {room.name}
                              </span>
                              <div className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400">
                                <Building2 className="h-3 w-3" />
                                <span className="hidden sm:inline">
                                  {room.floor.building.name}
                                </span>
                                <span className="sm:hidden">
                                  {room.floor.building.name.split(" ")[0]}
                                </span>
                              </div>
                              <div className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400">
                                <MapPin className="h-3 w-3" />
                                <span>{room.floor.name}</span>
                              </div>
                              <div className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400">
                                <Users className="h-3 w-3" />
                                <span>{room.capacity || "N/A"}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                        {rooms.length > 3 && (
                          <div className="px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs sm:text-sm font-medium">
                            +{rooms.length - 3} more rooms
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-8 p-6">
        {/* Building Selector */}
        <div className="space-y-4">
          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Select Building
          </label>
          <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
            <SelectTrigger className=" w-[92%]  h-12 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400">
              <SelectValue placeholder="Select a building" />
            </SelectTrigger>
            <SelectContent>
              {buildings.map((building) => (
                <SelectItem key={building.id} value={building.id}>
                  <div className="flex items-center space-x-2">
                    <Building2 className="h-4 w-4" />
                    <span>{building.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Time Preset Buttons */}
        {/* <div className="space-y-4">
          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Quick Time Windows
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button
              variant={preset === "now" ? "default" : "outline"}
              onClick={() => setPreset("now")}
              className="h-12 text-sm font-medium transition-all duration-200"
            >
              Now (1h)
            </Button>
            <Button
              variant={preset === "+1h" ? "default" : "outline"}
              onClick={() => setPreset("+1h")}
              className="h-12 text-sm font-medium transition-all duration-200"
            >
              In 1 hour
            </Button>
            <Button
              variant={preset === "+2h" ? "default" : "outline"}
              onClick={() => setPreset("+2h")}
              className="h-12 text-sm font-medium transition-all duration-200"
            >
              In 2 hours
            </Button>
            <Button
              variant={preset === "custom" ? "default" : "outline"}
              onClick={() => setPreset("custom")}
              className="h-12 text-sm font-medium transition-all duration-200"
            >
              Custom
            </Button>
          </div>
        </div> */}

        {/* Custom Time Input */}
        {preset === "custom" && (
          <div className="p-5 bg-gradient-to-r from-gray-50 to-blue-50 dark:from-gray-800 dark:to-gray-700 rounded-xl border border-gray-200 dark:border-gray-600">
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 block">
              Custom Time Window
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  Start Time
                </label>
                <Input
                  type="datetime-local"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-11 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  End Time
                </label>
                <Input
                  type="datetime-local"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-11 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400"
                />
              </div>
            </div>
          </div>
        )}

        {/* Free Rooms in Window */}
        {/* <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                Free Rooms
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {format(windowStart, "MMM d, h:mm a")} –{" "}
                {format(windowEnd, "h:mm a")}
              </span>
              <Badge
                variant="secondary"
                className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300 font-semibold"
              >
                {freeRoomsInWindow.length} available
              </Badge>
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-3 pr-2">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-3 border-blue-600 border-t-transparent mx-auto"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 font-medium">
                  Loading rooms...
                </p>
              </div>
            ) : freeRoomsInWindow.length === 0 ? (
              <div className="text-center py-12 bg-gradient-to-r from-gray-50 to-blue-50 dark:from-gray-800 dark:to-gray-700 rounded-xl border border-gray-200 dark:border-gray-600">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  No free rooms for this time window
                </p>
              </div>
            ) : (
              freeRoomsInWindow.map((r) => (
                <div
                  key={r.id}
                  className="p-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer group"
                  onClick={() => handleRoomClick(r)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h4 className="font-bold text-gray-900 dark:text-gray-100 text-lg group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {r.name}
                        </h4>
                        <Badge
                          variant="outline"
                          className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 font-semibold"
                        >
                          Classroom
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-6 text-xs text-gray-600 dark:text-gray-400">
                        <div className="flex items-center space-x-2">
                          <Building2 className="h-4 w-4" />
                          <span className="font-medium">{r.floor.building.name}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <MapPin className="h-4 w-4" />
                          <span className="font-medium">{r.floor.name}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Users className="h-4 w-4" />
                          <span className="font-medium">
                            {r.capacity || "N/A"} seats
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div> */}
      </CardContent>
    </Card>
  );
}
