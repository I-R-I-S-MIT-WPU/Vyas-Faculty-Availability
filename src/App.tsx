import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ThemeEffect } from "@/components/theme/ThemeEffect";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/AdminDashboard";
import Settings from "./pages/Settings";
import Loader from "./Loader"; // loader import
import "./loader.css"; // import CSS for fade animation

const queryClient = new QueryClient();

const App = () => {
  const [loading, setLoading] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Simulate loading (replace with real API/data if needed)
    const timer = setTimeout(() => {
      setFadeOut(true); // start fade out
      // remove loader after fade duration
      const removeTimer = setTimeout(() => setLoading(false), 500); 
      return () => clearTimeout(removeTimer);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (loading)
    return <Loader fadeOut={fadeOut} />; // pass fadeOut state to loader

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="vyaas-theme">
        <ThemeEffect />
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/Settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
