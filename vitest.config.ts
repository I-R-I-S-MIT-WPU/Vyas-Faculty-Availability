import { defineConfig } from "vitest/config";
import path from "path";

// Pure-logic tests only (no DOM). Kept separate from vite.config.ts so the PWA/react plugins are not loaded.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
