import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: "postgresql://root:root@localhost:5432/agentpass_test",
    },
    fileParallelism: false,
  },
});
