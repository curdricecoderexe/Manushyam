import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { clearQueryCache } from "../lib/query";
import { resetFakeSockets } from "./fakeSocket";
import { resetConsentForTests } from "../lib/consent";
import { resetAnalyticsForTests } from "../lib/analytics";

// Motion (admin panel) finishes instantly so exit animations never keep closed elements around.
MotionGlobalConfig.skipAnimations = true;

// No real WebSocket connections in tests: every page gets the in-memory fake.
vi.mock("../lib/socket", () => import("./fakeSocket"));

afterEach(() => {
  cleanup();
  clearQueryCache();
  resetFakeSockets();
  sessionStorage.clear();
  localStorage.clear();
  resetConsentForTests();
  resetAnalyticsForTests();
  document.body.style.overflow = "";
});

// jsdom lacks these browser APIs used by layout components.
window.scrollTo = () => {};
window.matchMedia =
  window.matchMedia ||
  ((query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
