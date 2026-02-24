/**
 * Tests for PlaywrightBrowserAdapter.
 *
 * Unit tests mock the browser-service internals so no real browser is launched.
 * Integration tests (gated behind INTEGRATION=true) use a real browser.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the browser-service module before importing the adapter
vi.mock("@agentpass/browser-service", () => {
  const mockPage = {
    evaluate: vi.fn().mockResolvedValue(null),
    context: vi.fn().mockReturnValue({
      cookies: vi.fn().mockResolvedValue([]),
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return {
    BrowserManager: vi.fn().mockImplementation(() => ({
      launch: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue(undefined),
      isRunning: false,
    })),
    loginToService: vi.fn(),
    registerOnService: vi.fn(),
  };
});

import { PlaywrightBrowserAdapter } from "./playwright-browser-adapter.js";
import {
  BrowserManager,
  loginToService,
  registerOnService,
} from "@agentpass/browser-service";

const mockLoginToService = vi.mocked(loginToService);
const mockRegisterOnService = vi.mocked(registerOnService);

describe("PlaywrightBrowserAdapter (unit)", () => {
  let adapter: PlaywrightBrowserAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new PlaywrightBrowserAdapter({ headless: true });
  });

  afterEach(async () => {
    await adapter.close();
  });

  it("should instantiate without errors", () => {
    expect(adapter).toBeDefined();
  });

  it("should accept proxy configuration", () => {
    const proxyAdapter = new PlaywrightBrowserAdapter({
      headless: true,
      proxy: "socks5://127.0.0.1:1080",
    });
    expect(proxyAdapter).toBeDefined();
  });

  it("should default to headless mode", () => {
    const defaultAdapter = new PlaywrightBrowserAdapter();
    expect(defaultAdapter).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // login()
  // -----------------------------------------------------------------------

  describe("login", () => {
    it("returns success with session data on successful login", async () => {
      mockLoginToService.mockResolvedValue({
        success: true,
      });

      const result = await adapter.login("https://example.com/login", {
        username: "user@test.com",
        password: "pass123",
      });

      expect(result.success).toBe(true);
      expect(mockLoginToService).toHaveBeenCalledOnce();
    });

    it("returns captcha info when CAPTCHA is detected", async () => {
      mockLoginToService.mockResolvedValue({
        success: false,
        captcha_detected: true,
        captcha_type: "recaptcha",
        error: "CAPTCHA detected",
      });

      const result = await adapter.login("https://example.com/login", {
        username: "user@test.com",
        password: "pass123",
      });

      expect(result.success).toBe(false);
      expect(result.captcha_detected).toBe(true);
      expect(result.captcha_type).toBe("recaptcha");
    });

    it("returns error on login failure", async () => {
      mockLoginToService.mockResolvedValue({
        success: false,
        error: "Invalid credentials",
      });

      const result = await adapter.login("https://example.com/login", {
        username: "user@test.com",
        password: "wrong",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid credentials");
    });

    it("catches exceptions and returns error result", async () => {
      mockLoginToService.mockRejectedValue(new Error("Browser crashed"));

      const result = await adapter.login("https://example.com/login", {
        username: "user@test.com",
        password: "pass123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Browser crashed");
    });

    it("extracts cookies from browser context on success", async () => {
      // Override the mock page to return cookies
      const mockManager = vi.mocked(BrowserManager).mock.results[0]?.value;
      if (mockManager) {
        const mockPage = {
          evaluate: vi.fn().mockResolvedValue(null),
          context: vi.fn().mockReturnValue({
            cookies: vi.fn().mockResolvedValue([
              { name: "session", value: "abc123" },
              { name: "csrf", value: "xyz" },
            ]),
          }),
          close: vi.fn().mockResolvedValue(undefined),
        };
        mockManager.newPage.mockResolvedValue(mockPage);
      }

      mockLoginToService.mockResolvedValue({ success: true });

      const result = await adapter.login("https://example.com/login", {
        username: "user@test.com",
        password: "pass123",
      });

      expect(result.success).toBe(true);
      expect(result.cookies).toBe("session=abc123; csrf=xyz");
    });
  });

  // -----------------------------------------------------------------------
  // register()
  // -----------------------------------------------------------------------

  describe("register", () => {
    it("returns success with credentials on successful registration", async () => {
      mockRegisterOnService.mockResolvedValue({
        success: true,
        credentials: {
          username: "testuser",
          password: "pass123",
          email: "test@example.com",
        },
      });

      const result = await adapter.register("https://example.com/signup", {
        email: "test@example.com",
        password: "pass123",
        name: "testuser",
      });

      expect(result.success).toBe(true);
      expect(result.credentials).toEqual({
        username: "testuser",
        password: "pass123",
        email: "test@example.com",
      });
    });

    it("returns captcha info when CAPTCHA is detected during registration", async () => {
      mockRegisterOnService.mockResolvedValue({
        success: false,
        captcha_detected: true,
        captcha_type: "hcaptcha",
        error: "CAPTCHA detected",
      });

      const result = await adapter.register("https://example.com/signup", {
        email: "test@example.com",
        password: "pass123",
      });

      expect(result.success).toBe(false);
      expect(result.captcha_detected).toBe(true);
      expect(result.captcha_type).toBe("hcaptcha");
    });

    it("returns error on registration failure", async () => {
      mockRegisterOnService.mockResolvedValue({
        success: false,
        error: "Email already exists",
      });

      const result = await adapter.register("https://example.com/signup", {
        email: "test@example.com",
        password: "pass123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Email already exists");
    });

    it("catches exceptions and returns error result", async () => {
      mockRegisterOnService.mockRejectedValue(new Error("Network error"));

      const result = await adapter.register("https://example.com/signup", {
        email: "test@example.com",
        password: "pass123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
    });
  });
});

// ---------------------------------------------------------------------------
// Integration tests (skipped by default)
// ---------------------------------------------------------------------------

const INTEGRATION_TESTS_ENABLED = process.env.INTEGRATION === "true";

describe.skipIf(!INTEGRATION_TESTS_ENABLED)(
  "PlaywrightBrowserAdapter (integration)",
  () => {
    let adapter: PlaywrightBrowserAdapter;

    beforeEach(() => {
      // Reset mocks so integration tests use real implementations
      vi.restoreAllMocks();
      adapter = new PlaywrightBrowserAdapter({ headless: true });
    });

    afterEach(async () => {
      await adapter.close();
    });

    it("should successfully instantiate the adapter", () => {
      expect(adapter).toBeDefined();
    });

    it.skip("should login to a test service", async () => {
      const result = await adapter.login("https://test-service.local/login", {
        username: "test-user",
        password: "test-password",
      });
      expect(result).toBeDefined();
    });

    it.skip("should register on a test service", async () => {
      const result = await adapter.register(
        "https://test-service.local/signup",
        {
          email: "test@example.com",
          password: "test-password",
          name: "Test User",
        },
      );
      expect(result).toBeDefined();
    });
  },
);
