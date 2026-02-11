/**
 * SMS MCP tools.
 *
 * Tools: get_phone_number, wait_for_sms, extract_otp_from_sms
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SmsService } from "../services/sms-service.js";

/**
 * Register all SMS verification tools on the given MCP server.
 */
export function registerSmsTools(
  server: McpServer,
  smsService: SmsService,
): void {
  server.registerTool(
    "get_phone_number",
    {
      title: "Get Phone Number",
      description:
        "Get the agent's dedicated phone number for SMS verification. Each passport gets a unique phone number that can receive SMS messages.",
      inputSchema: {
        passport_id: z
          .string()
          .min(1)
          .describe(
            "The passport ID of the agent to provision a phone number for",
          ),
      },
    },
    async ({ passport_id }) => {
      try {
        const phone_number = smsService.getPhoneNumber(passport_id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ phone_number }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to get phone number: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "wait_for_sms",
    {
      title: "Wait for SMS",
      description:
        "Wait for an SMS message to arrive at the given phone number. Returns the message when it arrives, or times out.",
      inputSchema: {
        phone_number: z
          .string()
          .min(1)
          .describe("The phone number to wait for SMS on (e.g. +15551000000)"),
        timeout: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Timeout in milliseconds (default: 30000)"),
      },
    },
    async ({ phone_number, timeout }) => {
      try {
        const sms = await smsService.waitForSms(phone_number, timeout);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  id: sms.id,
                  from: sms.from,
                  to: sms.to,
                  body: sms.body,
                  received_at: sms.received_at,
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
              text: `Wait for SMS failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "extract_otp_from_sms",
    {
      title: "Extract OTP from SMS",
      description:
        "Extract a one-time password (OTP) or verification code (4-8 digits) from an SMS message body.",
      inputSchema: {
        sms_id: z
          .string()
          .min(1)
          .describe("The unique ID of the SMS message to extract the OTP from"),
      },
    },
    async ({ sms_id }) => {
      const code = smsService.extractOtpFromSms(sms_id);

      if (!code) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `No OTP code found in SMS: ${sms_id}`,
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
}
