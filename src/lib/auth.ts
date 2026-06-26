import { apiClient, ApiError } from "@/lib/apiClient";
import type { AuthResponse } from "@/types/api";

const STORAGE_KEY = "vyaas_user";

export interface StoredUser {
  id: string;
  full_name: string;
  email: string;
  is_admin: boolean;
}

function storeUser(data: AuthResponse): StoredUser {
  const stored: StoredUser = { ...data.user };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  return stored;
}

export const signUp = async (email: string, password: string, fullName: string) => {
  try {
    const data = await apiClient.post<AuthResponse>("/user/register", {
      full_name: fullName,
      email,
      password,
    });
    storeUser(data);
    return { error: null };
  } catch (err) {
    return { error: err instanceof ApiError ? err : new ApiError("Registration failed", 500) };
  }
};

export const signIn = async (email: string, password: string) => {
  try {
    const data = await apiClient.post<AuthResponse>("/user/login", { email, password });
    storeUser(data);
    return { error: null };
  } catch (err) {
    return { error: err instanceof ApiError ? err : new ApiError("Sign in failed", 500) };
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
