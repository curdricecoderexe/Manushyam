// API client. The access token lives only in memory (never localStorage, so XSS can't read it from storage);
// the long-lived refresh token is an httpOnly cookie the browser sends to /api/auth/refresh.
export const API_BASE = import.meta.env.VITE_API_URL ?? "";

let accessToken = null;
let refreshPromise = null;
let onSessionExpired = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setSessionExpiredHandler(fn) {
  onSessionExpired = fn;
}

export class ApiError extends Error {
  constructor(status, body) {
    const err = body?.error ?? {};
    super(err.message || "Something went wrong. Please try again.");
    this.name = "ApiError";
    this.status = status;
    this.code = err.code || (status === 0 ? "NETWORK_ERROR" : "UNKNOWN");
    this.details = err.details;
    this.requestId = err.requestId;
  }

  // Map of field path -> message, for showing validation errors next to inputs.
  get fieldErrors() {
    return Object.fromEntries((this.details ?? []).map((d) => [d.path, d.message]));
  }
}

async function rawRequest(path, { method = "GET", body, auth = true, headers: extra, blob = false } = {}) {
  const headers = { Accept: blob ? "*/*" : "application/json", ...extra };
  // FormData (file uploads) sets its own multipart Content-Type with the boundary.
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, { error: { message: "Can’t reach the server. Check your connection and try again." } });
  }
  if (res.status === 204) return { res, data: null };
  if (blob && res.ok) return { res, data: await res.blob() };
  const data = await res.json().catch(() => null);
  return { res, data };
}

// Exchanges the refresh cookie for a new access token. Concurrent callers share one request.
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = rawRequest("/api/auth/refresh", { method: "POST", auth: false })
      .then(({ res, data }) => {
        if (!res.ok) {
          accessToken = null;
          throw new ApiError(res.status, data);
        }
        accessToken = data.accessToken;
        return data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function api(path, options = {}) {
  const { auth = true } = options;
  let { res, data } = await rawRequest(path, options);

  // Expired access token: refresh once and retry the original request.
  if (res.status === 401 && auth && accessToken !== null) {
    try {
      await refreshSession();
    } catch {
      onSessionExpired?.();
      throw new ApiError(401, data);
    }
    ({ res, data } = await rawRequest(path, options));
  }

  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// Downloads an authenticated file (e.g. an invoice PDF) and hands it to the browser to save.
export async function downloadFile(path, filename) {
  const blob = await api(path, { blob: true });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
