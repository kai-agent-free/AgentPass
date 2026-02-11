import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VERSION, TOOLS, main } from "./cli.js";

describe("CLI module exports", () => {
  it("should export a version string", () => {
    expect(VERSION).toBe("0.1.0");
  });

  it("should export a non-empty tools list", () => {
    expect(TOOLS.length).toBeGreaterThan(0);
  });

  it("should include core identity tools", () => {
    expect(TOOLS).toContain("create_identity");
    expect(TOOLS).toContain("list_identities");
    expect(TOOLS).toContain("get_identity");
  });

  it("should include credential tools", () => {
    expect(TOOLS).toContain("store_credential");
    expect(TOOLS).toContain("get_credential");
    expect(TOOLS).toContain("list_credentials");
  });

  it("should include auth tools", () => {
    expect(TOOLS).toContain("authenticate");
    expect(TOOLS).toContain("check_auth_status");
  });

  it("should include email tools", () => {
    expect(TOOLS).toContain("get_email_address");
    expect(TOOLS).toContain("wait_for_email");
  });

  it("should include sms tools", () => {
    expect(TOOLS).toContain("get_phone_number");
    expect(TOOLS).toContain("wait_for_sms");
  });
});

describe("CLI info command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("should print version and tools on info command", async () => {
    await main(["node", "cli.js", "info"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain(VERSION);
    expect(output).toContain("create_identity");
    expect(output).toContain("authenticate");
    expect(output).toContain("get_email_address");
  });
});

describe("CLI help command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("should print usage on help command", async () => {
    await main(["node", "cli.js", "help"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("AgentPass");
    expect(output).toContain("serve");
    expect(output).toContain("demo");
    expect(output).toContain("info");
  });
});
