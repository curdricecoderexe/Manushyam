import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.mjs"],
    testTimeout: 30000,
    hookTimeout: 120000,
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["Config/**", "Controller/**", "Middleware/**", "Models/**", "Routes/**", "Services/**", "Utils/**", "app.js"],
    },
  },
});
