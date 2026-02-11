import { describe, it, expect, beforeEach } from "vitest";
import { IdentityService } from "../services/identity-service.js";

describe("IdentityService", () => {
  let service: IdentityService;

  beforeEach(() => {
    service = new IdentityService();
  });

  describe("createIdentity", () => {
    it("should create a valid identity with a passport_id", () => {
      const result = service.createIdentity({
        name: "test-agent",
        description: "A test agent",
        owner_email: "owner@example.com",
      });

      expect(result.passport).toBeDefined();
      expect(result.passport.passport_id).toMatch(/^ap_[a-z0-9]{12}$/);
      expect(result.passport.identity.name).toBe("test-agent");
      expect(result.passport.identity.description).toBe("A test agent");
      expect(result.passport.owner.email).toBe("owner@example.com");
      expect(result.passport.identity.public_key).toBeTruthy();
      expect(result.publicKey).toBeTruthy();
      expect(result.publicKey).toBe(result.passport.identity.public_key);
    });

    it("should default description to empty string when omitted", () => {
      const result = service.createIdentity({
        name: "minimal-agent",
        owner_email: "owner@example.com",
      });

      expect(result.passport.identity.description).toBe("");
    });

    it("should generate unique passport IDs", () => {
      const r1 = service.createIdentity({
        name: "agent-1",
        owner_email: "a@example.com",
      });
      const r2 = service.createIdentity({
        name: "agent-2",
        owner_email: "b@example.com",
      });

      expect(r1.passport.passport_id).not.toBe(r2.passport.passport_id);
    });

    it("should set trust level to unverified for new identities", () => {
      const result = service.createIdentity({
        name: "new-agent",
        owner_email: "owner@example.com",
      });

      expect(result.passport.trust.level).toBe("unverified");
      expect(result.passport.trust.score).toBe(0);
    });
  });

  describe("listIdentities", () => {
    it("should return empty array when no identities exist", () => {
      const identities = service.listIdentities();
      expect(identities).toEqual([]);
    });

    it("should return all created identities", () => {
      service.createIdentity({
        name: "agent-a",
        owner_email: "a@example.com",
      });
      service.createIdentity({
        name: "agent-b",
        owner_email: "b@example.com",
      });

      const identities = service.listIdentities();
      expect(identities).toHaveLength(2);

      const names = identities.map((i) => i.name);
      expect(names).toContain("agent-a");
      expect(names).toContain("agent-b");
    });

    it("should include status and created_at in summaries", () => {
      service.createIdentity({
        name: "agent-x",
        owner_email: "x@example.com",
      });

      const [summary] = service.listIdentities();
      expect(summary.status).toBe("active");
      expect(summary.created_at).toBeTruthy();
      expect(summary.passport_id).toMatch(/^ap_[a-z0-9]{12}$/);
    });
  });

  describe("getIdentity", () => {
    it("should return passport for an existing identity", () => {
      const { passport } = service.createIdentity({
        name: "lookup-agent",
        owner_email: "owner@example.com",
      });

      const found = service.getIdentity(passport.passport_id);
      expect(found).toBeDefined();
      expect(found!.passport_id).toBe(passport.passport_id);
      expect(found!.identity.name).toBe("lookup-agent");
    });

    it("should return null for a non-existent passport_id", () => {
      const found = service.getIdentity("ap_000000000000");
      expect(found).toBeNull();
    });

    it("should not expose private key in returned passport", () => {
      const { passport } = service.createIdentity({
        name: "secure-agent",
        owner_email: "owner@example.com",
      });

      const found = service.getIdentity(passport.passport_id);
      // The passport object should not contain a privateKey field
      expect(found).not.toHaveProperty("privateKey");
    });
  });

  describe("deleteIdentity", () => {
    it("should remove an existing identity", () => {
      const { passport } = service.createIdentity({
        name: "temp-agent",
        owner_email: "owner@example.com",
      });

      const deleted = service.deleteIdentity(passport.passport_id);
      expect(deleted).toBe(true);

      const found = service.getIdentity(passport.passport_id);
      expect(found).toBeNull();
    });

    it("should return false for non-existent identity", () => {
      const deleted = service.deleteIdentity("ap_000000000000");
      expect(deleted).toBe(false);
    });
  });

  describe("revokeIdentity", () => {
    it("should mark identity as revoked", () => {
      const { passport } = service.createIdentity({
        name: "revoke-me",
        owner_email: "owner@example.com",
      });

      const revoked = service.revokeIdentity(passport.passport_id);
      expect(revoked).toBe(true);

      const identities = service.listIdentities();
      const found = identities.find(
        (i) => i.passport_id === passport.passport_id,
      );
      expect(found?.status).toBe("revoked");
    });

    it("should return false for non-existent identity", () => {
      const revoked = service.revokeIdentity("ap_000000000000");
      expect(revoked).toBe(false);
    });
  });
});
