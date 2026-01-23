import { useState } from "react";
import Header from "@/components/layout/Header";
import RoomCalendar from "@/components/calendar/RoomCalendar";
import RoomSelector from "@/components/selectors/RoomSelector";
import FreeRooms from "@/components/selectors/FreeRooms";
import { Room } from "@/types/database";

const Index = () => {
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header onVyasClick={() => setSelectedRoom(null)} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {selectedRoom ? (
          <div className="flex flex-col md:flex-row flex-1 overflow-hidden gap-4 px-4 py-4">
            {/* Left Sidebar - Room Selector */}
            <div
              className="
              order-2 md:order-1
              w-full md:w-80
              mx-auto md:mx-0
              flex-shrink-0
              border md:border-r
              bg-background
              overflow-y-auto
              rounded-lg
            "
            >
              <div className="p-4 md:sticky md:top-0 flex flex-col items-center md:items-stretch">
                <RoomSelector
                  selectedRoom={selectedRoom}
                  onRoomSelect={setSelectedRoom}
                />
                {/* <div className="mt-6 w-full">
                <FreeRooms onRoomSelect={setSelectedRoom} />
              </div> */}
              </div>
            </div>

            {/* Right Side - Calendar */}
            <div className="order-1 md:order-2 flex-1 overflow-hidden">
              <RoomCalendar
                selectedRoom={selectedRoom}
                onRoomSelect={setSelectedRoom}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden px-4 py-4">
            {/* Full-width discovery/calendar when no room selected */}
            <RoomCalendar
              selectedRoom={selectedRoom}
              onRoomSelect={setSelectedRoom}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
