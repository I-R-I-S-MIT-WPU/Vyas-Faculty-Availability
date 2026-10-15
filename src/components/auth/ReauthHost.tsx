import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiClient, ApiError, setReauthHandler } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { CodeInput, CODE_LENGTH } from "@/components/auth/CodeInput";

// Mounted once in App. Destructive/admin actions are refused with REAUTH_REQUIRED
// unless the user entered an emailed code recently; apiClient calls the handler
// registered here, which asks for the code and then lets the original request retry.
export function ReauthHost() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Several requests can ask at once; they all wait on the same prompt.
  const pending = useRef<{ promise: Promise<boolean>; resolve: (ok: boolean) => void } | null>(null);

  const sendCode = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      await apiClient.post("/user/reauth/request");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send a code. Please try again.");
    }
    setSending(false);
  }, []);

  const finish = useCallback((ok: boolean) => {
    pending.current?.resolve(ok);
    pending.current = null;
    setOpen(false);
    setCode("");
    setError(null);
  }, []);

  useEffect(() => {
    setReauthHandler(() => {
      if (pending.current) return pending.current.promise;
      let resolve!: (ok: boolean) => void;
      const promise = new Promise<boolean>((r) => (resolve = r));
      pending.current = { promise, resolve };
      setOpen(true);
      void sendCode();
      return promise;
    });
    return () => setReauthHandler(null);
  }, [sendCode]);

  const submit = async (value: string) => {
    if (value.length !== CODE_LENGTH || checking) return;
    setChecking(true);
    setError(null);
    try {
      await apiClient.post("/user/reauth/verify", { code: value });
      setChecking(false);
      finish(true);
    } catch (err) {
      setChecking(false);
      setCode("");
      setError(err instanceof ApiError ? err.message : "That code didn't work. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && finish(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm it's you</DialogTitle>
          <DialogDescription>
            For your security, enter the {CODE_LENGTH}-digit code we emailed to {user?.email ?? "you"} to continue.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-center">
            <CodeInput value={code} onChange={setCode} onComplete={submit} disabled={checking} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive text-center">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={() => finish(false)}>
              Cancel
            </Button>
            <Button type="button" variant="link" size="sm" onClick={sendCode} disabled={sending || checking}>
              {sending ? "Sending..." : "Send a new code"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
