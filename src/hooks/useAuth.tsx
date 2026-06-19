import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import {
  getCurrentUser,
  signIn as signInRequest,
  signUp as signUpRequest,
  signOut as signOutRequest,
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
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: ApiError | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: ApiError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  token: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
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
    const { error } = await signUpRequest(email, password, fullName);
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
        token: stored?.token ?? null,
        loading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
