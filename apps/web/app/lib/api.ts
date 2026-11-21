const BUILD_API = (process.env.NEXT_PUBLIC_API ?? "http://localhost:4100").replace(/\/$/, "");
let overridden = false;

// Resolved once per page load. Order: ?api= override (captured into storage),
// saved override, same-origin /api when the page itself came from elsewhere
// (tunnel URL or hosted), build-time env otherwise. Guests on the tunnel URL
// therefore reach the host API with zero configuration.
function resolveApi(): string {
  if (typeof window !== "undefined") {
    try {
      const q = new URLSearchParams(window.location.search).get("api");
      if (q && /^https?:\/\//.test(q)) {
        window.localStorage.setItem("crewcode_api", q.replace(/\/$/, ""));
        overridden = true;
        return q.replace(/\/$/, "");
      }
      const saved = window.localStorage.getItem("crewcode_api");
      if (saved && /^https?:\/\//.test(saved)) {
        overridden = true;
        return saved.replace(/\/$/, "");
      }
      const host = window.location.hostname;
      if (host !== "localhost" && host !== "127.0.0.1") return "/api";
      // Served by our own server (any port except the Next dev server) → same-origin API.
      const port = window.location.port;
      if (port && port !== "3100") return "/api";
    } catch {}
  }
  return BUILD_API;
}

export const API = resolveApi();
export const BUILD_API_BASE = BUILD_API;
export function isApiOverridden(): boolean {
  return overridden;
}

export function setApiOverride(url: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (url) window.localStorage.setItem("crewcode_api", url.replace(/\/$/, ""));
    else window.localStorage.removeItem("crewcode_api");
  } catch {}
}

let guestCache: string | null | undefined;

export function getGuestToken(): string | null {
  if (typeof window === "undefined") return null;
  if (guestCache === undefined) guestCache = window.localStorage.getItem("crewcode_guest");
  return guestCache ?? null;
}

export function setGuestToken(t: string | null) {
  guestCache = t;
  if (typeof window === "undefined") return;
  if (t) window.localStorage.setItem("crewcode_guest", t);
  else window.localStorage.removeItem("crewcode_guest");
}

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, message: string, body: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getGuestToken();
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(token ? { "x-guest-token": token } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, "api-offline", null);
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = body?.error ?? body?.message ?? (typeof body === "string" ? body : res.statusText);
    throw new ApiError(res.status, String(msg).slice(0, 400), body);
  }
  return body as T;
}

export const get = <T = any>(p: string) => api<T>(p);
export const post = <T = any>(p: string, b?: any) =>
  api<T>(p, { method: "POST", body: b ? JSON.stringify(b) : undefined });
export const patch = <T = any>(p: string, b?: any) =>
  api<T>(p, { method: "PATCH", body: b ? JSON.stringify(b) : undefined });
export const put = <T = any>(p: string, b?: any) =>
  api<T>(p, { method: "PUT", body: b ? JSON.stringify(b) : undefined });
export const del = <T = any>(p: string) => api<T>(p, { method: "DELETE" });
