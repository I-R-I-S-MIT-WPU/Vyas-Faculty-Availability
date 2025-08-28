import { useState } from "react";
import Header from "@/components/layout/Header";
import RoomCalendar from "@/components/calendar/RoomCalendar";
import RoomSelector from "@/components/selectors/RoomSelector";
import FreeRooms from "@/components/selectors/FreeRooms";
import { Room } from "@/types/database";

const Index = () => {
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto py-6 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Room Selector */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <RoomSelector
                selectedRoom={selectedRoom}
                onRoomSelect={setSelectedRoom}
              />
              <div className="mt-6">
                <FreeRooms onRoomSelect={setSelectedRoom} />
              </div>
            </div>
          </div>

          {/* Right Side - Calendar */}
          <div className="lg:col-span-3">
            <RoomCalendar selectedRoom={selectedRoom} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
