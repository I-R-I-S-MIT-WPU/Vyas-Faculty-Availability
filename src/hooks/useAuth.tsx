import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import {
  getCurrentUser,
  refreshSession,
  requestCode as requestCodeRequest,
  verifyCode as verifyCodeRequest,
  signOut as signOutRequest,
  signOutEverywhere as signOutEverywhereRequest,
  completeOAuthLogin as completeOAuthLoginRequest,
  StoredUser,
} from "@/lib/auth";
import { ApiError } from "@/lib/apiClient";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAdmin: boolean;
  loading: boolean;
  requestCode: (email: string) => Promise<{ error: ApiError | null }>;
  verifyCode: (email: string, code: string, remember: boolean) => Promise<{ error: ApiError | null }>;
  completeOAuthLogin: () => Promise<{ error: ApiError | null }>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<{ error: ApiError | null }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  loading: true,
  requestCode: async () => ({ error: null }),
  verifyCode: async () => ({ error: null }),
  completeOAuthLogin: async () => ({ error: null }),
  signOut: async () => {},
  signOutEverywhere: async () => ({ error: null }),
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

function toAuthUser(stored: StoredUser | null): AuthUser | null {
  if (!stored) return null;
  return { id: stored.id, email: stored.email, full_name: stored.full_name };
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [stored, setStored] = useState<StoredUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Show the cached user at once, but don't trust it: confirm with the server
    // so an expired/revoked session is noticed now, not on the next failed request.
    const cached = getCurrentUser();
    setStored(cached);
    if (!cached) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    refreshSession().then((fresh) => {
      if (cancelled) return;
      setStored(fresh);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const verifyCode = async (email: string, code: string, remember: boolean) => {
    const { error } = await verifyCodeRequest(email, code, remember);
    if (!error) setStored(getCurrentUser());
    return { error };
  };

  const completeOAuthLogin = async () => {
    const { error } = await completeOAuthLoginRequest();
    if (!error) setStored(getCurrentUser());
    return { error };
  };

  const signOut = async () => {
    await signOutRequest();
    setStored(null);
  };

  const signOutEverywhere = async () => {
    const { error } = await signOutEverywhereRequest();
    if (!error) setStored(null);
    return { error };
  };

  return (
    <AuthContext.Provider
      value={{
        user: toAuthUser(stored),
        isAdmin: stored?.is_admin ?? false,
        loading,
        requestCode: requestCodeRequest,
        verifyCode,
        completeOAuthLogin,
        signOut,
        signOutEverywhere,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
