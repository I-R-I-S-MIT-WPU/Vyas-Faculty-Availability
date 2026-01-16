//Vyas-Faculty-Availability\src\components\layout\Header.tsx
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  LogIn,
  LogOut,
  User,
  LayoutDashboard,
  Settings,
  Shield,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";

interface HeaderProps {
  onVyasClick?: () => void;
}

export default function Header({ onVyasClick }: HeaderProps) {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (user) {
      checkAdminStatus();
    }
  }, [user]);

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

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Signed out successfully",
      });
    }
  };

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container flex h-16 items-center justify-between">
        {onVyasClick ? (
          <button
            onClick={onVyasClick}
            className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
          >
            <Calendar className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Vyas Room Booking</h1>
          </button>
        ) : (
        <Link to="/" className="flex items-center space-x-2">
          <Calendar className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Vyas Room Booking</h1>
        </Link>
        )}

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-4">
          <ThemeToggle />

          {!loading && (
            <>
              {user ? (
                <div className="flex items-center space-x-2">
                  <Link to="/dashboard">
                    <Button variant="default" size="sm">
                      <LayoutDashboard className="h-4 w-4 mr-2" />
                      My Bookings
                    </Button>
                  </Link>

                  {isAdmin && (
                    <Link to="/admin">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/20"
                      >
                        <Shield className="h-4 w-4 mr-2" />
                        Admin
                      </Button>
                    </Link>
                  )}

                  <Link to="/settings">
                    <Button variant="ghost" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </Button>
                  </Link>

                  <div className="flex items-center space-x-2 px-3 py-2 rounded-md bg-muted/30">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{user.email}</span>
                    {isAdmin && (
                      <div className="flex items-center">
                        <Shield className="h-4 w-4 text-blue-600" />
                      </div>
                    )}
                  </div>

                  <Button variant="outline" size="sm" onClick={handleSignOut}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              ) : (
                <Link to="/auth">
                  <Button variant="default" size="sm">
                    <LogIn className="h-4 w-4 mr-2" />
                    Sign In
                  </Button>
                </Link>
              )}
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <div className="md:hidden flex items-center space-x-2">
          <ThemeToggle />
          {user ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          ):(
            <Link to="/auth">
                  <Button variant="default" size="sm">
                    <LogIn className="h-4 w-4 mr-2" />
                    Sign In
                  </Button>
                </Link>
          )}
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && user && (
        <div className="md:hidden border-t bg-background/95 backdrop-blur">
          <div className="container py-4 space-y-4">
            <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)} className="block">
              <Button
                variant="default"
                size="sm"
                className="w-full justify-start h-10"
              >
                <LayoutDashboard className="h-4 w-4 mr-2" />
                My Bookings
              </Button>
            </Link>

            {isAdmin && (
              <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="block">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/20 h-10"
                >
                  <Shield className="h-4 w-4 mr-2" />
                  Admin Dashboard
                </Button>
              </Link>
            )}

            <Link to="/settings" onClick={() => setMobileMenuOpen(false)} className="block">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start h-10"
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </Link>

            <div className="flex items-center justify-between px-3 py-3 bg-muted/30 border rounded-lg">
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {user.email}
                </span>
                {isAdmin && (
                  <div className="flex items-center ml-2">
                    <Shield className="h-4 w-4 text-blue-600" />
                  </div>
                )}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                handleSignOut();
                setMobileMenuOpen(false);
              }}
              className="w-full"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
