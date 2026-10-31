import { vi } from "vitest";
import { setAccessToken } from "../lib/api";

// Replaces fetch with a tiny router: handlers["POST /api/auth/login"] = (body, req) => [status, json].
// Handlers match on method + path; the query string is in req.query. Unknown routes return 404.
// Every call is recorded in `calls`.
export function installFakeApi(handlers = {}) {
  const calls = [];
  const table = {
    "POST /api/auth/refresh": () => [401, { error: { code: "UNAUTHORIZED", message: "Session expired" } }],
    ...handlers,
  };
  const fetchMock = vi.fn(async (url, init = {}) => {
    const parsed = new URL(url, "http://localhost");
    const path = parsed.pathname;
    const method = (init.method || "GET").toUpperCase();
    const body = init.body ? JSON.parse(init.body) : undefined;
    const req = { path, method, body, query: Object.fromEntries(parsed.searchParams), headers: init.headers || {} };
    calls.push(req);
    const handler = table[`${method} ${path}`];
    const [status, json] = handler ? await handler(body, req) : [404, { error: { code: "NOT_FOUND", message: "Not found" } }];
    return new Response(status === 204 ? null : JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  setAccessToken(null);
  return { calls, set: (key, fn) => (table[key] = fn), fetchMock };
}

export const customer = { id: "u1", name: "Ananya Sharma", email: "ananya@example.com", phone: null, role: "customer", emailVerified: true };
export const admin = { ...customer, id: "u9", name: "Sriram Admin", email: "admin@manushyam.com", role: "admin" };

// A signed-in session restored by the silent refresh on page load.
export function signedInAs(user) {
  return { "POST /api/auth/refresh": () => [200, { user, accessToken: `token-${user.id}` }] };
}
