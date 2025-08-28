import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Room, Floor, Building } from "@/types/database";
import { toast } from "@/hooks/use-toast";
import {
  Search,
  Filter,
  X,
  Users,
  Building2,
  Monitor,
  Users2,
  Presentation,
  MapPin,
  RotateCcw,
} from "lucide-react";

interface RoomSelectorProps {
  onRoomSelect: (room: Room | null) => void;
  selectedRoom: Room | null;
}

interface FloorWithRooms extends Floor {
  rooms: Room[];
  building: Building;
}

// Room type mapping for better display
const roomTypeLabels = {
  classroom: {
    label: "Lecture Room",
    icon: Building2,
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300",
  },
  lab: {
    label: "Lab",
    icon: Monitor,
    color:
      "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300",
  },
  conference: {
    label: "Conference Room",
    icon: Users2,
    color:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300",
  },
  auditorium: {
    label: "Hall",
    icon: Presentation,
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

// Helper functions
const getRoomTypeLabel = (roomType: string) => {
  return (
    roomTypeLabels[roomType as keyof typeof roomTypeLabels]?.label || roomType
  );
};

const getRoomTypeColor = (roomType: string) => {
  return (
    roomTypeLabels[roomType as keyof typeof roomTypeLabels]?.color ||
    "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300"
  );
};

const getRoomTypeIcon = (roomType: string) => {
  return (
    roomTypeLabels[roomType as keyof typeof roomTypeLabels]?.icon || Building2
  );
};

export default function RoomSelector({
  onRoomSelect,
  selectedRoom,
}: RoomSelectorProps) {
  const [floors, setFloors] = useState<FloorWithRooms[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<string>("");
  const [selectedFloor, setSelectedFloor] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoomType, setSelectedRoomType] = useState<string>("");
  const [selectedCapacity, setSelectedCapacity] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchBuildings();
  }, []);

  useEffect(() => {
    if (selectedBuilding) {
      fetchFloors();
    }
  }, [selectedBuilding]);

  const fetchBuildings = async () => {
    try {
      const { data: buildingsData, error } = await supabase
        .from("buildings")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setBuildings(buildingsData || []);

      // Set default building if available
      if (buildingsData && buildingsData.length > 0) {
        setSelectedBuilding(buildingsData[0].id);
      }
    } catch (error) {
      console.error("Error fetching buildings:", error);
      toast({
        title: "Error",
        description: "Failed to load buildings",
        variant: "destructive",
      });
    }
  };

  const fetchFloors = async () => {
    try {
      const { data: floorsData, error } = await supabase
        .from("floors")
        .select(
          `
          *,
          rooms (*),
          building:buildings(*)
        `
        )
        .eq("building_id", selectedBuilding)
        .order("number");

      if (error) throw error;
      setFloors(floorsData || []);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching floors:", error);
      toast({
        title: "Error",
        description: "Failed to load floors",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const handleFloorSelect = (floorId: string) => {
    setSelectedFloor(floorId);
    onRoomSelect(null); // Clear room selection when floor changes
  };

  const handleRoomSelect = (roomId: string) => {
    const floor = floors.find((f) => f.id === selectedFloor);
    const room = floor?.rooms.find((r) => r.id === roomId);
    onRoomSelect(room || null);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedRoomType("");
    setSelectedCapacity("");
  };

  const getAllRooms = () => {
    return floors.flatMap((floor) =>
      floor.rooms.map((room) => ({ ...room, floor }))
    );
  };

  const getFilteredRooms = () => {
    let allRooms = getAllRooms();

    // Filter by search term (room name or number)
    if (searchTerm) {
      allRooms = allRooms.filter(
        (room) =>
          room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          room.room_type.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by floor if selected
    if (selectedFloor) {
      allRooms = allRooms.filter((room) => room.floor.id === selectedFloor);
    }

    // Filter by room type
    if (selectedRoomType) {
      allRooms = allRooms.filter((room) => room.room_type === selectedRoomType);
    }

    // Filter by capacity
    if (selectedCapacity) {
      const [minCapacity, maxCapacity] = selectedCapacity
        .split("-")
        .map(Number);
      allRooms = allRooms.filter((room) => {
        if (!room.capacity) return false;
        if (maxCapacity) {
          return room.capacity >= minCapacity && room.capacity <= maxCapacity;
        } else {
          return room.capacity >= minCapacity;
        }
      });
    }

    return allRooms;
  };

  const capacityRanges = [
    { value: "1-20", label: "1-20 seats" },
    { value: "21-50", label: "21-50 seats" },
    { value: "51-100", label: "51-100 seats" },
    { value: "101-200", label: "101-200 seats" },
    { value: "201+", label: "201+ seats" },
  ];

  const filteredRooms = getFilteredRooms();
  const hasActiveFilters = searchTerm || selectedRoomType || selectedCapacity;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
            <div className="h-10 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Select Room</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="h-8 w-8 p-0"
          >
            <Filter className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Direct Search Bar */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Search Rooms</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Type room name or number (e.g., Room 101, Lab 2)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Building Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Building</label>
          <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
            <SelectTrigger>
              <SelectValue placeholder="Select a building" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Buildings</SelectItem>
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

        {/* Floor Selection (Optional) */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Floor (Optional)</label>
          <Select value={selectedFloor} onValueChange={handleFloorSelect}>
            <SelectTrigger>
              <SelectValue placeholder="All floors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All floors</SelectItem>
              {floors.map((floor) => (
                <SelectItem key={floor.id} value={floor.id}>
                  <div className="flex items-center space-x-2">
                    <MapPin className="h-4 w-4" />
                    <span>{floor.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filters Section */}
        {showFilters && (
          <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Additional Filters</span>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-6 px-2 text-xs"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>

            {/* Room Type Filter */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Room Type
              </label>
              <Select
                value={selectedRoomType}
                onValueChange={setSelectedRoomType}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {Object.entries(roomTypeLabels).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center space-x-2">
                        <value.icon className="h-4 w-4" />
                        <span>{value.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Capacity Filter */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Capacity
              </label>
              <Select
                value={selectedCapacity}
                onValueChange={setSelectedCapacity}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Any capacity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any capacity</SelectItem>
                  {capacityRanges.map((range) => (
                    <SelectItem key={range.value} value={range.value}>
                      <div className="flex items-center space-x-2">
                        <Users className="h-4 w-4" />
                        <span>{range.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Room Results */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Available Rooms</label>
            {hasActiveFilters && (
              <Badge variant="secondary" className="text-xs">
                {filteredRooms.length} rooms found
              </Badge>
            )}
          </div>

          {filteredRooms.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium mb-1">No rooms found</p>
              <p className="text-xs">
                {searchTerm
                  ? "Try adjusting your search terms or filters"
                  : "Start typing to search for rooms"}
              </p>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="mt-3 h-7 text-xs"
                >
                  Clear all filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredRooms.map((room) => {
                const RoomTypeIcon = getRoomTypeIcon(room.room_type);
                return (
                  <div
                    key={room.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
                      selectedRoom?.id === room.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => onRoomSelect(room)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="font-medium text-sm">{room.name}</h4>
                          <Badge
                            variant="secondary"
                            className={`text-xs ${getRoomTypeColor(
                              room.room_type
                            )}`}
                          >
                            {(() => {
                              const IconComponent = getRoomTypeIcon(
                                room.room_type
                              );
                              return <IconComponent className="h-3 w-3 mr-1" />;
                            })()}
                            {getRoomTypeLabel(room.room_type)}
                          </Badge>
                        </div>
                        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                          <div className="flex items-center space-x-1">
                            <Building2 className="h-3 w-3" />
                            <span>{room.floor.building.name}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <MapPin className="h-3 w-3" />
                            <span>{room.floor.name}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Users className="h-3 w-3" />
                            <span>{room.capacity || "N/A"} seats</span>
                          </div>
                        </div>
                      </div>
                      {selectedRoom?.id === room.id && (
                        <div className="text-primary">
                          <div className="w-2 h-2 bg-primary rounded-full"></div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Room Info */}
        {selectedRoom && (
          <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm">Selected Room</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRoomSelect(null)}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-sm">{selectedRoom.name}</span>
                <Badge
                  variant="secondary"
                  className={`text-xs ${getRoomTypeColor(
                    selectedRoom.room_type
                  )}`}
                >
                  {(() => {
                    const IconComponent = getRoomTypeIcon(
                      selectedRoom.room_type
                    );
                    return <IconComponent className="h-3 w-3 mr-1" />;
                  })()}
                  {getRoomTypeLabel(selectedRoom.room_type)}
                </Badge>
              </div>
              <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                <div className="flex items-center space-x-1">
                  <Building2 className="h-3 w-3" />
                  <span>{selectedRoom.floor.building.name}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <MapPin className="h-3 w-3" />
                  <span>{selectedRoom.floor.name}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Users className="h-3 w-3" />
                  <span>{selectedRoom.capacity || "N/A"} seats</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
