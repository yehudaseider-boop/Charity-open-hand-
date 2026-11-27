import { defineConfig } from "vitest/config";
import base from "./vitest.config.mjs";

// Givy's accuracy test set (evals/): the real AI, so never part of `npm test`, and no local database needed.
// Same aliases and settings as the main config, its own files. Run with `npm run eval:givy`.
export default defineConfig({
  resolve: base.resolve,
  test: { ...base.test, include: ["evals/**/*.eval.ts"], globalSetup: [], fileParallelism: false, maxConcurrency: 1 },
});
