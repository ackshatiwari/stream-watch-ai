// All backend calls go through here. The backend URL comes only from NEXT_PUBLIC_API_URL.
// Nothing secret lives in the frontend: the Gemini and Supabase keys stay on the backend.

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type ValidationIssue = { loc?: (string | number)[]; msg?: string };

function describeValidation(issues: ValidationIssue[]): string {
  return issues
    .slice(0, 5)
    .map((i) => {
      const where = (i.loc ?? []).filter((p) => p !== "body" && p !== "spec").join(" → ");
      const msg = (i.msg ?? "invalid").replace(/^Value error, /, "");
      return where ? `${where}: ${msg}` : msg;
    })
    .join("; ");
}

async function request<T>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  if (!API_URL) {
    throw new ApiError(0, "config", "NEXT_PUBLIC_API_URL is not set, so the app can't reach the backend.");
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", "Can't reach the Stream Watch server. It may be waking up; try again in a moment.");
  }

  if (res.ok) return (await res.json()) as T;

  let code = "error";
  let message = `Request failed (${res.status})`;
  try {
    const data = await res.json();
    const detail = data?.detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      code = detail.code ?? code;
      message = detail.message ?? message;
    } else if (Array.isArray(detail)) {
      code = "invalid";
      message = describeValidation(detail);
    } else if (typeof data?.error === "string") {
      message = data.error;
    }
  } catch {
    // not JSON; keep the generic message
  }
  if (res.status === 429 && code === "error") {
    code = "rate_limited";
    message = "Too many requests. Wait a bit and try again.";
  }
  throw new ApiError(res.status, code, message);
}

export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body: unknown, headers?: Record<string, string>) =>
  request<T>("POST", path, body, headers);
export const apiPut = <T>(path: string, body: unknown, headers?: Record<string, string>) =>
  request<T>("PUT", path, body, headers);
