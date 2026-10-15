import { apiClient, ApiError } from "@/lib/apiClient";
import type { AuthResponse, AuthUser, Profile } from "@/types/api";

const STORAGE_KEY = "vyaas_user";

export interface StoredUser {
  id: string;
  full_name: string;
  email: string;
  is_admin: boolean;
}

// Accepts AuthUser (verify-code response) or the wider Profile (GET /user/me,
// used by completeOAuthLogin / refreshSession) — Profile is a structural
// superset of AuthUser, so its extra fields just ride along unused.
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

// Step 1 of sign-in/sign-up (they are the same flow): email a one-time code.
// The server answers identically for new and returning users.
export const requestCode = async (email: string) => {
  try {
    await apiClient.post("/user/otp/request", { email });
    return { error: null };
  } catch (err) {
    return { error: err instanceof ApiError ? err : new ApiError("Could not send a code", 500) };
  }
};

// Step 2: exchange the code for a session (httpOnly cookie). `remember` off = a
// browser-session cookie that also expires after a short idle (shared computers).
export const verifyCode = async (email: string, code: string, remember: boolean) => {
  try {
    const data = await apiClient.post<AuthResponse>("/user/otp/verify", { email, code, remember });
    storeUser(data.user);
    return { error: null };
  } catch (err) {
    return { error: err instanceof ApiError ? err : new ApiError("Verification failed", 500) };
  }
};

// After a Google redirect back to /auth/callback, the httpOnly session
// cookie is already set (by the backend's googleCallback redirect) but
// localStorage is still empty — unlike verifyCode, there's no response body to
// read the user from directly. Confirms + mirrors the session into localStorage.
export const completeOAuthLogin = async () => {
  try {
    const data = await apiClient.get<{ success: boolean; user: Profile }>("/user/me");
    storeUser(data.user);
    return { error: null };
  } catch (err) {
    return { error: err instanceof ApiError ? err : new ApiError("Session confirmation failed", 500) };
  }
};

// localStorage only mirrors who is signed in (for instant rendering); the cookie is
// the real session and can have expired or been revoked. Ask the server on app
// open so the UI never claims a login that is already dead. Returns the user, or
// null if signed out. A network failure keeps the cached user (e.g. offline PWA).
export const refreshSession = async (): Promise<StoredUser | null> => {
  try {
    const data = await apiClient.get<{ success: boolean; user: Profile }>("/user/me", { quiet401: true });
    return storeUser(data.user);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return getCurrentUser();
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

// Revokes every session for this account, not just this browser's. Other
// devices lose access on their next request.
export const signOutEverywhere = async () => {
  try {
    await apiClient.post("/user/logout-all");
  } catch (err) {
    return { error: err instanceof ApiError ? err : new ApiError("Failed to log out everywhere", 500) };
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
