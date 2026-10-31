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
});
