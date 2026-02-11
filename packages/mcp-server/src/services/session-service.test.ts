import { describe, it, expect, beforeEach } from "vitest";
import { SessionService } from "./session-service.js";

describe("SessionService", () => {
  let service: SessionService;

  beforeEach(() => {
    service = new SessionService();
  });

  describe("createSession", () => {
    it("should create and store a session", () => {
      const session = service.createSession({
        passport_id: "ap_aabbccddee00",
        service: "github.com",
        token: "ghp_abc123",
      });

      expect(session.passport_id).toBe("ap_aabbccddee00");
      expect(session.service).toBe("github.com");
      expect(session.token).toBe("ghp_abc123");
      expect(session.status).toBe("active");
      expect(session.created_at).toBeTruthy();
    });

    it("should set expiry when ttl_ms provided", () => {
      const session = service.createSession({
        passport_id: "ap_aabbccddee00",
        service: "github.com",
        ttl_ms: 3600000, // 1 hour
      });

      expect(session.expires_at).toBeTruthy();
      const expiryDate = new Date(session.expires_at!);
      const createdDate = new Date(session.created_at);
      expect(expiryDate.getTime() - createdDate.getTime()).toBe(3600000);
    });
  });

  describe("getSession", () => {
    it("should return stored session", () => {
      service.createSession({
        passport_id: "ap_aabbccddee00",
        service: "github.com",
        token: "abc",
      });

      const session = service.getSession("ap_aabbccddee00", "github.com");
      expect(session).not.toBeNull();
      expect(session!.token).toBe("abc");
    });

    it("should return null for non-existent session", () => {
      expect(service.getSession("ap_000000000000", "example.com")).toBeNull();
    });

    it("should mark expired sessions", () => {
      const session = service.createSession({
        passport_id: "ap_aabbccddee00",
        service: "github.com",
        ttl_ms: -1000, // already expired
      });

      const retrieved = service.getSession("ap_aabbccddee00", "github.com");
      expect(retrieved!.status).toBe("expired");
    });
  });

  describe("hasValidSession", () => {
    it("should return true for active session", () => {
      service.createSession({
        passport_id: "ap_aabbccddee00",
        service: "github.com",
      });

      expect(service.hasValidSession("ap_aabbccddee00", "github.com")).toBe(
        true,
      );
    });

    it("should return false for non-existent session", () => {
      expect(service.hasValidSession("ap_000000000000", "example.com")).toBe(
        false,
      );
    });

    it("should return false for expired session", () => {
      service.createSession({
        passport_id: "ap_aabbccddee00",
        service: "github.com",
        ttl_ms: -1000,
      });

      expect(service.hasValidSession("ap_aabbccddee00", "github.com")).toBe(
        false,
      );
    });

    it("should return false for invalidated session", () => {
      service.createSession({
        passport_id: "ap_aabbccddee00",
        service: "github.com",
      });

      service.invalidateSession("ap_aabbccddee00", "github.com");
      expect(service.hasValidSession("ap_aabbccddee00", "github.com")).toBe(
        false,
      );
    });
  });

  describe("invalidateSession", () => {
    it("should mark session as invalid", () => {
      service.createSession({
        passport_id: "ap_aabbccddee00",
        service: "github.com",
      });

      expect(service.invalidateSession("ap_aabbccddee00", "github.com")).toBe(
        true,
      );

      const session = service.getSession("ap_aabbccddee00", "github.com");
      expect(session!.status).toBe("invalid");
    });

    it("should return false for non-existent session", () => {
      expect(
        service.invalidateSession("ap_000000000000", "example.com"),
      ).toBe(false);
    });
  });

  describe("removeSession", () => {
    it("should remove a session", () => {
      service.createSession({
        passport_id: "ap_aabbccddee00",
        service: "github.com",
      });

      expect(service.removeSession("ap_aabbccddee00", "github.com")).toBe(
        true,
      );
      expect(service.getSession("ap_aabbccddee00", "github.com")).toBeNull();
    });

    it("should return false for non-existent session", () => {
      expect(service.removeSession("ap_000000000000", "example.com")).toBe(
        false,
      );
    });
  });

  describe("listSessions", () => {
    it("should return all sessions for an agent", () => {
      service.createSession({
        passport_id: "ap_aabbccddee00",
        service: "github.com",
      });
      service.createSession({
        passport_id: "ap_aabbccddee00",
        service: "npmjs.com",
      });
      service.createSession({
        passport_id: "ap_other0000000",
        service: "github.com",
      });

      const sessions = service.listSessions("ap_aabbccddee00");
      expect(sessions).toHaveLength(2);
    });

    it("should return empty array for no sessions", () => {
      expect(service.listSessions("ap_000000000000")).toEqual([]);
    });
  });

  describe("getMaxRetries", () => {
    it("should return 2", () => {
      expect(service.getMaxRetries()).toBe(2);
    });
  });
});
