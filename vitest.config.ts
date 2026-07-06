import { defineConfig } from "vitest/config";
import path from "node:path";

// DB-backed tests hit the local `supabase start` Postgres via supabase-js —
// see tests/setup/README.md. Every fixture uses a randomly-generated user/
// property per test file, so files are safe to run in parallel; no shared
// seed state is depended on.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup/env.ts", "./tests/setup/mockNext.ts"],
    hookTimeout: 20_000,
    testTimeout: 20_000,
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
