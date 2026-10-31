import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createRequire } from "module";
import { buildApp, startDb, stopDb, clearDb, outbox, lastCode, refreshCookie, registerUser, uniqueEmail, bearer, ORIGIN } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { User } = require("../Models/User.js");
const { invalidateUser } = require("../Services/userCache.js");

const app = buildApp();

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

async function loginWithOtp(email, password, target = app) {
  const res = await request(target).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  expect(res.body.otpRequired).toBe(true);
  return request(target).post("/api/auth/login/verify").send({ challengeId: res.body.challengeId, code: lastCode(email) });
}

describe("registration", () => {
  it("emails a code, then creates a verified account and a secure session", async () => {
    const email = uniqueEmail();
    const start = await request(app).post("/api/auth/register").send({ name: "Ananya Sharma", email, password: "Ritual2025" });
    expect(start.status).toBe(202);
    expect(start.body.email).toMatch(/^us•+@example\.com$/);
    expect(await User.exists({ email })).toBeNull(); // nothing stored until verified

    const code = lastCode(email);
    expect(code).toMatch(/^\d{6}$/);

    const verify = await request(app).post("/api/auth/register/verify").send({ challengeId: start.body.challengeId, code });
    expect(verify.status).toBe(201);
    expect(verify.body.user).toMatchObject({ email, role: "customer", emailVerified: true });
    expect(verify.body.user.passwordHash).toBeUndefined();

    const cookie = verify.headers["set-cookie"].find((c) => c.startsWith("mm_rt="));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/auth/);

    const me = await request(app).get("/api/me").set(bearer(verify.body.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
  });

  it("does not reveal that an email is already registered", async () => {
    const { email } = await registerUser(app);
    outbox.length = 0;
    const res = await request(app).post("/api/auth/register").send({ name: "Someone Else", email, password: "Another2025" });
    expect(res.status).toBe(202);
    expect(Object.keys(res.body).sort()).toEqual(["challengeId", "email", "expiresIn"]);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].subject).toMatch(/already have/);
    expect(lastCode(email)).toBeUndefined();
  });

  it("rejects weak passwords and unknown fields", async () => {
    const weak = await request(app).post("/api/auth/register").send({ name: "A B", email: uniqueEmail(), password: "password" });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe("VALIDATION_ERROR");

    const extra = await request(app).post("/api/auth/register").send({ name: "A B", email: uniqueEmail(), password: "Ritual2025", role: "admin" });
    expect(extra.status).toBe(400);
  });
});

