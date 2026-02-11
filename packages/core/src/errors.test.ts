import { describe, it, expect } from "vitest";
import {
  AgentPassError,
  AuthenticationError,
  CryptoError,
  VaultError,
  NetworkError,
  TimeoutError,
  ValidationError,
} from "./errors.js";

describe("AgentPassError", () => {
  it("has the correct name and default code", () => {
    const err = new AgentPassError("something failed");
    expect(err.name).toBe("AgentPassError");
    expect(err.code).toBe("AGENTPASS_ERROR");
    expect(err.message).toBe("something failed");
  });

  it("accepts a custom code", () => {
    const err = new AgentPassError("oops", "CUSTOM_CODE");
    expect(err.code).toBe("CUSTOM_CODE");
  });

  it("is an instance of Error", () => {
    const err = new AgentPassError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AgentPassError);
  });

  it("toJSON returns proper structure", () => {
    const err = new AgentPassError("bad input", "BAD_INPUT");
    const json = err.toJSON();
    expect(json).toEqual({
      name: "AgentPassError",
      code: "BAD_INPUT",
      message: "bad input",
    });
  });
});

describe("AuthenticationError", () => {
  it("has the correct name and default code", () => {
    const err = new AuthenticationError("invalid token");
    expect(err.name).toBe("AuthenticationError");
    expect(err.code).toBe("AUTHENTICATION_ERROR");
  });

  it("extends AgentPassError", () => {
    const err = new AuthenticationError("fail");
    expect(err).toBeInstanceOf(AgentPassError);
    expect(err).toBeInstanceOf(Error);
  });

  it("toJSON returns correct name", () => {
    const json = new AuthenticationError("no auth").toJSON();
    expect(json.name).toBe("AuthenticationError");
    expect(json.code).toBe("AUTHENTICATION_ERROR");
  });
});

describe("CryptoError", () => {
  it("has the correct name and default code", () => {
    const err = new CryptoError("decryption failed");
    expect(err.name).toBe("CryptoError");
    expect(err.code).toBe("CRYPTO_ERROR");
  });

  it("extends AgentPassError", () => {
    expect(new CryptoError("fail")).toBeInstanceOf(AgentPassError);
  });

  it("toJSON returns correct structure", () => {
    const json = new CryptoError("bad key", "KEY_ERROR").toJSON();
    expect(json).toEqual({
      name: "CryptoError",
      code: "KEY_ERROR",
      message: "bad key",
    });
  });
});

describe("VaultError", () => {
  it("has the correct name and default code", () => {
    const err = new VaultError("vault locked");
    expect(err.name).toBe("VaultError");
    expect(err.code).toBe("VAULT_ERROR");
  });

  it("extends AgentPassError", () => {
    expect(new VaultError("fail")).toBeInstanceOf(AgentPassError);
  });
});

describe("NetworkError", () => {
  it("has the correct name and default code", () => {
    const err = new NetworkError("connection refused");
    expect(err.name).toBe("NetworkError");
    expect(err.code).toBe("NETWORK_ERROR");
  });

  it("extends AgentPassError", () => {
    expect(new NetworkError("fail")).toBeInstanceOf(AgentPassError);
  });
});

describe("TimeoutError", () => {
  it("has the correct name and default code", () => {
    const err = new TimeoutError("request timed out");
    expect(err.name).toBe("TimeoutError");
    expect(err.code).toBe("TIMEOUT_ERROR");
  });

  it("extends AgentPassError", () => {
    expect(new TimeoutError("fail")).toBeInstanceOf(AgentPassError);
  });
});

describe("ValidationError", () => {
  it("has the correct name and default code", () => {
    const err = new ValidationError("invalid email");
    expect(err.name).toBe("ValidationError");
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("extends AgentPassError", () => {
    expect(new ValidationError("fail")).toBeInstanceOf(AgentPassError);
  });

  it("toJSON returns correct structure", () => {
    const json = new ValidationError("bad data").toJSON();
    expect(json).toEqual({
      name: "ValidationError",
      code: "VALIDATION_ERROR",
      message: "bad data",
    });
  });
});

describe("error inheritance chain", () => {
  const errors = [
    new AuthenticationError("a"),
    new CryptoError("b"),
    new VaultError("c"),
    new NetworkError("d"),
    new TimeoutError("e"),
    new ValidationError("f"),
  ] as const;

  for (const err of errors) {
    it(`${err.name} instanceof AgentPassError`, () => {
      expect(err).toBeInstanceOf(AgentPassError);
    });

    it(`${err.name} instanceof Error`, () => {
      expect(err).toBeInstanceOf(Error);
    });

    it(`${err.name} has toJSON method`, () => {
      const json = err.toJSON();
      expect(json).toHaveProperty("name");
      expect(json).toHaveProperty("code");
      expect(json).toHaveProperty("message");
    });
  }
});
