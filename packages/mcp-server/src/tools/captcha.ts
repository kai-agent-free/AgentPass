/**
 * CAPTCHA escalation MCP tools.
 *
 * Tools: escalate_captcha, check_captcha_resolution
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CaptchaService } from "../services/captcha-service.js";

/**
 * Register all CAPTCHA escalation tools on the given MCP server.
 */
export function registerCaptchaTools(
  server: McpServer,
  captchaService: CaptchaService,
): void {
  server.registerTool(
    "escalate_captcha",
    {
      title: "Escalate CAPTCHA",
      description:
        "Escalate a CAPTCHA challenge to the agent owner for manual resolution. " +
        "Use this when a CAPTCHA is encountered that the agent cannot solve automatically. " +
        "Returns an escalation ID that can be polled with check_captcha_resolution.",
      inputSchema: {
        passport_id: z
          .string()
          .regex(
            /^ap_[a-z0-9]{12}$/,
            "Invalid passport ID format (expected ap_xxxxxxxxxxxx)",
          )
          .describe("The agent's passport ID"),
        service: z
          .string()
          .min(1)
          .describe("The service/domain where the CAPTCHA was encountered"),
        captcha_type: z
          .string()
          .optional()
          .default("unknown")
          .describe(
            "The type of CAPTCHA encountered (e.g., recaptcha_v2, hcaptcha, image_grid)",
          ),
        screenshot_base64: z
          .string()
          .optional()
          .describe(
            "Base64-encoded screenshot of the CAPTCHA challenge (PNG format)",
          ),
      },
    },
    async ({ passport_id, service, captcha_type, screenshot_base64 }) => {
      try {
        const screenshotBuffer = screenshot_base64
          ? Buffer.from(screenshot_base64, "base64")
          : undefined;

        const result = await captchaService.escalate(
          passport_id,
          service,
          captcha_type,
          screenshotBuffer,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  escalation_id: result.escalation_id,
                  status: result.status,
                  message:
                    "CAPTCHA escalated to owner. Poll with check_captcha_resolution.",
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
              text: `Failed to escalate CAPTCHA: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "check_captcha_resolution",
    {
      title: "Check CAPTCHA Resolution",
      description:
        "Check whether the owner has resolved a previously escalated CAPTCHA challenge. " +
        "Returns the current resolution status — resolved, still pending, or timed out.",
      inputSchema: {
        escalation_id: z
          .string()
          .min(1)
          .describe("The escalation ID returned by escalate_captcha"),
      },
    },
    async ({ escalation_id }) => {
      try {
        const result =
          await captchaService.checkResolution(escalation_id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  escalation_id,
                  resolved: result.resolved,
                  timed_out: result.timed_out ?? false,
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
              text: `Failed to check CAPTCHA resolution: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}
