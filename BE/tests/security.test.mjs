import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import crypto from "crypto";
import { createRequire } from "module";
import { buildApp, startDb, stopDb, clearDb, registerUser, registerAs, bearer, testEnvVars, outbox } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { loadEnv } = require("../Config/env.js");
const { ensureIndexes } = require("../Config/indexes.js");
const { User } = require("../Models/User.js");
const { OtpChallenge } = require("../Models/OtpChallenge.js");
const { Coupon } = require("../Models/Coupon.js");
const { WebhookEvent } = require("../Models/Order.js");
const otp = require("../Services/otp.js");
const { httpsUrl } = require("../Services/shiprocket.js");
const { schemas } = require("../Validators/catalog.js");

const app = buildApp();

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  buildApp();
  await clearDb();
});

describe("production configuration", () => {
  const prod = { ...testEnvVars, NODE_ENV: "production", SMTP_USER: "shop@gmail.com", SMTP_PASS: "abcd efgh ijkl mnop", TRUST_PROXY_HOPS: "1", CORS_ORIGINS: "https://manushyam.com", APP_URL: "https://manushyam.com" };

  it("accepts a sound production setup", () => {
    expect(loadEnv(prod).isProd).toBe(true);
  });

  it("refuses settings that are unsafe on the internet", () => {
    expect(() => loadEnv({ ...prod, TRUST_PROXY_HOPS: "0" })).toThrow(/TRUST_PROXY_HOPS/);
    expect(() => loadEnv({ ...prod, CORS_ORIGINS: "https://manushyam.com,http://localhost:5173" })).toThrow(/CORS_ORIGINS/);
    expect(() => loadEnv({ ...prod, APP_URL: "http://manushyam.com" })).toThrow(/APP_URL/);
    expect(() => loadEnv({ ...prod, JWT_ACCESS_SECRET: "dummy-dev-secret-dummy-dev-secret-0001" })).toThrow(/placeholder/);
    expect(() => loadEnv({ ...prod, OTP_PEPPER: prod.JWT_ACCESS_SECRET })).toThrow(/OTP_PEPPER/);
  });
});

describe("indexes", () => {
  it("creates the unique and TTL indexes the security guarantees rely on", async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.drop().catch(() => {})));
    await ensureIndexes();
    const userIdx = await User.collection.indexes();
    expect(userIdx.find((i) => i.key.email === 1)?.unique).toBe(true);
    const hookIdx = await WebhookEvent.collection.indexes();
    expect(hookIdx.find((i) => i.key.provider === 1 && i.key.eventId === 1)?.unique).toBe(true);
    const otpIdx = await OtpChallenge.collection.indexes();
    expect(otpIdx.find((i) => i.key.expiresAt === 1)?.expireAfterSeconds).toBe(3600);
    // Running it again is harmless.
    await ensureIndexes();
    await User.create({ name: "One", email: "dup@example.com", passwordHash: "x" });
    await expect(User.create({ name: "Two", email: "dup@example.com", passwordHash: "x" })).rejects.toMatchObject({ code: 11000 });
  });
});

describe("one-time codes", () => {
  it("caps new challenges per email per hour, and old challenges stop working", async () => {
    const first = await otp.createChallenge({ purpose: "login", email: "cap@example.com" });
    const second = await otp.createChallenge({ purpose: "login", email: "cap@example.com" });
    await expect(otp.verifyChallenge({ challengeId: first.challenge.challengeId, purpose: "login", code: first.code })).rejects.toMatchObject({ status: 400 });
    expect((await otp.verifyChallenge({ challengeId: second.challenge.challengeId, purpose: "login", code: second.code })).email).toBe("cap@example.com");
    for (let i = 2; i < otp.MAX_CHALLENGES_PER_HOUR; i += 1) await otp.createChallenge({ purpose: "login", email: "cap@example.com" });
    await expect(otp.createChallenge({ purpose: "login", email: "cap@example.com" })).rejects.toMatchObject({ status: 429, code: "OTP_SEND_LIMIT" });
    // Other purposes and other emails are unaffected.
    await expect(otp.createChallenge({ purpose: "reset", email: "cap@example.com" })).resolves.toBeTruthy();
    await expect(otp.createChallenge({ purpose: "login", email: "other@example.com" })).resolves.toBeTruthy();
  });

  it("answers “forgot password” the same way when the cap is hit, so it can't reveal accounts", async () => {
    const session = await registerUser(app);
    const ask = (email) => request(app).post("/api/auth/password/forgot").send({ email });
    for (let i = 0; i < otp.MAX_CHALLENGES_PER_HOUR; i += 1) await OtpChallenge.create({ challengeId: crypto.randomUUID(), purpose: "reset", email: session.email, codeHash: "x", lastSentAt: new Date(0), consumedAt: new Date(), expiresAt: new Date(Date.now() + 60000) });
    const known = await ask(session.email);
    const unknown = await ask("nobody-here@example.com");
    expect(known.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
  });
});

describe("input hardening", () => {
  it("refuses CMS links that browsers would open on another site", () => {
    const slide = (href) => schemas.heroSlide.safeParse({ title: "Hello", image: { url: "/images/a.jpg" }, cta: { label: "Go", href } }).success;
    expect(slide("/solutions?for=men")).toBe(true);
    expect(slide("https://manushyam.com/blog")).toBe(true);
    for (const bad of ["//evil.com", "/\\evil.com", "javascript:alert(1)", "https://evil.com\\@x"]) expect(slide(bad)).toBe(false);
  });

  it("keeps only plain https links from the courier", () => {
    expect(httpsUrl("https://shiprocket.co/tracking/SR1")).toBe("https://shiprocket.co/tracking/SR1");
    for (const bad of ["javascript:alert(1)", "http://x.com", "https://x.com/\"><script>", "", null]) expect(httpsUrl(bad)).toBeNull();
  });

  it("checks the percentage cap when only the coupon type changes", async () => {
    const admin = bearer((await registerAs(app, "admin")).accessToken);
    const coupon = await Coupon.create({ code: "FLAT500", type: "flat", value: 50000 });
    const res = await request(app).patch(`/api/admin/coupons/${coupon._id}`).set(admin).send({ type: "percent" });
    expect(res.status).toBe(400);
    expect((await Coupon.findById(coupon._id)).type).toBe("flat");
  });

  it("never sends an OTP for an unknown email at login", async () => {
    const before = outbox.length;
    const res = await request(app).post("/api/auth/login").send({ email: "ghost@example.com", password: "Whatever123" });
    expect(res.status).toBe(401);
    expect(outbox.length).toBe(before);
  });
});
