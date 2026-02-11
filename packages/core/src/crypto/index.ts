// Ed25519 key management, signing, and challenge-response authentication
export {
  generateKeyPair,
  serializePublicKey,
  deserializePublicKey,
  serializePrivateKey,
  deserializePrivateKey,
} from "./keys.js";
export type { KeyPair } from "./keys.js";

export {
  sign,
  verify,
  createChallenge,
  signChallenge,
  verifyChallenge,
} from "./signing.js";

export { encrypt, decrypt, deriveVaultKey } from "./encryption.js";
