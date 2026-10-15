import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Calendar } from "lucide-react";
import { ApiError, BASE_URL } from "@/lib/apiClient";
import { CodeInput, CODE_LENGTH } from "@/components/auth/CodeInput";

const RESEND_COOLDOWN_SECONDS = 60;

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  domain_not_allowed: "Sign-in is restricted to @mitwpu.edu.in Google accounts.",
  not_allowed: "This email is not on the authorized staff list. Contact the administrator.",
  oauth_failed: "Google sign-in failed. Please try again.",
  session_failed: "Couldn't confirm your session. Please try signing in again.",
};

const requestErrorMessage = (error: ApiError) =>
  error.status === 429
    ? "Too many requests. Please wait a while and try again."
    : error.message;

// One flow for new and returning teachers: email -> emailed code -> signed in.
// (New accounts are only created for emails on the staff list.)
export default function Auth() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const { user, requestCode, verifyCode } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  useEffect(() => {
    const error = searchParams.get("error");
    if (!error) return;
    toast({
      title: "Sign-in error",
      description: OAUTH_ERROR_MESSAGES[error] ?? "Something went wrong. Please try again.",
      variant: "destructive",
    });
    setSearchParams((params) => {
      params.delete("error");
      return params;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleGoogleSignIn = () => {
    window.location.href = `${BASE_URL}/auth/google`;
  };

  const sendCode = async () => {
    setSending(true);
    const { error } = await requestCode(email.trim());
    setSending(false);
    if (error) {
      toast({ title: "Couldn't send a code", description: requestErrorMessage(error), variant: "destructive" });
      return false;
    }
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    return true;
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await sendCode()) {
      setCode("");
      setStep("code");
      toast({
        title: "Check your email",
        description: `If ${email.trim()} can sign in, we've sent a ${CODE_LENGTH}-digit code.`,
      });
    }
  };

  const handleVerify = async (value: string) => {
    if (value.length !== CODE_LENGTH || verifying) return;
    setVerifying(true);
    const { error } = await verifyCode(email.trim(), value, remember);
    setVerifying(false);
    if (error) {
      setCode("");
      toast({
        title: "That code didn't work",
        description: error.status === 429 ? "Too many attempts. Please wait a while and try again." : error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Success", description: "Signed in successfully" });
    navigate("/");
  };

  const handleResend = async () => {
    if (await sendCode()) {
      setCode("");
      toast({ title: "Code sent", description: "We sent a new code. The previous one no longer works." });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-secondary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Calendar className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">Vyaas Room Booking</CardTitle>
          <p className="text-muted-foreground">MIT WPU Teacher Portal</p>
        </CardHeader>

        <CardContent>
          {step === "code" ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Enter your code</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Enter the {CODE_LENGTH}-digit code we sent to {email.trim()}. It works once and expires in 10 minutes.
                </p>
              </div>
              <div className="flex justify-center">
                <CodeInput value={code} onChange={setCode} onComplete={handleVerify} disabled={verifying} />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember-code"
                  checked={remember}
                  onCheckedChange={(v) => setRemember(v === true)}
                />
                <Label htmlFor="remember-code" className="text-sm font-normal">
                  Keep me signed in on this device
                  <span className="block text-xs text-muted-foreground">Uncheck on shared computers.</span>
                </Label>
              </div>
              <Button
                type="button"
                className="w-full"
                disabled={verifying || code.length !== CODE_LENGTH}
                onClick={() => handleVerify(code)}
              >
                {verifying ? "Signing in..." : "Sign In"}
              </Button>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="text-sm text-primary underline-offset-4 hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
                  onClick={handleResend}
                  disabled={sending || resendCooldown > 0}
                >
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : sending ? "Sending..." : "Resend code"}
                </button>
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => { setStep("email"); setCode(""); }}
                >
                  Use a different email
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="teacher@mitwpu.edu.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    We'll email you a code to sign in. No password needed, and it works for first-time sign-up too.
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={sending}>
                  {sending ? "Sending code..." : "Continue with email"}
                </Button>
              </form>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or</span>
                </div>
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignIn}>
                <img src="/google-icon.png" alt="Google" className="h-4 w-4 mr-2" />
                Continue with Google
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
