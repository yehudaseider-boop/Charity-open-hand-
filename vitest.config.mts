import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@shared", replacement: path.resolve(import.meta.dirname, "src/lib") },
      { find: "@", replacement: path.resolve(import.meta.dirname, "src") },
      // The phone app's files (apps/mobile) have their own copy of React; tests use the website's one copy.
      // The phone app's native packages, replaced by small stand-ins for unit tests.
      { find: /^react-native$/, replacement: path.resolve(import.meta.dirname, "tests/stubs/react-native.ts") },
      { find: /^expo-secure-store$/, replacement: path.resolve(import.meta.dirname, "tests/stubs/expo-secure-store.ts") },
      { find: /^react$/, replacement: path.resolve(import.meta.dirname, "node_modules/react") },
      { find: /^react\/(.*)$/, replacement: path.resolve(import.meta.dirname, "node_modules/react") + "/$1" },
    ],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Database tests share the local Supabase and must not run in parallel.
    fileParallelism: false,
  },
});
