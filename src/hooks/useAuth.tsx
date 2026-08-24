import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import {
  getCurrentUser,
  signIn as signInRequest,
  signUp as signUpRequest,
  signOut as signOutRequest,
  verifyEmail as verifyEmailRequest,
  resendVerification as resendVerificationRequest,
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
  signIn: (email: string, password: string) => Promise<{ error: ApiError | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<{ error: ApiError | null; requiresVerification: boolean; email: string }>;
  verifyEmail: (email: string, code: string) => Promise<{ error: ApiError | null }>;
  resendVerification: (email: string) => Promise<{ error: ApiError | null }>;
  completeOAuthLogin: () => Promise<{ error: ApiError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null, requiresVerification: false, email: "" }),
  verifyEmail: async () => ({ error: null }),
  resendVerification: async () => ({ error: null }),
  completeOAuthLogin: async () => ({ error: null }),
  signOut: async () => {},
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
    setStored(getCurrentUser());
    setLoading(false);
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await signInRequest(email, password);
    if (!error) setStored(getCurrentUser());
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error, requiresVerification, email: verifiedEmail } = await signUpRequest(email, password, fullName);
    // No session is created here — requiresVerification is always true on
    // success, so there's nothing to refresh from localStorage yet.
    return { error, requiresVerification, email: verifiedEmail };
  };

  const verifyEmail = async (email: string, code: string) => {
    const { error } = await verifyEmailRequest(email, code);
    if (!error) setStored(getCurrentUser());
    return { error };
  };

  const resendVerification = async (email: string) => {
    return resendVerificationRequest(email);
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

  return (
    <AuthContext.Provider
      value={{
        user: toAuthUser(stored),
        isAdmin: stored?.is_admin ?? false,
        loading,
        signIn,
        signUp,
        verifyEmail,
        resendVerification,
        completeOAuthLogin,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
