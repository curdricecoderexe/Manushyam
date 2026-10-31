import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { loadEnv } = require("../Config/env.js");
const { createApp } = require("../app.js");
const { outbox } = require("../Services/mailer.js");

export const ORIGIN = "http://localhost:5173";

export const testEnvVars = {
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://placeholder",
  CORS_ORIGINS: ORIGIN,
  GLOBAL_RATE_MAX: "10000",
  AUTH_RATE_MAX: "10000",
  OTP_RATE_MAX: "10000",
  JWT_ACCESS_SECRET: "test-access-secret-test-access-secret-0001",
  JWT_REFRESH_SECRET: "test-refresh-secret-test-refresh-secret-01",
  OTP_PEPPER: "test-otp-pepper-0001",
};

export function buildApp(overrides = {}) {
  return createApp(loadEnv({ ...testEnvVars, ...overrides }));
}

// A replica set (not a standalone) so multi-document transactions work as in production.
let replSet;
export async function startDb() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  await mongoose.connect(replSet.getUri());
}

export async function stopDb() {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
}

export async function clearDb() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  outbox.length = 0;
}

export { outbox };

// Latest emailed code for an address (tests read the outbox instead of a real inbox).
export function lastCode(email) {
  const mail = [...outbox].reverse().find((m) => m.to === email && m.meta?.code);
  return mail?.meta.code;
}

export function refreshCookie(res) {
  const cookie = (res.headers["set-cookie"] || []).find((c) => c.startsWith("mm_rt="));
  return cookie ? cookie.split(";")[0] : undefined;
}

let counter = 0;
export function uniqueEmail(prefix = "user") {
  counter += 1;
  return `${prefix}${counter}.${Date.now()}@example.com`;
}

// Full signup flow: returns { accessToken, cookie, user, email, password }.
export async function registerUser(app, { name = "Ananya Sharma", email = uniqueEmail(), password = "Ritual2025" } = {}) {
  const start = await request(app).post("/api/auth/register").send({ name, email, password });
  const verify = await request(app).post("/api/auth/register/verify").send({ challengeId: start.body.challengeId, code: lastCode(email) });
  if (verify.status !== 201) throw new Error(`registerUser failed: ${verify.status} ${JSON.stringify(verify.body)}`);
  return { accessToken: verify.body.accessToken, cookie: refreshCookie(verify), user: verify.body.user, email, password };
}

// A signed-up user promoted to staff/admin (the existing access token picks the role up immediately).
export async function registerAs(app, role) {
  const { User } = require("../Models/User.js");
  const { invalidateUser } = require("../Services/userCache.js");
  const session = await registerUser(app);
  await User.updateOne({ _id: session.user.id }, { $set: { role } });
  invalidateUser(session.user.id);
  return session;
}

export function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}
