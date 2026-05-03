import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  test: {
    globals: false,
    environmentMatchGlobs: [
      ["client/**", "jsdom"],
      ["server/**", "node"],
    ],
    include: [
      "server/**/*.test.ts",
      "client/**/*.test.ts",
      "client/**/*.test.tsx",
    ],
    testTimeout: 10000,
  },
});
