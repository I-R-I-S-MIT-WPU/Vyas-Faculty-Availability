import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { AlertCircle } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";

interface SignInRequiredProps {
  title?: string;
  message: string;
  icon?: LucideIcon;
  /** Offer the sign-in button (off for "no permission" screens). */
  showSignIn?: boolean;
}

// One signed-out / no-access screen for every protected page.
export function SignInRequired({
  title = "Sign in to continue",
  message,
  icon: Icon = AlertCircle,
  showSignIn = true,
}: SignInRequiredProps) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto flex flex-col items-center py-20 text-center">
        <Icon className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden="true" />
        <h1 className="mb-2 text-2xl font-bold tracking-tight">{title}</h1>
        <p className="max-w-sm text-muted-foreground">{message}</p>
        {showSignIn && (
          <Button asChild className="mt-6">
            <Link to="/auth">Sign in</Link>
          </Button>
        )}
      </main>
    </div>
  );
}
