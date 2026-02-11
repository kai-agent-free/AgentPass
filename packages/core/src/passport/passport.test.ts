import { describe, it, expect } from "vitest";
import { generatePassportId, createPassport } from "./passport.js";
import {
  PassportIdSchema,
  CreatePassportInputSchema,
  PassportIdentitySchema,
} from "./validation.js";

describe("generatePassportId", () => {
  it("should generate ID in ap_xxxxxxxxxxxx format", () => {
    const id = generatePassportId();
    expect(id).toMatch(/^ap_[a-f0-9]{12}$/);
  });

  it("should generate unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generatePassportId()));
    expect(ids.size).toBe(100);
  });
});

describe("PassportIdSchema", () => {
  it("should accept valid passport ID", () => {
    const result = PassportIdSchema.safeParse("ap_abcdef012345");
    expect(result.success).toBe(true);
  });

  it("should reject invalid format", () => {
    expect(PassportIdSchema.safeParse("invalid").success).toBe(false);
    expect(PassportIdSchema.safeParse("ap_short").success).toBe(false);
    expect(PassportIdSchema.safeParse("ap_ABCDEF012345").success).toBe(false);
    expect(PassportIdSchema.safeParse("").success).toBe(false);
  });
});

describe("CreatePassportInputSchema", () => {
  it("should validate correct input", () => {
    const result = CreatePassportInputSchema.safeParse({
      name: "my-agent",
      owner_email: "owner@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid name characters", () => {
    const result = CreatePassportInputSchema.safeParse({
      name: "my agent!",
      owner_email: "owner@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty name", () => {
    const result = CreatePassportInputSchema.safeParse({
      name: "",
      owner_email: "owner@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("should reject name over 64 chars", () => {
    const result = CreatePassportInputSchema.safeParse({
      name: "a".repeat(65),
      owner_email: "owner@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid email", () => {
    const result = CreatePassportInputSchema.safeParse({
      name: "my-agent",
      owner_email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("should set default description to empty string", () => {
    const result = CreatePassportInputSchema.parse({
      name: "my-agent",
      owner_email: "owner@example.com",
    });
    expect(result.description).toBe("");
  });
});

describe("PassportIdentitySchema", () => {
  it("should validate complete identity", () => {
    const result = PassportIdentitySchema.safeParse({
      name: "test-agent",
      description: "A test agent",
      public_key: "abc123",
      created_at: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing public_key", () => {
    const result = PassportIdentitySchema.safeParse({
      name: "test-agent",
      description: "",
      created_at: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});

describe("createPassport", () => {
  const input = {
    name: "test-agent",
    description: "A test agent for unit testing",
    owner_email: "owner@example.com",
  };
  const fakePublicKey = "dGVzdC1wdWJsaWMta2V5";

  it("should create a passport with valid structure", () => {
    const passport = createPassport(input, fakePublicKey);

    expect(passport.passport_id).toMatch(/^ap_[a-f0-9]{12}$/);
    expect(passport.version).toBe("1.0");
    expect(passport.identity.name).toBe("test-agent");
    expect(passport.identity.description).toBe(
      "A test agent for unit testing",
    );
    expect(passport.identity.public_key).toBe(fakePublicKey);
    expect(passport.identity.created_at).toBeTruthy();
  });

  it("should set owner info correctly", () => {
    const passport = createPassport(input, fakePublicKey);

    expect(passport.owner.email).toBe("owner@example.com");
    expect(passport.owner.verified).toBe(false);
    expect(passport.owner.id).toBeTruthy();
  });

  it("should initialize trust at zero/unverified", () => {
    const passport = createPassport(input, fakePublicKey);

    expect(passport.trust.score).toBe(0);
    expect(passport.trust.level).toBe("unverified");
    expect(passport.trust.factors.owner_verified).toBe(false);
    expect(passport.trust.factors.successful_auths).toBe(0);
    expect(passport.trust.factors.abuse_reports).toBe(0);
  });

  it("should set vault as encrypted with AES-256-GCM", () => {
    const passport = createPassport(input, fakePublicKey);

    expect(passport.credentials_vault.encrypted).toBe(true);
    expect(passport.credentials_vault.encryption).toBe("AES-256-GCM");
    expect(passport.credentials_vault.services_count).toBe(0);
  });

  it("should set default permissions", () => {
    const passport = createPassport(input, fakePublicKey);

    expect(passport.permissions.max_registrations_per_day).toBe(10);
    expect(passport.permissions.auto_approved).toEqual(["*"]);
  });

  it("should generate unique passport IDs", () => {
    const ids = Array.from({ length: 50 }, () =>
      createPassport(input, fakePublicKey).passport_id,
    );
    const unique = new Set(ids);
    expect(unique.size).toBe(50);
  });
});
