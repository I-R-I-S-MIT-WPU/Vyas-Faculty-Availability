import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Calendar } from "lucide-react";
import { apiClient, BASE_URL } from "@/lib/apiClient";

const RESEND_COOLDOWN_SECONDS = 60;

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  domain_not_allowed: "Sign-in is restricted to @mitwpu.edu.in Google accounts.",
  unverified_account_exists:
    "An account with this email already exists but hasn't verified its email yet. Please complete or reset that registration first.",
  oauth_failed: "Google sign-in failed. Please try again.",
  session_failed: "Couldn't confirm your session. Please try signing in again.",
};

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"auth" | "forgot" | "verify">("auth");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const [verifyEmailAddress, setVerifyEmailAddress] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const { user, signIn, signUp, verifyEmail, resendVerification } = useAuth();
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      await apiClient.post("/user/forgot-password", { email });
      setForgotSuccess(true);
    } catch {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
    setForgotLoading(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      if (error.code === "EMAIL_NOT_VERIFIED") {
        setVerifyEmailAddress(email);
        setVerifyCode("");
        setView("verify");
        await resendVerification(email);
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        toast({
          title: "Verify your email",
          description: "We sent a new verification code to your email.",
        });
      } else {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: "Success",
        description: "Signed in successfully",
      });
      navigate("/");
    }

    setLoading(false);
  };

  const TITLE_REGEX = /^(dr|prof|mr|mrs|ms)(\.|\s)+/i;

  const cleanFirstName = (name: string) => {
    return name.replace(TITLE_REGEX, "").trim();
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const cleanedFirstName = cleanFirstName(firstName);
    const fullName = `${cleanedFirstName} ${lastName.trim()}`.trim();

    const { error, requiresVerification, email: registeredEmail } = await signUp(email, password, fullName);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else if (requiresVerification) {
      setVerifyEmailAddress(registeredEmail);
      setVerifyCode("");
      setResendCooldown(RESEND_COOLDOWN_SECONDS); // registration itself already sent the first code
      setView("verify");
      toast({
        title: "Check your email",
        description: "We sent a 6-digit verification code to your email.",
      });
    }

    setLoading(false);
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyLoading(true);

    const { error } = await verifyEmail(verifyEmailAddress, verifyCode);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Email verified — you're signed in.",
      });
      navigate("/");
    }

    setVerifyLoading(false);
  };

  const handleResendCode = async () => {
    setResendLoading(true);
    await resendVerification(verifyEmailAddress);
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setResendLoading(false);
    toast({
      title: "Code sent",
      description: "If that email has a pending verification, a new code was sent.",
    });
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
          {view === "forgot" ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Reset your password</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Enter your email address and we'll send you a reset link.
                </p>
              </div>
              {forgotSuccess ? (
                <p className="text-sm text-green-600">
                  Check your email for the reset link.
                </p>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="teacher@mitwpu.edu.in"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={forgotLoading}>
                    {forgotLoading ? "Sending..." : "Send Reset Link"}
                  </Button>
                </form>
              )}
              <button
                type="button"
                className="text-sm text-primary underline-offset-4 hover:underline"
                onClick={() => { setView("auth"); setForgotSuccess(false); }}
              >
                Back to Sign In
              </button>
            </div>
          ) : view === "verify" ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Verify your email</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Enter the 6-digit code we sent to {verifyEmailAddress}.
                </p>
              </div>
              <form onSubmit={handleVerifyEmail} className="space-y-4">
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={verifyCode} onChange={setVerifyCode}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button type="submit" className="w-full" disabled={verifyLoading || verifyCode.length !== 6}>
                  {verifyLoading ? "Verifying..." : "Verify Email"}
                </Button>
              </form>
              <button
                type="button"
                className="text-sm text-primary underline-offset-4 hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
                onClick={handleResendCode}
                disabled={resendLoading || resendCooldown > 0}
              >
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : resendLoading
                    ? "Sending..."
                    : "Resend code"}
              </button>
              <div>
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => setView("auth")}
                >
                  Back to Sign In
                </button>
              </div>
            </div>
          ) : (
          <div className="space-y-4">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            {/* ---------- SIGN IN ---------- */}
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="teacher@mitwpu.edu.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <div className="text-right">
                    <button
                      type="button"
                      className="text-sm text-primary underline-offset-4 hover:underline"
                      onClick={() => setView("forgot")}
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing In..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            {/* ---------- SIGN UP ---------- */}
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first-name">First Name</Label>
                    <Input
                      id="first-name"
                      type="text"
                      placeholder="John"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="last-name">Last Name</Label>
                    <Input
                      id="last-name"
                      type="text"
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="teacher@mitwpu.edu.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating Account..." : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
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

                                               
 