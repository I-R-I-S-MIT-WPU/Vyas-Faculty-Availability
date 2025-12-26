import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Booking, Room, Profile, Floor, Building } from "@/types/database";
import Header from "@/components/layout/Header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calendar,
  Clock,
  MapPin,
  Trash2,
  AlertCircle,
  Users,
  Shield,
  Search,
  Filter,
  UserCheck,
  UserX,
  Building as BuildingIcon,
  Plus,
  Edit,
  Settings,
  FileText,
  Building2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RoomManagementDialog } from "@/components/admin/RoomManagementDialog";
import { FloorManagementDialog } from "@/components/admin/FloorManagementDialog";
import BuildingManagementDialog from "@/components/admin/BuildingManagementDialog";
import { ReportGenerator } from "@/components/admin/ReportGenerator";

const AdminDashboard = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("bookings");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isAdmin, setIsAdmin] = useState(false);

  // Dialog states
  const [roomDialog, setRoomDialog] = useState<{
    open: boolean;
    room?: Room | null;
  }>({ open: false });
  const [floorDialog, setFloorDialog] = useState<{
    open: boolean;
    floor?: Floor | null;
  }>({ open: false });
  const [buildingDialog, setBuildingDialog] = useState<{
    open: boolean;
    building?: Building | null;
  }>({ open: false });

  useEffect(() => {
    if (user) {
      checkAdminStatus();
    }
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  const checkAdminStatus = async () => {
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user?.id)
        .single();

      if (error) throw error;
      setIsAdmin(profile?.is_admin || false);
    } catch (error) {
      console.error("Error checking admin status:", error);
      setIsAdmin(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchAllBookings(),
        fetchAllUsers(),
        fetchAllRooms(),
        fetchAllFloors(),
        fetchAllBuildings(),
      ]);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to load admin data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAllBookings = async () => {
    const { data, error } = await supabase
      .from("bookings")
      .select(
        `
        *,
        room:rooms(*),
        owner:profiles!bookings_teacher_id_fkey(full_name, email, is_admin),
        approver:profiles!bookings_approved_by_fkey(full_name, email)
      `
      )
      .order("start_time", { ascending: false });

    if (error) throw error;
    const list = (data || []) as Booking[];
    setBookings(
      pendingOnly ? list.filter((b) => b.status === "pending") : list
    );
  };

  const approveBooking = async (bookingId: string) => {
    try {
      const { error } = await supabase
        .from("bookings")
        .update({
          status: "confirmed" as any,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        } as any)
        .eq("id", bookingId);
      if (error) throw error;
      toast({
        title: "Approved",
        description: "Booking approved and confirmed.",
      });
      fetchAllBookings();
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to approve booking",
        variant: "destructive",
      });
    }
  };

  const denyBooking = async (bookingId: string) => {
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "denied" as any } as any)
        .eq("id", bookingId);
      if (error) throw error;
      toast({ title: "Denied", description: "Booking request denied." });
      fetchAllBookings();
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to deny booking",
        variant: "destructive",
      });
    }
  };

  const fetchAllUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    setUsers(data || []);
  };

  const fetchAllRooms = async () => {
    const { data, error } = await supabase
      .from("rooms")
      .select(
        `
        *,
        floor:floors(*)
      `
      )
      .order("name", { ascending: true });

    if (error) throw error;
    setRooms((data as any) || []);
  };

  const fetchAllFloors = async () => {
    const { data, error } = await (supabase as any)
      .from("floors")
      .select(
        `
        *,
        building:buildings(*)
      `
      )
      .order("number", { ascending: true });

    if (error) throw error;
    setFloors((data as any) || []);
  };

  const fetchAllBuildings = async () => {
    const { data, error } = await (supabase as any)
      .from("buildings")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;
    setBuildings((data as any) || []);
  };

  const handleBuildingAdded = (building: Building) => {
    setBuildings((prev) => [...prev, building]);
  };

  const deleteBooking = async (booking: Booking) => {
    try {
      if (booking.template_id && booking.generated_for_week) {
        const { error: exceptionError } = await (supabase as any)
          .from("room_timetable_template_exceptions")
          .upsert(
            {
              template_id: booking.template_id,
              week_start_date: booking.generated_for_week,
              resolved_booking_id: booking.id,
              reason: "removed_by_admin",
              created_by: user?.id ?? null,
            },
            { onConflict: "template_id,week_start_date" }
          );

        if (exceptionError) {
          console.warn("Failed to record template exception", exceptionError);
        }
      }

      const { error } = await supabase
        .from("bookings")
        .delete()
        .eq("id", booking.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Booking deleted successfully",
      });

      fetchAllBookings();
    } catch (error) {
      console.error("Error deleting booking:", error);
      toast({
        title: "Error",
        description: "Failed to delete booking",
        variant: "destructive",
      });
    }
  };

  const toggleAdminStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_admin: !currentStatus })
        .eq("id", userId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `User ${
          !currentStatus ? "promoted to" : "removed from"
        } admin successfully`,
      });

      fetchAllUsers();
    } catch (error) {
      console.error("Error updating admin status:", error);
      toast({
        title: "Error",
        description: "Failed to update admin status",
        variant: "destructive",
      });
    }
  };

  const deleteRoom = async (roomId: string) => {
    try {
      // Check if room has any bookings
      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select("id")
        .eq("room_id", roomId)
        .limit(1);

      if (bookingsError) throw bookingsError;

      if (bookings && bookings.length > 0) {
        toast({
          title: "Cannot Delete Room",
          description:
            "This room has existing bookings. Please remove all bookings before deleting the room.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.from("rooms").delete().eq("id", roomId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Room deleted successfully",
      });

      fetchAllRooms();
    } catch (error) {
      console.error("Error deleting room:", error);
      toast({
        title: "Error",
        description: "Failed to delete room",
        variant: "destructive",
      });
    }
  };

  const deleteFloor = async (floorId: string) => {
    try {
      // Check if floor has any rooms
      const { data: rooms, error: roomsError } = await supabase
        .from("rooms")
        .select("id")
        .eq("floor_id", floorId)
        .limit(1);

      if (roomsError) throw roomsError;

      if (rooms && rooms.length > 0) {
        toast({
          title: "Cannot Delete Floor",
          description:
            "This floor has existing rooms. Please remove all rooms before deleting the floor.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from("floors")
        .delete()
        .eq("id", floorId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Floor deleted successfully",
      });

      fetchAllFloors();
    } catch (error) {
      console.error("Error deleting floor:", error);
      toast({
        title: "Error",
        description: "Failed to delete floor",
        variant: "destructive",
      });
    }
  };

  const deleteBuilding = async (buildingId: string) => {
    try {
      const { error } = await (supabase as any)
        .from("buildings")
        .delete()
        .eq("id", buildingId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Building deleted successfully",
      });

      fetchAllBuildings();
    } catch (error) {
      console.error("Error deleting building:", error);
      toast({
        title: "Error",
        description:
          "Failed to delete building. It may have floors associated with it.",
        variant: "destructive",
      });
    }
  };

  const formatDateTime = (dateString: string) => {
    return format(parseISO(dateString), "MMM dd, yyyy 'at' h:mm a");
  };

  const formatTime = (dateString: string) => {
    return format(parseISO(dateString), "h:mm a");
  };

  const getBookingStatus = (booking: Booking) => {
    const now = new Date();
    const startTime = new Date(booking.start_time);
    const endTime = new Date(booking.end_time);

    if (now < startTime) {
      return { label: "Upcoming", variant: "default" as const };
    } else if (now >= startTime && now <= endTime) {
      return { label: "In Progress", variant: "secondary" as const };
    } else {
      return { label: "Completed", variant: "outline" as const };
    }
  };

  const filteredBookings = bookings.filter((booking) => {
    const matchesSearch =
      booking.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.profiles?.full_name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      booking.room?.name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filterStatus === "all" ||
      (filterStatus === "upcoming" &&
        getBookingStatus(booking).label === "Upcoming") ||
      (filterStatus === "completed" &&
        getBookingStatus(booking).label === "Completed") ||
      (filterStatus === "in-progress" &&
        getBookingStatus(booking).label === "In Progress");

    return matchesSearch && matchesFilter;
  });

  const filteredUsers = users.filter(
    (user) =>
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredRooms = rooms.filter(
    (room) =>
      room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.room_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.floor?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredFloors = floors.filter(
    (floor) =>
      floor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      floor.number.toString().includes(searchTerm) ||
      floor.building?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBuildings = buildings.filter((building) =>
    building.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto py-6">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Authentication Required</h2>
            <p className="text-muted-foreground">
              Please sign in to access the admin dashboard.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto py-6">
          <div className="text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">
              You don't have permission to access the admin dashboard.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto py-4 sm:py-6 px-4 sm:px-6 space-y-4 sm:space-y-6">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">
            Manage users, bookings, and system settings
          </p>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4 sm:space-y-6"
        >
          <div className="w-full overflow-x-auto">
            <TabsList className="inline-flex w-auto min-w-full sm:grid sm:w-full sm:grid-cols-5 gap-1 h-auto p-1">
              <TabsTrigger
                value="bookings"
                className="flex items-center gap-2 whitespace-nowrap py-2 px-3 text-xs sm:text-sm"
              >
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">
                  Bookings ({bookings.length})
                </span>
                <span className="sm:hidden">Bookings</span>
              </TabsTrigger>
              <TabsTrigger
                value="users"
                className="flex items-center gap-2 whitespace-nowrap py-2 px-3 text-xs sm:text-sm"
              >
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Users ({users.length})</span>
                <span className="sm:hidden">Users</span>
              </TabsTrigger>
              <TabsTrigger
                value="rooms"
                className="flex items-center gap-2 whitespace-nowrap py-2 px-3 text-xs sm:text-sm"
              >
                <BuildingIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Rooms ({rooms.length})</span>
                <span className="sm:hidden">Rooms</span>
              </TabsTrigger>
              <TabsTrigger
                value="floors"
                className="flex items-center gap-2 whitespace-nowrap py-2 px-3 text-xs sm:text-sm"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">
                  Floors ({floors.length})
                </span>
                <span className="sm:hidden">Floors</span>
              </TabsTrigger>
              <TabsTrigger
                value="buildings"
                className="flex items-center gap-2 whitespace-nowrap py-2 px-3 text-xs sm:text-sm"
              >
                <Building2 className="h-4 w-4" />
                <span className="hidden sm:inline">
                  Buildings ({buildings.length})
                </span>
                <span className="sm:hidden">Buildings</span>
              </TabsTrigger>
              <TabsTrigger
                value="reports"
                className="flex items-center gap-2 whitespace-nowrap py-2 px-3 text-xs sm:text-sm"
              >
                <FileText className="h-4 w-4" />
                Reports
              </TabsTrigger>
            </TabsList>
          </div>

          {activeTab === "bookings" && (
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-muted-foreground">
                Review and manage booking requests
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Show pending only</Label>
                <Switch
                  checked={pendingOnly}
                  onCheckedChange={(v) => {
                    setPendingOnly(v);
                    fetchAllBookings();
                  }}
                />
              </div>
            </div>
          )}

          <TabsContent value="bookings" className="space-y-4">
            {/* Search and Filter */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search bookings..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Bookings</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-4 w-32" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-4 w-full mb-2" />
                      <Skeleton className="h-4 w-3/4" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredBookings.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    No bookings found
                  </h3>
                  <p className="text-muted-foreground">
                    {searchTerm || filterStatus !== "all"
                      ? "Try adjusting your search or filter criteria."
                      : "There are no bookings in the system."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredBookings.map((booking) => (
                  <Card key={booking.id} className="animate-fadeIn">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {booking.title}
                          </CardTitle>
                          <CardDescription className="flex items-center mt-1">
                            <MapPin className="h-4 w-4 mr-1" />
                            {booking.room?.name} • {booking.room?.floor?.name}
                          </CardDescription>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant={getBookingStatus(booking).variant}>
                            {getBookingStatus(booking).label}
                          </Badge>
                          {(booking.profiles as any)?.is_admin && (
                            <Badge variant="secondary">Admin</Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4 mr-2" />
                          {formatDateTime(booking.start_time)}
                        </div>
                        <div className="flex items-center text-sm text-muted-foreground">
                          <Clock className="h-4 w-4 mr-2" />
                          {formatTime(booking.start_time)} -{" "}
                          {formatTime(booking.end_time)}
                        </div>
                        <div className="flex items-center text-sm text-muted-foreground">
                          <Users className="h-4 w-4 mr-2" />
                          {booking.profiles?.full_name} (
                          {booking.profiles?.email})
                        </div>
                        {booking.description && (
                          <p className="text-sm text-muted-foreground mt-2">
                            {booking.description}
                          </p>
                        )}
                        {booking.class_division && (
                          <Badge variant="secondary" className="mt-2">
                            Class: {booking.class_division}
                          </Badge>
                        )}
                      </div>

                      <div className="flex justify-end mt-4">
                        {booking.status === "pending" ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => approveBooking(booking.id)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => denyBooking(booking.id)}
                            >
                              Deny
                            </Button>
                          </div>
                        ) : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="sm">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Booking
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete Booking
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this booking?
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteBooking(booking)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-4 w-32" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-4 w-full mb-2" />
                      <Skeleton className="h-4 w-3/4" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No users found</h3>
                  <p className="text-muted-foreground">
                    {searchTerm
                      ? "Try adjusting your search criteria."
                      : "There are no users in the system."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredUsers.map((userProfile) => (
                  <Card key={userProfile.id} className="animate-fadeIn">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {userProfile.full_name}
                          </CardTitle>
                          <CardDescription className="flex items-center mt-1">
                            {userProfile.email}
                          </CardDescription>
                        </div>
                        <div className="flex items-center space-x-2">
                          {userProfile.is_admin ? (
                            <Badge variant="default" className="bg-blue-600">
                              <Shield className="h-3 w-3 mr-1" />
                              Admin
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <Users className="h-3 w-3 mr-1" />
                              Faculty
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="text-sm text-muted-foreground">
                          Department:{" "}
                          {userProfile.department || "Not specified"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Joined:{" "}
                          {format(
                            parseISO(userProfile.created_at),
                            "MMM dd, yyyy"
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end mt-4">
                        <Button
                          variant={userProfile.is_admin ? "outline" : "default"}
                          size="sm"
                          onClick={() =>
                            toggleAdminStatus(
                              userProfile.id,
                              userProfile.is_admin
                            )
                          }
                          disabled={userProfile.id === user?.id}
                        >
                          {userProfile.is_admin ? (
                            <>
                              <UserX className="h-4 w-4 mr-2" />
                              Remove Admin
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-4 w-4 mr-2" />
                              Make Admin
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="rooms" className="space-y-4">
            {/* Room Actions */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search rooms..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button onClick={() => setRoomDialog({ open: true })}>
                <Plus className="h-4 w-4 mr-2" />
                Add Room
              </Button>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-4 w-32" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-4 w-full mb-2" />
                      <Skeleton className="h-4 w-3/4" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredRooms.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <BuildingIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No rooms found</h3>
                  <p className="text-muted-foreground">
                    {searchTerm
                      ? "Try adjusting your search criteria."
                      : "There are no rooms in the system."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRooms.map((room) => (
                  <Card key={room.id} className="animate-fadeIn">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{room.name}</CardTitle>
                          <CardDescription className="flex items-center mt-1">
                            <MapPin className="h-4 w-4 mr-1" />
                            {room.floor?.name}
                          </CardDescription>
                        </div>
                        <Badge
                          variant={room.is_active ? "default" : "secondary"}
                        >
                          {room.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Type:</span>
                          <Badge variant="outline">
                            {room.room_type === "classroom"
                              ? "Lecture Room"
                              : room.room_type === "lab"
                              ? "Lab"
                              : room.room_type === "conference"
                              ? "Conference Room"
                              : room.room_type === "auditorium"
                              ? "Hall"
                              : room.room_type === "seminar"
                              ? "Seminar Room"
                              : room.room_type === "discussion"
                              ? "Discussion Room"
                              : room.room_type}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Capacity:
                          </span>
                          <span>{room.capacity || "Not specified"}</span>
                        </div>
                        {room.equipment && room.equipment.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-sm text-muted-foreground">
                              Equipment:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {room.equipment.map((eq, index) => (
                                <Badge
                                  key={index}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {eq}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end gap-2 mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRoomDialog({ open: true, room })}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Room</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this room? This
                                action cannot be undone. Any existing bookings
                                for this room will prevent deletion.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteRoom(room.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete Room
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="floors" className="space-y-4">
            {/* Floor Actions */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search floors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button onClick={() => setFloorDialog({ open: true })}>
                <Plus className="h-4 w-4 mr-2" />
                Add Floor
              </Button>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-4 w-32" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-4 w-full mb-2" />
                      <Skeleton className="h-4 w-3/4" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredFloors.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    No floors found
                  </h3>
                  <p className="text-muted-foreground">
                    {searchTerm
                      ? "Try adjusting your search criteria."
                      : "There are no floors in the system."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredFloors.map((floor) => {
                  const roomCount = rooms.filter(
                    (room) => room.floor_id === floor.id
                  ).length;
                  return (
                    <Card key={floor.id} className="animate-fadeIn">
                      <CardHeader>
                        <CardTitle className="text-lg">{floor.name}</CardTitle>
                        <CardDescription className="flex items-center space-x-2">
                          <span>Floor Number: {floor.number}</span>
                          {floor.building && (
                            <>
                              <span>•</span>
                              <span>{floor.building.name}</span>
                            </>
                          )}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              Building:
                            </span>
                            <Badge variant="outline">
                              {floor.building?.name || "No building assigned"}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              Rooms:
                            </span>
                            <Badge variant="outline">{roomCount} rooms</Badge>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              Created:
                            </span>
                            <span>
                              {format(
                                parseISO(floor.created_at),
                                "MMM dd, yyyy"
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setFloorDialog({ open: true, floor })
                            }
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="sm">
                                <Trash2 className="h-4 w-4 mr-1" />
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete Floor
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this floor?
                                  This action cannot be undone. Any existing
                                  rooms on this floor will prevent deletion.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteFloor(floor.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete Floor
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="buildings" className="space-y-4">
            {/* Building Actions */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search buildings..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <BuildingManagementDialog onBuildingAdded={handleBuildingAdded} />
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-4 w-32" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-4 w-full mb-2" />
                      <Skeleton className="h-4 w-3/4" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredBuildings.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    No buildings found
                  </h3>
                  <p className="text-muted-foreground">
                    {searchTerm
                      ? "Try adjusting your search criteria."
                      : "There are no buildings in the system."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredBuildings.map((building) => (
                  <Card key={building.id} className="animate-fadeIn">
                    <CardHeader>
                      <CardTitle className="text-lg">{building.name}</CardTitle>
                      <CardDescription>
                        {building.address || "No address specified"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {building.description && (
                          <p className="text-sm text-muted-foreground">
                            {building.description}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Floors:</span>
                          <Badge variant="outline">
                            {
                              floors.filter(
                                (floor) => floor.building_id === building.id
                              ).length
                            }{" "}
                            floors
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Status:</span>
                          <Badge
                            variant={
                              building.is_active ? "default" : "secondary"
                            }
                          >
                            {building.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Created:
                          </span>
                          <span>
                            {format(
                              parseISO(building.created_at),
                              "MMM dd, yyyy"
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 mt-4">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete Building
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this building?
                                This action cannot be undone. Any existing
                                floors on this building will prevent deletion.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteBuilding(building.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete Building
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <ReportGenerator />
          </TabsContent>
        </Tabs>

        {/* Dialog Components */}
        <RoomManagementDialog
          open={roomDialog.open}
          onOpenChange={(open) =>
            setRoomDialog((prev) => ({ open, room: open ? prev.room : null }))
          }
          room={roomDialog.room}
          onRoomSaved={() => {
            fetchAllRooms();
            setRoomDialog({ open: false, room: null });
          }}
          currentUserId={user?.id ?? null}
        />

        <FloorManagementDialog
          open={floorDialog.open}
          onOpenChange={(open) => setFloorDialog({ open })}
          floor={floorDialog.floor}
          onFloorSaved={() => {
            fetchAllFloors();
            setFloorDialog({ open: false });
          }}
        />

        <BuildingManagementDialog onBuildingAdded={handleBuildingAdded} />
      </main>
    </div>
  );
};

export default AdminDashboard;
