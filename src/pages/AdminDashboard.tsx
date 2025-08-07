import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Booking, Room, Profile } from "@/types/database";
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
  UserX
} from "lucide-react";
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

const AdminDashboard = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("bookings");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isAdmin, setIsAdmin] = useState(false);

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
      await Promise.all([fetchAllBookings(), fetchAllUsers()]);
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
        profiles:profiles(full_name, email, is_admin)
      `
      )
      .order("start_time", { ascending: false });

    if (error) throw error;
    setBookings(data || []);
  };

  const fetchAllUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    setUsers(data || []);
  };

  const deleteBooking = async (bookingId: string) => {
    try {
      const { error } = await supabase
        .from("bookings")
        .delete()
        .eq("id", bookingId);

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
        description: `User ${!currentStatus ? 'promoted to' : 'removed from'} admin successfully`,
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
      booking.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.room?.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterStatus === "all" || 
      (filterStatus === "upcoming" && getBookingStatus(booking).label === "Upcoming") ||
      (filterStatus === "completed" && getBookingStatus(booking).label === "Completed") ||
      (filterStatus === "in-progress" && getBookingStatus(booking).label === "In Progress");

    return matchesSearch && matchesFilter;
  });

  const filteredUsers = users.filter((user) =>
    user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
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
      <main className="container mx-auto py-6 space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Manage users, bookings, and system settings
          </p>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-6"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="bookings">
              Bookings ({bookings.length})
            </TabsTrigger>
            <TabsTrigger value="users">
              Users ({users.length})
            </TabsTrigger>
          </TabsList>

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
                      : "There are no bookings in the system."
                    }
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
                          {booking.profiles?.is_admin && (
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
                          {booking.profiles?.full_name} ({booking.profiles?.email})
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
                                Are you sure you want to delete this booking? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteBooking(booking.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete Booking
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
                  <h3 className="text-lg font-semibold mb-2">
                    No users found
                  </h3>
                  <p className="text-muted-foreground">
                    {searchTerm 
                      ? "Try adjusting your search criteria."
                      : "There are no users in the system."
                    }
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
                          Department: {userProfile.department || "Not specified"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Joined: {format(parseISO(userProfile.created_at), "MMM dd, yyyy")}
                        </div>
                      </div>

                      <div className="flex justify-end mt-4">
                        <Button
                          variant={userProfile.is_admin ? "outline" : "default"}
                          size="sm"
                          onClick={() => toggleAdminStatus(userProfile.id, userProfile.is_admin)}
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
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
