import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Room, Floor } from "@/types/database";
import { toast } from "@/hooks/use-toast";

interface RoomSelectorProps {
  onRoomSelect: (room: Room | null) => void;
  selectedRoom: Room | null;
}

interface FloorWithRooms extends Floor {
  rooms: Room[];
}

export default function RoomSelector({ onRoomSelect, selectedRoom }: RoomSelectorProps) {
  const [floors, setFloors] = useState<FloorWithRooms[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFloors();
  }, []);

  const fetchFloors = async () => {
    try {
      const { data: floorsData, error } = await supabase
        .from('floors')
        .select(`
          *,
          rooms (*)
        `)
        .order('number');

      if (error) throw error;
      setFloors(floorsData || []);
    } catch (error) {
      console.error('Error fetching floors:', error);
      toast({
        title: "Error",
        description: "Failed to load floors and rooms",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFloorSelect = (floorId: string) => {
    setSelectedFloor(floorId);
    onRoomSelect(null); // Clear room selection when floor changes
  };

  const handleRoomSelect = (roomId: string) => {
    const floor = floors.find(f => f.id === selectedFloor);
    const room = floor?.rooms.find(r => r.id === roomId);
    onRoomSelect(room || null);
  };

  const selectedFloorData = floors.find(f => f.id === selectedFloor);

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
        <CardTitle>Select Room</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Floor</label>
          <Select value={selectedFloor} onValueChange={handleFloorSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Select a floor" />
            </SelectTrigger>
            <SelectContent>
              {floors.map((floor) => (
                <SelectItem key={floor.id} value={floor.id}>
                  {floor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedFloorData && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Room</label>
            <Select 
              value={selectedRoom?.id || ""} 
              onValueChange={handleRoomSelect}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a room" />
              </SelectTrigger>
              <SelectContent>
                {selectedFloorData.rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name} ({room.room_type} • {room.capacity} seats)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}