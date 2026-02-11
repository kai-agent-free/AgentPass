/**
 * Custom error classes for AgentPass.
 *
 * Every error carries a machine-readable `code` string and
 * a `toJSON()` method for structured logging.
 */

export class AgentPassError extends Error {
  readonly code: string;

  constructor(message: string, code: string = "AGENTPASS_ERROR") {
    super(message);
    this.name = "AgentPassError";
    this.code = code;
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
    };
  }
}

export class AuthenticationError extends AgentPassError {
  constructor(message: string, code: string = "AUTHENTICATION_ERROR") {
    super(message, code);
    this.name = "AuthenticationError";
  }
}

export class CryptoError extends AgentPassError {
  constructor(message: string, code: string = "CRYPTO_ERROR") {
    super(message, code);
    this.name = "CryptoError";
  }
}

export class VaultError extends AgentPassError {
  constructor(message: string, code: string = "VAULT_ERROR") {
    super(message, code);
    this.name = "VaultError";
  }
}

export class NetworkError extends AgentPassError {
  constructor(message: string, code: string = "NETWORK_ERROR") {
    super(message, code);
    this.name = "NetworkError";
  }
}

export class TimeoutError extends AgentPassError {
  constructor(message: string, code: string = "TIMEOUT_ERROR") {
    super(message, code);
    this.name = "TimeoutError";
  }
}

export class ValidationError extends AgentPassError {
  constructor(message: string, code: string = "VALIDATION_ERROR") {
    super(message, code);
    this.name = "ValidationError";
  }
}
