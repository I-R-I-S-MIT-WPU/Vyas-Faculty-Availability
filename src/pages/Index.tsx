import { useState } from "react";
import Header from "@/components/layout/Header";
import RoomCalendar from "@/components/calendar/RoomCalendar";
import RoomSelector from "@/components/selectors/RoomSelector";
import { Room } from "@/types/database";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Calendar, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const Index = () => {
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto py-6 space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Vyaas Building Room Schedule
          </h1>
          <p className="text-muted-foreground mt-2">
            View and manage room bookings across all floors
          </p>
          {/* <AuthenticatedUserActions /> */}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Room Selector */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <RoomSelector
                selectedRoom={selectedRoom}
                onRoomSelect={setSelectedRoom}
              />
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

// Component to show dashboard link for authenticated users
const AuthenticatedUserActions = () => {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="mt-6">
      <Card className="max-w-md mx-auto">
        <CardHeader className="text-center pb-3">
          <CardTitle className="text-lg">Quick Actions</CardTitle>
          <CardDescription>
            Manage your bookings and preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center items-center gap-4">
          <Link to="/dashboard" className="block">
            <Button variant="default" className="w-full">
              <LayoutDashboard className="h-4 w-4 mr-2" />
              View My Bookings
            </Button>
          </Link>
          <Link to="/settings" className="block">
            <Button variant="outline" className="w-full">
              <Calendar className="h-4 w-4 mr-2" />
              Settings & Preferences
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
