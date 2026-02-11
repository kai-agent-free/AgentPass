/**
 * Email MCP tools.
 *
 * Tools: get_email_address, wait_for_email, read_email,
 *        extract_verification_link, extract_otp_code, list_emails
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EmailServiceAdapter } from "../services/email-service-adapter.js";

/**
 * Register all email management tools on the given MCP server.
 */
export function registerEmailTools(
  server: McpServer,
  emailService: EmailServiceAdapter,
): void {
  server.registerTool(
    "get_email_address",
    {
      title: "Get Email Address",
      description:
        "Get the agent's dedicated email address. Each agent identity has a unique email address that can receive mail.",
      inputSchema: {
        passport_id: z
          .string()
          .min(1)
          .describe(
            "The passport ID (or agent name) used to derive the email address",
          ),
      },
    },
    async ({ passport_id }) => {
      try {
        const address = emailService.getEmailAddress(passport_id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ address }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to generate email address: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "wait_for_email",
    {
      title: "Wait for Email",
      description:
        "Wait for an email to arrive at the given address. Optionally filter by sender or subject. Returns the matching email when it arrives, or times out.",
      inputSchema: {
        address: z
          .string()
          .email()
          .describe("The email address to wait for mail on"),
        from: z
          .string()
          .optional()
          .describe("Filter: only match emails from this sender (substring match)"),
        subject: z
          .string()
          .optional()
          .describe(
            "Filter: only match emails whose subject contains this string",
          ),
        timeout: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Timeout in milliseconds (default: 30000)"),
      },
    },
    async ({ address, from, subject, timeout }) => {
      const filter: { from?: string; subject?: string } = {};
      if (from) filter.from = from;
      if (subject) filter.subject = subject;

      try {
        const email = await emailService.waitForEmail(
          address,
          Object.keys(filter).length > 0 ? filter : undefined,
          timeout,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  id: email.id,
                  from: email.from,
                  to: email.to,
                  subject: email.subject,
                  body: email.body,
                  received_at: email.received_at,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Wait for email failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "read_email",
    {
      title: "Read Email",
      description:
        "Read the full content of an email by its ID. Returns all fields including body and HTML.",
      inputSchema: {
        email_id: z.string().min(1).describe("The unique ID of the email to read"),
      },
    },
    async ({ email_id }) => {
      const email = emailService.readEmail(email_id);

      if (!email) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Email not found: ${email_id}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(email, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "extract_verification_link",
    {
      title: "Extract Verification Link",
      description:
        "Extract a verification or confirmation URL from an email. Searches both HTML and plain-text body for URLs containing verification-related keywords.",
      inputSchema: {
        email_id: z
          .string()
          .min(1)
          .describe("The unique ID of the email to extract the link from"),
      },
    },
    async ({ email_id }) => {
      const link = emailService.extractVerificationLink(email_id);

      if (!link) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `No verification link found in email: ${email_id}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ link }, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "extract_otp_code",
    {
      title: "Extract OTP Code",
      description:
        "Extract a one-time password (OTP) or verification code (4-8 digits) from an email body.",
      inputSchema: {
        email_id: z
          .string()
          .min(1)
          .describe("The unique ID of the email to extract the OTP from"),
      },
    },
    async ({ email_id }) => {
      const code = emailService.extractOtpCode(email_id);

      if (!code) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `No OTP code found in email: ${email_id}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ code }, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_emails",
    {
      title: "List Emails",
      description:
        "List all emails received at a given address. Returns an array of email summaries.",
      inputSchema: {
        address: z
          .string()
          .email()
          .describe("The email address to list emails for"),
      },
    },
    async ({ address }) => {
      const emails = emailService.listEmails(address);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              emails.map((e) => ({
                id: e.id,
                from: e.from,
                subject: e.subject,
                received_at: e.received_at,
              })),
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
