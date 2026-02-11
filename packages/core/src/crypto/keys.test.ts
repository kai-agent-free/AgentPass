import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  generateKeyPair,
  serializePublicKey,
  deserializePublicKey,
  serializePrivateKey,
  deserializePrivateKey,
} from "./keys.js";

describe("generateKeyPair", () => {
  it("returns an object with publicKey and privateKey strings", () => {
    const kp = generateKeyPair();
    expect(typeof kp.publicKey).toBe("string");
    expect(typeof kp.privateKey).toBe("string");
    expect(kp.publicKey.length).toBeGreaterThan(0);
    expect(kp.privateKey.length).toBeGreaterThan(0);
  });

  it("produces base64url-encoded strings (no +, /, or = characters)", () => {
    const kp = generateKeyPair();
    const base64urlPattern = /^[A-Za-z0-9_-]+$/;
    expect(kp.publicKey).toMatch(base64urlPattern);
    expect(kp.privateKey).toMatch(base64urlPattern);
  });

  it("generates unique key pairs on each call", () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
    expect(kp1.privateKey).not.toBe(kp2.privateKey);
  });

  it("produces keys that can be deserialized into valid KeyObjects", () => {
    const kp = generateKeyPair();
    const pubKey = deserializePublicKey(kp.publicKey);
    const privKey = deserializePrivateKey(kp.privateKey);

    expect(pubKey.type).toBe("public");
    expect(pubKey.asymmetricKeyType).toBe("ed25519");
    expect(privKey.type).toBe("private");
    expect(privKey.asymmetricKeyType).toBe("ed25519");
  });
});

describe("serializePublicKey / deserializePublicKey", () => {
  it("round-trips a public key through serialize and deserialize", () => {
    const { publicKey: originalKeyObject } = crypto.generateKeyPairSync(
      "ed25519",
    );

    const serialized = serializePublicKey(originalKeyObject);
    const restored = deserializePublicKey(serialized);

    // Compare the raw DER bytes to confirm exact equality
    const originalDer = originalKeyObject.export({ type: "spki", format: "der" });
    const restoredDer = restored.export({ type: "spki", format: "der" });
    expect(Buffer.from(restoredDer).equals(Buffer.from(originalDer))).toBe(true);
  });

  it("returns base64url string from serializePublicKey", () => {
    const { publicKey } = crypto.generateKeyPairSync("ed25519");
    const serialized = serializePublicKey(publicKey);
    expect(serialized).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns an Ed25519 KeyObject from deserializePublicKey", () => {
    const kp = generateKeyPair();
    const keyObj = deserializePublicKey(kp.publicKey);
    expect(keyObj.type).toBe("public");
    expect(keyObj.asymmetricKeyType).toBe("ed25519");
  });
});

describe("serializePrivateKey / deserializePrivateKey", () => {
  it("round-trips a private key through serialize and deserialize", () => {
    const { privateKey: originalKeyObject } = crypto.generateKeyPairSync(
      "ed25519",
    );

    const serialized = serializePrivateKey(originalKeyObject);
    const restored = deserializePrivateKey(serialized);

    const originalDer = originalKeyObject.export({
      type: "pkcs8",
      format: "der",
    });
    const restoredDer = restored.export({ type: "pkcs8", format: "der" });
    expect(Buffer.from(restoredDer).equals(Buffer.from(originalDer))).toBe(true);
  });

  it("returns base64url string from serializePrivateKey", () => {
    const { privateKey } = crypto.generateKeyPairSync("ed25519");
    const serialized = serializePrivateKey(privateKey);
    expect(serialized).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns an Ed25519 KeyObject from deserializePrivateKey", () => {
    const kp = generateKeyPair();
    const keyObj = deserializePrivateKey(kp.privateKey);
    expect(keyObj.type).toBe("private");
    expect(keyObj.asymmetricKeyType).toBe("ed25519");
  });
});

describe("cross-compatibility between generateKeyPair and serialize/deserialize", () => {
  it("generateKeyPair output can sign data that deserializePublicKey verifies", () => {
    const kp = generateKeyPair();
    const privKey = deserializePrivateKey(kp.privateKey);
    const pubKey = deserializePublicKey(kp.publicKey);

    const data = Buffer.from("test message");
    const signature = crypto.sign(null, data, privKey);
    const valid = crypto.verify(null, data, pubKey, signature);
    expect(valid).toBe(true);
  });

  it("re-serialization of deserialized keys produces identical strings", () => {
    const kp = generateKeyPair();

    const pubKeyObj = deserializePublicKey(kp.publicKey);
    const privKeyObj = deserializePrivateKey(kp.privateKey);

    expect(serializePublicKey(pubKeyObj)).toBe(kp.publicKey);
    expect(serializePrivateKey(privKeyObj)).toBe(kp.privateKey);
  });
});
