import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { testEnvVars } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { loadEnv } = require("../Config/env.js");

describe("loadEnv", () => {
  it("parses a valid configuration and derives helpers", () => {
    const env = loadEnv({ ...testEnvVars, CORS_ORIGINS: "https://a.com, https://b.com" });
    expect(env.isTest).toBe(true);
    expect(env.PORT).toBe(5000);
    expect(env.corsOrigins).toEqual(["https://a.com", "https://b.com"]);
  });

  it("fails fast listing every missing or weak variable", () => {
    expect(() => loadEnv({ NODE_ENV: "test", JWT_ACCESS_SECRET: "short" })).toThrow(
      /MONGODB_URI[\s\S]*JWT_ACCESS_SECRET[\s\S]*JWT_REFRESH_SECRET[\s\S]*OTP_PEPPER/
    );
  });

  it("refuses identical access and refresh secrets in production", () => {
    const same = "x".repeat(40);
    expect(() =>
      loadEnv({ ...testEnvVars, NODE_ENV: "production", JWT_ACCESS_SECRET: same, JWT_REFRESH_SECRET: same })
    ).toThrow(/must differ/);
  });

  it("reads Gmail SMTP settings", () => {
    const off = loadEnv(testEnvVars);
    expect(off.mailEnabled).toBe(false);
    expect([off.SMTP_HOST, off.SMTP_PORT]).toEqual(["smtp.gmail.com", 465]);
    const on = loadEnv({ ...testEnvVars, SMTP_USER: "shop@gmail.com", SMTP_PASS: "abcd efgh ijkl mnop" });
    expect(on.mailEnabled).toBe(true);
    expect(on.SMTP_PASS).toBe("abcdefghijklmnop");
    expect(() => loadEnv({ ...testEnvVars, SMTP_USER: "shop@gmail.com" })).toThrow(/SMTP_PASS/);
    expect(() => loadEnv({ ...testEnvVars, NODE_ENV: "production" })).toThrow(/SMTP_USER/);
  });

  it("validates Razorpay settings", () => {
    const rz = { RAZORPAY_KEY_ID: "rzp_test_abc123", RAZORPAY_KEY_SECRET: "key-secret", RAZORPAY_WEBHOOK_SECRET: "hook-secret" };
    expect(loadEnv({ ...testEnvVars, ...rz }).RAZORPAY_AUTO_REFUND_ON_CANCEL).toBe(true);
    expect(loadEnv({ ...testEnvVars, RAZORPAY_KEY_ID: "", RAZORPAY_ACCOUNT_ID: "" }).RAZORPAY_REFUND_SPEED).toBe("normal");
    expect(() => loadEnv({ ...testEnvVars, ...rz, RAZORPAY_KEY_ID: "pk_live_123" })).toThrow(/rzp_live_/);
    expect(() => loadEnv({ ...testEnvVars, ...rz, RAZORPAY_WEBHOOK_SECRET: "key-secret" })).toThrow(/must differ from RAZORPAY_KEY_SECRET/);
    const prod = { ...testEnvVars, ...rz, RAZORPAY_WEBHOOK_SECRET: "hook-secret-0123456789", NODE_ENV: "production", SMTP_USER: "shop@gmail.com", SMTP_PASS: "abcd efgh ijkl mnop", TRUST_PROXY_HOPS: "1", CORS_ORIGINS: "https://manushyam.com", APP_URL: "https://manushyam.com" };
    expect(() => loadEnv(prod)).toThrow(/test key in production/);
    expect(loadEnv({ ...prod, RAZORPAY_ALLOW_TEST_MODE: "true" }).RAZORPAY_KEY_ID).toBe("rzp_test_abc123");
    expect(loadEnv({ ...prod, RAZORPAY_KEY_ID: "rzp_live_abc123" }).isProd).toBe(true);
  });
});
