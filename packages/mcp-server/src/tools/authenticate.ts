/**
 * Authentication MCP tool.
 *
 * Main entry point for agents to authenticate on any service.
 * Orchestrates native vs fallback auth flow.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthService } from "../services/auth-service.js";

export function registerAuthTools(
  server: McpServer,
  authService: AuthService,
): void {
  server.registerTool(
    "authenticate",
    {
      title: "Authenticate",
      description:
        "Authenticate an agent on a target service. Auto-detects native vs fallback auth. " +
        "If credentials exist, attempts login. If not, triggers registration flow. " +
        "Returns the auth result with method used and any required follow-up actions.",
      inputSchema: {
        passport_id: z
          .string()
          .regex(
            /^ap_[a-z0-9]{12}$/,
            "Invalid passport ID format (expected ap_xxxxxxxxxxxx)",
          )
          .describe("The agent's passport ID"),
        service_url: z
          .string()
          .min(1)
          .describe(
            "URL of the service to authenticate on (e.g., https://github.com)",
          ),
      },
    },
    async ({ passport_id, service_url }) => {
      const result = await authService.authenticate({
        passport_id,
        service_url,
      });

      return {
        isError: !result.success && !result.requires_action,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "check_auth_status",
    {
      title: "Check Auth Status",
      description:
        "Check if credentials exist for a service without triggering any authentication action.",
      inputSchema: {
        passport_id: z
          .string()
          .regex(/^ap_[a-z0-9]{12}$/)
          .describe("The agent's passport ID"),
        service_url: z
          .string()
          .min(1)
          .describe("URL of the service to check"),
      },
    },
    async ({ passport_id, service_url }) => {
      const status = await authService.checkAuthStatus(
        passport_id,
        service_url,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "logout",
    {
      title: "Logout",
      description:
        "Logout an agent from a service by deleting its stored credentials. " +
        "After logout, the agent will need to re-authenticate to access the service.",
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
          .describe("The service to logout from (domain name)"),
      },
    },
    async ({ passport_id, service }) => {
      const result = await authService.logout(passport_id, service);

      if (!result.success) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `No credentials found for ${passport_id} on ${service}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                passport_id,
                service,
                logged_out: true,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
