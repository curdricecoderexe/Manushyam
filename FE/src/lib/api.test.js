import { describe, it, expect, vi, afterEach } from "vitest";
import { api, ApiError, setAccessToken, setSessionExpiredHandler } from "./api";
import { installFakeApi } from "../test/fakeApi";

afterEach(() => {
  vi.unstubAllGlobals();
  setSessionExpiredHandler(null);
});

describe("api client", () => {
  it("sends the bearer token and cookies", async () => {
    const fake = installFakeApi({ "GET /api/me": () => [200, { user: { id: "1" } }] });
    setAccessToken("abc");
    await api("/api/me");
    expect(fake.calls[0].headers.Authorization).toBe("Bearer abc");
    expect(fake.fetchMock.mock.calls[0][1].credentials).toBe("include");
  });

  it("refreshes once on 401 and retries with the new token", async () => {
    let n = 0;
    const fake = installFakeApi({
      "GET /api/me": (_b, req) => (req.headers.Authorization === "Bearer fresh" ? [200, { ok: true }] : [401, { error: { code: "TOKEN_INVALID" } }]),
      "POST /api/auth/refresh": () => {
        n += 1;
        return [200, { accessToken: "fresh", user: {} }];
      },
    });
    setAccessToken("stale");
    const [a, b] = await Promise.all([api("/api/me"), api("/api/me")]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(n).toBe(1); // concurrent 401s share a single refresh
    expect(fake.calls.filter((c) => c.path === "/api/me")).toHaveLength(4);
  });

  it("signals session expiry when the refresh fails", async () => {
    installFakeApi({ "GET /api/me": () => [401, { error: { code: "TOKEN_INVALID" } }] });
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    setAccessToken("stale");
    await expect(api("/api/me")).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledOnce();
  });

  it("exposes validation errors per field", async () => {
    installFakeApi({ "POST /api/addresses": () => [400, { error: { code: "VALIDATION_ERROR", message: "Some fields are invalid", details: [{ path: "pincode", message: "Bad PIN" }] } }] });
    const err = await api("/api/addresses", { method: "POST", body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.fieldErrors).toEqual({ pincode: "Bad PIN" });
  });

  it("turns network failures into a friendly error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api("/api/me", { auth: false })).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});
