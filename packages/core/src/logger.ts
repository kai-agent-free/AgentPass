/**
 * Structured logger for AgentPass.
 *
 * Outputs newline-delimited JSON to stderr.  Respects the LOG_LEVEL
 * environment variable (debug | info | warn | error).  Sensitive
 * fields (password, privateKey, token, secret, authorization) are
 * automatically redacted before serialization.
 */

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

type LogLevel = keyof typeof LEVELS;

/** Fields whose values must never appear in log output. */
const SENSITIVE_KEYS = new Set([
  "password",
  "privateKey",
  "private_key",
  "token",
  "secret",
  "authorization",
]);

const REDACTED = "[REDACTED]";

/**
 * Recursively replace sensitive fields in a data object.
 * Returns a shallow-cloned object with redacted values.
 */
export function sanitize(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = REDACTED;
    } else if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      result[key] = sanitize(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function resolveLogLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env !== undefined && env in LEVELS) {
    return env as LogLevel;
  }
  return "info";
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/**
 * Create a named logger instance.
 *
 * ```ts
 * const log = createLogger("api-server");
 * log.info("Server started", { port: 3846 });
 * // stderr: {"level":"info","name":"api-server","message":"Server started","timestamp":"...","port":3846}
 * ```
 */
export function createLogger(name: string): Logger {
  function emit(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const threshold = LEVELS[resolveLogLevel()];
    if (LEVELS[level] < threshold) {
      return;
    }

    const entry: Record<string, unknown> = {
      level,
      name,
      message,
      timestamp: new Date().toISOString(),
      ...(data ? sanitize(data) : {}),
    };

    process.stderr.write(JSON.stringify(entry) + "\n");
  }

  return {
    debug: (msg, data) => emit("debug", msg, data),
    info: (msg, data) => emit("info", msg, data),
    warn: (msg, data) => emit("warn", msg, data),
    error: (msg, data) => emit("error", msg, data),
  };
}
