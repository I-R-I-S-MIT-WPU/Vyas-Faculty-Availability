import { apiClient, ApiError } from "@/lib/apiClient";
import type { AuthResponse, AuthUser, Profile, RegisterResponse } from "@/types/api";

const STORAGE_KEY = "vyaas_user";

export interface StoredUser {
  id: string;
  full_name: string;
  email: string;
  is_admin: boolean;
}

// Accepts AuthUser (login/verify-email) or the wider Profile (GET /user/me,
// used by completeOAuthLogin) — Profile is a structural superset of AuthUser,
// so its extra fields just ride along into the stored blob unused, same as
// today's behavior.
function storeUser(user: AuthUser | Profile): StoredUser {
  const stored: StoredUser = {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    is_admin: user.is_admin,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  return stored;
}

export const signUp = async (email: string, password: string, fullName: string) => {
  try {
    const data = await apiClient.post<RegisterResponse>("/user/register", {
      full_name: fullName,
      email,
      password,
    });
    // No cookie yet — registration no longer auto-logs in. The caller routes
    // to a verify-email step and calls verifyEmail() to actually get a session.
    return { error: null, requiresVerification: data.requiresVerification, email: data.email };
  } catch (err) {
    return {
      error: err instanceof ApiError ? err : new ApiError("Registration failed", 500),
      requiresVerification: false as const,
      email: "",
    };
  }
};

export const verifyEmail = async (email: string, code: string) => {
  try {
    const data = await apiClient.post<AuthResponse>("/user/verify-email", { email, code });
    storeUser(data.user);
    return { error: null };
  } catch (err) {
    return { error: err instanceof ApiError ? err : new ApiError("Verification failed", 500) };
  }
};

export const resendVerification = async (email: string) => {
  try {
    await apiClient.post("/user/resend-verification", { email });
    return { error: null };
  } catch (err) {
    return { error: err instanceof ApiError ? err : new ApiError("Failed to resend code", 500) };
  }
};

export const signIn = async (email: string, password: string) => {
  try {
    const data = await apiClient.post<AuthResponse>("/user/login", { email, password });
    storeUser(data.user);
    return { error: null };
  } catch (err) {
    return { error: err instanceof ApiError ? err : new ApiError("Sign in failed", 500) };
  }
};

// After a Google redirect back to /auth/callback, the httpOnly session
// cookie is already set (by the backend's googleCallback redirect) but
// localStorage is still empty — unlike signIn/verifyEmail, there's no
// response body to read the user from directly. Confirms + mirrors the
// session into localStorage the same way signIn/verifyEmail already do.
export const completeOAuthLogin = async () => {
  try {
    const data = await apiClient.get<{ success: boolean; user: Profile }>("/user/me");
    storeUser(data.user);
    return { error: null };
  } catch (err) {
    return { error: err instanceof ApiError ? err : new ApiError("Session confirmation failed", 500) };
  }
};

export const signOut = async () => {
  try {
    await apiClient.post("/user/logout");
  } catch {
    // cookie may already be invalid/expired — clear local state regardless
  }
  localStorage.removeItem(STORAGE_KEY);
  return { error: null };
};

export const getCurrentUser = (): StoredUser | null => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
};
