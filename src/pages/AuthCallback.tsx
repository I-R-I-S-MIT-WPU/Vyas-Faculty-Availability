import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { completeOAuthLogin } = useAuth();
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    completeOAuthLogin().then(({ error }) => {
      if (error) {
        navigate("/auth?error=session_failed", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    });
  }, [completeOAuthLogin, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-secondary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Signing you in…</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center">Just a moment.</p>
        </CardContent>
      </Card>
    </div>
  );
}
