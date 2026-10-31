import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { buildApp, startDb, stopDb } from "./helpers.mjs";

describe("app foundation", () => {
  const app = buildApp();

  beforeAll(startDb);
  afterAll(stopDb);

  it("reports healthy when the database answers", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", checks: { database: "up" } });
  });

  it("sets a server-generated request id and ignores a client-supplied one", async () => {
    const res = await request(app).get("/").set("X-Request-ID", "spoofed");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers["x-request-id"]).not.toBe("spoofed");
  });

  it("returns a JSON 404 with a request id and no stack trace", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js/);
  });

  it("sends security headers and hides the framework", async () => {
    const res = await request(app).get("/");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
  });

  it("allows listed origins and rejects others (CORS fails closed)", async () => {
    const ok = await request(app).get("/").set("Origin", "http://localhost:5173");
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:5173");

    const bad = await request(app).get("/").set("Origin", "https://evil.example");
    expect(bad.status).toBe(403);
    expect(bad.body.error.code).toBe("CORS_NOT_ALLOWED");
  });

  it("rejects MongoDB operator keys in the body and query", async () => {
    const body = await request(app).post("/api/anything").send({ email: { $gt: "" } });
    expect(body.status).toBe(400);
    expect(body.body.error.code).toBe("INVALID_INPUT");

    const query = await request(app).get("/api/anything?$where=1");
    expect(query.status).toBe(400);

    // Express 5's simple query parser never builds nested objects, so bracket syntax stays a plain string key.
    const nested = await request(app).get("/api/anything?filter[$ne]=1");
    expect(nested.status).toBe(404);
  });

  it("rejects oversized and malformed JSON bodies", async () => {
    const big = await request(app)
      .post("/api/anything")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ x: "a".repeat(300 * 1024) }));
    expect(big.status).toBe(413);

    const bad = await request(app).post("/api/anything").set("Content-Type", "application/json").send("{not json");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_JSON");
  });

  it("reports degraded (503) when the database is unreachable", async () => {
    await mongoose.disconnect();
    const res = await request(app).get("/health");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
  });
});

describe("rate limiting", () => {
  it("returns 429 with a JSON error once the global limit is exceeded", async () => {
    const app = buildApp({ GLOBAL_RATE_MAX: "3" });
    for (let i = 0; i < 3; i += 1) await request(app).get("/api/x");
    const res = await request(app).get("/api/x");
    expect(res.status).toBe(429);
    expect(res.body.error).toMatchObject({ code: "RATE_LIMITED", limiter: "global" });
  });
});
