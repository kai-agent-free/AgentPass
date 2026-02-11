import { describe, it, expect } from "vitest";

describe("@agentpass/core types", () => {
  it("should export AgentPassport type", async () => {
    const mod = await import("./index.js");
    expect(mod).toBeDefined();
  });
});
