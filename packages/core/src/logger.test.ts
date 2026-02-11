import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger, sanitize } from "./logger.js";

describe("createLogger", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    delete process.env.LOG_LEVEL;
  });

  it("returns a logger with debug, info, warn, and error methods", () => {
    const log = createLogger("test");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  it("outputs valid JSON to stderr", () => {
    const log = createLogger("json-test");
    log.info("hello world");

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const output = stderrSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
    expect(parsed.level).toBe("info");
    expect(parsed.name).toBe("json-test");
    expect(parsed.message).toBe("hello world");
    expect(typeof parsed.timestamp).toBe("string");
  });

  it("includes extra data fields in the output", () => {
    const log = createLogger("data-test");
    log.info("started", { port: 3846 });

    const output = stderrSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
    expect(parsed.port).toBe(3846);
  });

  describe("LOG_LEVEL filtering", () => {
    it("suppresses debug messages when LOG_LEVEL=info", () => {
      process.env.LOG_LEVEL = "info";
      const log = createLogger("filter-test");
      log.debug("should not appear");
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it("emits debug messages when LOG_LEVEL=debug", () => {
      process.env.LOG_LEVEL = "debug";
      const log = createLogger("filter-test");
      log.debug("visible");
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });

    it("suppresses info and debug when LOG_LEVEL=warn", () => {
      process.env.LOG_LEVEL = "warn";
      const log = createLogger("filter-test");
      log.debug("hidden");
      log.info("hidden");
      log.warn("visible");
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });

    it("only emits error when LOG_LEVEL=error", () => {
      process.env.LOG_LEVEL = "error";
      const log = createLogger("filter-test");
      log.debug("hidden");
      log.info("hidden");
      log.warn("hidden");
      log.error("visible");
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });

    it("defaults to info level when LOG_LEVEL is not set", () => {
      delete process.env.LOG_LEVEL;
      const log = createLogger("default-test");
      log.debug("hidden");
      log.info("visible");
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("sensitive data sanitization", () => {
    it("redacts password field", () => {
      const log = createLogger("sanitize-test");
      log.info("login", { user: "alice", password: "s3cret" });

      const output = stderrSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
      expect(parsed.password).toBe("[REDACTED]");
      expect(parsed.user).toBe("alice");
    });

    it("redacts privateKey field", () => {
      const log = createLogger("sanitize-test");
      log.info("key created", { privateKey: "ed25519-key-material" });

      const output = stderrSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
      expect(parsed.privateKey).toBe("[REDACTED]");
    });

    it("redacts token field", () => {
      const log = createLogger("sanitize-test");
      log.info("auth", { token: "jwt-abc123" });

      const output = stderrSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
      expect(parsed.token).toBe("[REDACTED]");
    });

    it("redacts secret field", () => {
      const log = createLogger("sanitize-test");
      log.info("config", { secret: "supersecret" });

      const output = stderrSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
      expect(parsed.secret).toBe("[REDACTED]");
    });

    it("redacts authorization field", () => {
      const log = createLogger("sanitize-test");
      log.info("request", { authorization: "Bearer xyz" });

      const output = stderrSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
      expect(parsed.authorization).toBe("[REDACTED]");
    });

    it("redacts nested sensitive fields", () => {
      const log = createLogger("sanitize-test");
      log.info("nested", {
        user: "alice",
        credentials: { password: "abc", token: "def" },
      });

      const output = stderrSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
      const creds = parsed.credentials as Record<string, unknown>;
      expect(creds.password).toBe("[REDACTED]");
      expect(creds.token).toBe("[REDACTED]");
    });
  });
});

describe("sanitize", () => {
  it("replaces password, privateKey, and token with [REDACTED]", () => {
    const result = sanitize({
      user: "bob",
      password: "pass123",
      privateKey: "key-data",
      token: "jwt-token",
    });

    expect(result.user).toBe("bob");
    expect(result.password).toBe("[REDACTED]");
    expect(result.privateKey).toBe("[REDACTED]");
    expect(result.token).toBe("[REDACTED]");
  });

  it("does not modify the original object", () => {
    const original = { password: "original" };
    sanitize(original);
    expect(original.password).toBe("original");
  });

  it("handles objects with no sensitive fields", () => {
    const result = sanitize({ name: "test", count: 42 });
    expect(result).toEqual({ name: "test", count: 42 });
  });
});
