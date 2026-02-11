import { describe, it, expect } from "vitest";
import { runDemo, type DemoResult } from "./demo-scenario.js";

describe("runDemo", () => {
  let result: DemoResult;

  // Run the demo once before all tests in this suite.
  // It is synchronous-safe because vitest awaits the `it` callback.
  it("should complete without errors", async () => {
    result = await runDemo();
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it("should create an identity with a valid passport_id", async () => {
    // Re-run to get a fresh result (tests may run independently)
    const r = await runDemo();
    expect(r.passport_id).toMatch(/^ap_[a-z0-9]{12}$/);
  });

  it("should produce all 8 expected steps", async () => {
    const r = await runDemo();
    expect(r.steps).toHaveLength(8);

    const names = r.steps.map((s) => s.name);
    expect(names).toContain("create_identity");
    expect(names).toContain("store_credential");
    expect(names).toContain("list_credentials");
    expect(names).toContain("get_credential");
    expect(names).toContain("authenticate_with_credentials");
    expect(names).toContain("authenticate_without_credentials");
    expect(names).toContain("check_auth_status");
    expect(names).toContain("get_email_address");
  });

  it("should store and retrieve credentials correctly", async () => {
    const r = await runDemo();

    // Step 3 — list_credentials should show one entry
    const listStep = r.steps.find((s) => s.name === "list_credentials");
    expect(listStep).toBeDefined();
    const credList = listStep!.result as Array<{ service: string }>;
    expect(credList).toHaveLength(1);
    expect(credList[0]!.service).toBe("github.com");

    // Step 4 — get_credential should return full credential
    const getStep = r.steps.find((s) => s.name === "get_credential");
    expect(getStep).toBeDefined();
    const cred = getStep!.result as { username: string; password: string; email: string };
    expect(cred.username).toBe("demo-agent");
    expect(cred.password).toBe("secret123");
    expect(cred.email).toBe("demo@agentpass.dev");
  });

  it("should demonstrate fallback_login and fallback_register", async () => {
    const r = await runDemo();

    const loginStep = r.steps.find((s) => s.name === "authenticate_with_credentials");
    expect(loginStep).toBeDefined();
    const loginResult = loginStep!.result as { method: string; success: boolean };
    expect(loginResult.method).toBe("fallback_login");
    expect(loginResult.success).toBe(true);

    const registerStep = r.steps.find((s) => s.name === "authenticate_without_credentials");
    expect(registerStep).toBeDefined();
    const registerResult = registerStep!.result as { method: string; success: boolean };
    expect(registerResult.method).toBe("fallback_register");
    expect(registerResult.success).toBe(false);
  });

  it("should check auth status correctly", async () => {
    const r = await runDemo();

    const statusStep = r.steps.find((s) => s.name === "check_auth_status");
    expect(statusStep).toBeDefined();
    const status = statusStep!.result as { has_credentials: boolean; service: string };
    expect(status.has_credentials).toBe(true);
    expect(status.service).toBe("github.com");
  });

  it("should generate a valid email address", async () => {
    const r = await runDemo();

    const emailStep = r.steps.find((s) => s.name === "get_email_address");
    expect(emailStep).toBeDefined();
    const emailResult = emailStep!.result as { address: string };
    expect(emailResult.address).toBe("demo-agent@agentpass.dev");
  });
});
