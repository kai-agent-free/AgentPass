/**
 * Zod validation middleware for Hono.
 *
 * Validates the JSON request body against a Zod schema and returns
 * a consistent error response on failure.
 */

import type { Context, Next } from "hono";
import type { ZodSchema, ZodError } from "zod";

/**
 * Format Zod validation errors into a readable array of field-level messages.
 */
function formatZodErrors(
  error: ZodError,
): Array<{ field: string; message: string }> {
  return error.errors.map((e) => ({
    field: e.path.join("."),
    message: e.message,
  }));
}

/**
 * Create a Hono middleware that validates the JSON request body against
 * the provided Zod schema. On success, the parsed data is stored in
 * `c.set("validatedBody", data)`. On failure, a 400 response is returned.
 */
export function zValidator(schema: ZodSchema) {
  return async (c: Context, next: Next) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { error: "Invalid JSON body", code: "INVALID_JSON" },
        400,
      );
    }

    const result = schema.safeParse(body);
    if (!result.success) {
      return c.json(
        {
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: formatZodErrors(result.error),
        },
        400,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c as any)._validatedBody = result.data;
    await next();
  };
}

/**
 * Retrieve the validated body from the context.
 */
export function getValidatedBody<T>(c: Context): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (c as any)._validatedBody as T;
}
