import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Booking, Room } from "@/types/database";
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
import { Calendar, Clock, MapPin, Trash2, AlertCircle } from "lucide-react";
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

const Dashboard = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("upcoming");

  useEffect(() => {
    if (user) {
      fetchUserBookings();
    }
  }, [user]);

  const fetchUserBookings = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("bookings")
        .select(
          `
          *,
          room:rooms(*),
          profiles:profiles(full_name)
        `
        )
        .eq("teacher_id", user?.id)
        .order("start_time", { ascending: true });

      if (error) throw error;

      setBookings(data || []);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      toast({
        title: "Error",
        description: "Failed to load your bookings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const cancelBooking = async (bookingId: string) => {
    try {
      const { error } = await supabase
        .from("bookings")
        .delete()
        .eq("id", bookingId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Booking cancelled successfully",
      });

      // Refresh bookings
      fetchUserBookings();
    } catch (error) {
      console.error("Error cancelling booking:", error);
      toast({
        title: "Error",
        description: "Failed to cancel booking",
        variant: "destructive",
      });
    }
  };

  const getUpcomingBookings = () => {
    const now = new Date();
    return bookings.filter((booking) => new Date(booking.start_time) > now);
  };

  const getPastBookings = () => {
    const now = new Date();
    return bookings.filter((booking) => new Date(booking.end_time) < now);
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

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto py-6">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Authentication Required</h2>
            <p className="text-muted-foreground">
              Please sign in to view your dashboard.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const upcomingBookings = getUpcomingBookings();
  const pastBookings = getPastBookings();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto py-6 space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Your Bookings</h1>
          <p className="text-muted-foreground mt-2">
            Manage and view all your room bookings
          </p>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-6"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upcoming">
              Upcoming ({upcomingBookings.length})
            </TabsTrigger>
            <TabsTrigger value="past">Past ({pastBookings.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
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
            ) : upcomingBookings.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    No upcoming bookings
                  </h3>
                  <p className="text-muted-foreground">
                    You don't have any upcoming room bookings.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {upcomingBookings.map((booking) => (
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
                        <Badge variant={getBookingStatus(booking).variant}>
                          {getBookingStatus(booking).label}
                        </Badge>
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
                              Cancel Booking
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Cancel Booking
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to cancel this booking?
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                Keep Booking
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => cancelBooking(booking.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Cancel Booking
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

          <TabsContent value="past" className="space-y-4">
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
            ) : pastBookings.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    No past bookings
                  </h3>
                  <p className="text-muted-foreground">
                    You don't have any past room bookings.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pastBookings.map((booking) => (
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
                        <Badge variant={getBookingStatus(booking).variant}>
                          {getBookingStatus(booking).label}
                        </Badge>
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

export default Dashboard;
