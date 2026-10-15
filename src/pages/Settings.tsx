import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "next-themes";
import { apiClient, ApiError } from "@/lib/apiClient";
import { Profile } from "@/types/api";
import Header from "@/components/layout/Header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Moon,
  Sun,
  Monitor,
  User,
  Palette,
  Bell,
  Shield,
  Save,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface DeviceSession {
  id: string;
  created_at: string;
  last_seen_at: string;
  user_agent: string | null;
  current: boolean;
}

// "Chrome on Windows" from a user-agent string — enough to recognise a device.
function describeDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

const Settings = () => {
  const { user, signOutEverywhere } = useAuth();
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [bookingReminders, setBookingReminders] = useState(true);

  const [logoutAllLoading, setLogoutAllLoading] = useState(false);
  const [devices, setDevices] = useState<DeviceSession[]>([]);

  useEffect(() => {
    if (user) {
      fetchUserProfile();
      fetchDevices();
    }
  }, [user]);

  const fetchDevices = async () => {
    try {
      const { sessions } = await apiClient.get<{ success: boolean; sessions: DeviceSession[] }>("/user/sessions");
      setDevices(sessions);
    } catch (error) {
      console.error("Error fetching devices:", error);
    }
  };

  const handleRevokeDevice = async (id: string) => {
    try {
      await apiClient.del(`/user/sessions/${id}`);
      setDevices((prev) => prev.filter((d) => d.id !== id));
      toast({ title: "Signed out", description: "That device has been signed out." });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof ApiError ? error.message : "Could not sign out that device",
        variant: "destructive",
      });
    }
  };

  const fetchUserProfile = async () => {
    try {
      setLoading(true);

      const { user: data } = await apiClient.get<{ success: boolean; user: Profile }>("/user/me");

      setProfile(data);
      setFullName(data.full_name || "");
      setDepartment(data.department || "");
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast({
        title: "Error",
        description: "Failed to load your profile",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async () => {
    try {
      setSaving(true);

      const { user: updated } = await apiClient.patch<{ success: boolean; user: Profile }>(
        "/user/me",
        { full_name: fullName, department: department || undefined },
      );
      setProfile(updated);

      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({
        title: "Error",
        description: error instanceof ApiError ? error.message : "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoutEverywhere = async () => {
    setLogoutAllLoading(true);
    const { error } = await signOutEverywhere();
    setLogoutAllLoading(false);
    if (error) {
      toast({
        title: "Error",
        description: "Could not log out of all devices. Please try again.",
        variant: "destructive",
      });
      return;
    }
    // This device's session is revoked too — send them back to sign in.
    window.location.href = "/auth";
  };


  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto py-6 space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage your account preferences and profile
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Profile Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="h-5 w-5 mr-2" />
                Profile Settings
              </CardTitle>
              <CardDescription>
                Update your personal information and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="space-y-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-24" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Enter your full name"
                      maxLength={100}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Select value={department} onValueChange={setDepartment}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select your department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Computer Science">
                          Computer Science
                        </SelectItem>
                        <SelectItem value="Electrical Engineering">
                          Electrical Engineering
                        </SelectItem>
                        <SelectItem value="Mechanical Engineering">
                          Mechanical Engineering
                        </SelectItem>
                        <SelectItem value="Civil Engineering">
                          Civil Engineering
                        </SelectItem>
                        <SelectItem value="Chemical Engineering">
                          Chemical Engineering
                        </SelectItem>
                        <SelectItem value="Mathematics">Mathematics</SelectItem>
                        <SelectItem value="Physics">Physics</SelectItem>
                        <SelectItem value="Chemistry">Chemistry</SelectItem>
                        <SelectItem value="Biology">Biology</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      value={user.email || ""}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">
                      Email cannot be changed. Contact support if needed.
                    </p>
                  </div>

                  <Button
                    onClick={updateProfile}
                    disabled={saving}
                    className="w-full"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Appearance Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Palette className="h-5 w-5 mr-2" />
                Appearance
              </CardTitle>
              <CardDescription>
                Customize the look and feel of the application
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Theme</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant={theme === "light" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme("light")}
                    className="flex items-center"
                  >
                    <Sun className="h-4 w-4 mr-2" />
                    Light
                  </Button>
                  <Button
                    variant={theme === "dark" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme("dark")}
                    className="flex items-center"
                  >
                    <Moon className="h-4 w-4 mr-2" />
                    Dark
                  </Button>
                  <Button
                    variant={theme === "system" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme("system")}
                    className="flex items-center"
                  >
                    <Monitor className="h-4 w-4 mr-2" />
                    System
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Notifications</Label>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        Email Notifications
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Receive booking confirmations and updates via email
                      </p>
                    </div>
                    <Switch
                      checked={emailNotifications}
                      onCheckedChange={setEmailNotifications}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        Booking Reminders
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Get reminded about upcoming bookings
                      </p>
                    </div>
                    <Switch
                      checked={bookingReminders}
                      onCheckedChange={setBookingReminders}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="h-5 w-5 mr-2" />
                Security
              </CardTitle>
              <CardDescription>
                Manage your account security settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Account Status</Label>
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <span className="text-sm text-muted-foreground">Active</span>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Last Sign In</Label>
                <p className="text-sm text-muted-foreground">Not available</p>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Your devices</Label>
                <p className="text-sm text-muted-foreground">
                  You sign in with a code emailed to you — there is no password. These are the
                  devices currently signed in to your account.
                </p>
                {devices.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {describeDevice(d.user_agent)}
                        {d.current && <Badge variant="secondary" className="ml-2">This device</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Active {formatDistanceToNow(new Date(d.last_seen_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!d.current && (
                      <Button variant="outline" size="sm" onClick={() => handleRevokeDevice(d.id)}>
                        Sign out
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={logoutAllLoading}
                  onClick={handleLogoutEverywhere}
                >
                  {logoutAllLoading ? "Logging out..." : "Log Out of All Devices"}
                </Button>
                <p className="text-sm text-muted-foreground">
                  Signs you out everywhere, including this device. Use this if you
                  think someone else has access to your account.
                </p>
              </div>

            </CardContent>
          </Card>

          {/* Notification Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Bell className="h-5 w-5 mr-2" />
                Notifications
              </CardTitle>
              <CardDescription>
                Configure your notification preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">
                      Booking Confirmations
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      When you create a new booking
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">
                      Booking Cancellations
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      When you cancel a booking
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">
                      System Updates
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Important system announcements
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">
                      Marketing Emails
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      News and feature updates
                    </p>
                  </div>
                  <Switch />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Settings;
