import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * End-to-end checks (18/11/2026): a robot uses the real test site, the real test database and the phone app's web
 * build, the way a person would. They catch what the unit tests can't: two halves that each look right alone but
 * disagree (the 8-digit sign-in code). Run with `npm run test:e2e`; GitHub runs them after every test-site deploy.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: "@shared", replacement: path.resolve(import.meta.dirname, "src/lib") },
      { find: "@", replacement: path.resolve(import.meta.dirname, "src") },
    ],
  },
  test: {
    include: ["e2e/**/*.e2e.ts"],
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 120_000,
  },
});
