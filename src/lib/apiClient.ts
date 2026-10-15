export const BASE_URL = import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  status: number;
  details?: string;
  code?: string;

  constructor(message: string, status: number, details?: string, code?: string) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

type RequestOpts = RequestInit & {
  // For the "is my session still valid?" check: a 401 there just means "signed out",
  // not "bounce the user to /auth".
  quiet401?: boolean;
};

// Destructive/admin routes answer 403 REAUTH_REQUIRED until the user confirms a
// fresh emailed code. The app registers a handler (components/auth/ReauthHost)
// that asks for it; if they complete it the original request is retried once.
type ReauthHandler = () => Promise<boolean>;
let reauthHandler: ReauthHandler | null = null;
export const setReauthHandler = (handler: ReauthHandler | null) => {
  reauthHandler = handler;
};

async function request<T>(path: string, options?: RequestOpts, retried = false): Promise<T> {
  const { quiet401, ...init } = options ?? {};
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: "include", // sends the httpOnly session cookie automatically
    headers: { "Content-Type": "application/json", ...init.headers },
  });

  if (res.status === 401) {
    localStorage.removeItem("vyaas_user");
    if (!quiet401 && !window.location.pathname.startsWith("/auth")) {
      window.location.href = "/auth";
    }
    throw new ApiError("Unauthorized", 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 403 && body.code === "REAUTH_REQUIRED" && reauthHandler && !retried) {
      if (await reauthHandler()) return request<T>(path, options, true);
    }
    throw new ApiError(body.message ?? body.error ?? "Request failed", res.status, body.details, body.code);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const apiClient = {
  get: <T>(path: string, opts?: RequestOpts) => request<T>(path, opts),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
