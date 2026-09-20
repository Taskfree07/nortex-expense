import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Reading the two bills with Gemini takes a few seconds when a key is set.
    testTimeout: 60000,
  },
});