describe("login", () => {
  it("gives the same error for a wrong password and an unknown email", async () => {
    const { email } = await registerUser(app);
    const wrong = await request(app).post("/api/auth/login").send({ email, password: "Wrong2025" });
    const unknown = await request(app).post("/api/auth/login").send({ email: uniqueEmail(), password: "Wrong2025" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it("requires an emailed code by default, then signs in", async () => {
    const { email, password } = await registerUser(app);
    const res = await loginWithOtp(email, password);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(refreshCookie(res)).toBeTruthy();
  });

  it("can skip the code for customers but never for staff", async () => {
    const noOtpApp = buildApp({ CUSTOMER_LOGIN_OTP: "false" });
    const customer = await registerUser(noOtpApp);
    const direct = await request(noOtpApp).post("/api/auth/login").send({ email: customer.email, password: customer.password });
    expect(direct.body.otpRequired).toBe(false);
    expect(direct.body.accessToken).toBeTruthy();

    const staff = await registerUser(noOtpApp);
    await User.updateOne({ email: staff.email }, { role: "staff" });
    const staffLogin = await request(noOtpApp).post("/api/auth/login").send({ email: staff.email, password: staff.password });
    expect(staffLogin.body.otpRequired).toBe(true);
    expect(staffLogin.body.accessToken).toBeUndefined();
  });

  it("locks the account after 8 failed passwords, even for the right password", async () => {
    const { email, password } = await registerUser(app);
    for (let i = 0; i < 8; i += 1) await request(app).post("/api/auth/login").send({ email, password: "Wrong2025" });
    const res = await request(app).post("/api/auth/login").send({ email, password });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("ACCOUNT_LOCKED");
  });

  it("refuses deactivated accounts", async () => {
    const { email, password } = await registerUser(app);
    await User.updateOne({ email }, { isActive: false });
    const res = await request(app).post("/api/auth/login").send({ email, password });
    expect(res.status).toBe(401);
  });
});

describe("one-time codes", () => {
  it("locks a challenge after 5 wrong guesses", async () => {
    const { email, password } = await registerUser(app);
    const start = await request(app).post("/api/auth/login").send({ email, password });
    const code = lastCode(email);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i += 1) {
      const r = await request(app).post("/api/auth/login/verify").send({ challengeId: start.body.challengeId, code: wrong });
      expect(r.status).toBe(400);
    }
    const fifth = await request(app).post("/api/auth/login/verify").send({ challengeId: start.body.challengeId, code: wrong });
    expect(fifth.status).toBe(429);
    const right = await request(app).post("/api/auth/login/verify").send({ challengeId: start.body.challengeId, code });
    expect(right.status).toBe(400);
  });

  it("can be used only once", async () => {
    const { email, password } = await registerUser(app);
    const start = await request(app).post("/api/auth/login").send({ email, password });
    const body = { challengeId: start.body.challengeId, code: lastCode(email) };
    const [a, b] = await Promise.all([request(app).post("/api/auth/login/verify").send(body), request(app).post("/api/auth/login/verify").send(body)]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
  });

  it("enforces a cooldown on resending", async () => {
    const { email, password } = await registerUser(app);
    const start = await request(app).post("/api/auth/login").send({ email, password });
    const res = await request(app).post("/api/auth/otp/resend").send({ challengeId: start.body.challengeId });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("OTP_COOLDOWN");
  });
});

describe("sessions", () => {
  it("rotates the refresh token and revokes the session when an old one is replayed", async () => {
    const { cookie } = await registerUser(app);
    const first = await request(app).post("/api/auth/refresh").set("Origin", ORIGIN).set("Cookie", cookie);
    expect(first.status).toBe(200);
    const newCookie = refreshCookie(first);
    expect(newCookie).not.toBe(cookie);

    const replay = await request(app).post("/api/auth/refresh").set("Origin", ORIGIN).set("Cookie", cookie);
    expect(replay.status).toBe(401);
    // Theft detection: the legitimate newer token is revoked too.
    const after = await request(app).post("/api/auth/refresh").set("Origin", ORIGIN).set("Cookie", newCookie);
    expect(after.status).toBe(401);
  });

  it("only accepts cookie refreshes from our own origin", async () => {
    const { cookie } = await registerUser(app);
    const none = await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    expect(none.status).toBe(403);
  });

  it("logs out by revoking the session", async () => {
    const { cookie } = await registerUser(app);
    const out = await request(app).post("/api/auth/logout").set("Origin", ORIGIN).set("Cookie", cookie);
    expect(out.status).toBe(204);
    const res = await request(app).post("/api/auth/refresh").set("Origin", ORIGIN).set("Cookie", cookie);
    expect(res.status).toBe(401);
  });

  it("rejects tampered, unsigned and wrongly signed access tokens", async () => {
    const { accessToken, user } = await registerUser(app);
    const [h, p, s] = accessToken.split(".");
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    const elevated = Buffer.from(JSON.stringify({ ...payload, role: "admin" })).toString("base64url");
    const none = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${p}.`;
    const forged = jwt.sign({ sub: user.id, role: "admin", tv: 0 }, "not-the-secret-not-the-secret-0000", { issuer: "manushyam-api", audience: "manushyam-web" });
    for (const token of [`${h}.${elevated}.${s}`, none, forged, "garbage"]) {
      const res = await request(app).get("/api/me").set(bearer(token));
      expect(res.status).toBe(401);
    }
  });

  it("stops honouring access tokens once the account is deactivated", async () => {
    const { accessToken, user } = await registerUser(app);
    await User.updateOne({ _id: user.id }, { isActive: false });
    invalidateUser(user.id);
    const res = await request(app).get("/api/me").set(bearer(accessToken));
    expect(res.status).toBe(401);
  });
});

describe("password reset", () => {
  it("answers identically for unknown emails and sends nothing", async () => {
    const res = await request(app).post("/api/auth/password/forgot").send({ email: uniqueEmail() });
    expect(res.status).toBe(202);
    expect(outbox).toHaveLength(0);
  });

  it("resets the password and signs out existing sessions", async () => {
    const { email, password, accessToken, cookie } = await registerUser(app);
    const forgot = await request(app).post("/api/auth/password/forgot").send({ email });
    expect(forgot.status).toBe(202);

    const reset = await request(app).post("/api/auth/password/reset").send({ email, code: lastCode(email), password: "NewRitual2026" });
    expect(reset.status).toBe(200);

    expect((await request(app).get("/api/me").set(bearer(accessToken))).status).toBe(401);
    expect((await request(app).post("/api/auth/refresh").set("Origin", ORIGIN).set("Cookie", cookie)).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email, password })).status).toBe(401);
    expect((await loginWithOtp(email, "NewRitual2026")).status).toBe(200);
    expect(outbox.some((m) => m.subject.includes("password was changed"))).toBe(true);
  });
});
