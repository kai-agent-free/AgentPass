import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: "postgresql://root:root@localhost:5432/agentpass_test",
      JWT_SECRET: "test-secret-do-not-use-in-production-vitest-only",
    },
    fileParallelism: false,
  },
});
