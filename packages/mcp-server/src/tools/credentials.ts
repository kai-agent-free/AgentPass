/**
 * Credential management MCP tools.
 *
 * Tools: store_credential, get_credential, list_credentials
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CredentialService } from "../services/credential-service.js";

/**
 * Register all credential management tools on the given MCP server.
 */
export function registerCredentialTools(
  server: McpServer,
  credentialService: CredentialService,
): void {
  server.registerTool(
    "store_credential",
    {
      title: "Store Credential",
      description:
        "Store a service credential (username, password, email) in the agent's local vault. Credentials are associated with a passport_id and a service name.",
      inputSchema: {
        passport_id: z
          .string()
          .regex(
            /^ap_[a-z0-9]{12}$/,
            "Invalid passport ID format (expected ap_xxxxxxxxxxxx)",
          )
          .describe("The passport ID that owns this credential"),
        service: z
          .string()
          .min(1)
          .max(128)
          .describe("Service name (e.g. 'github', 'google', 'slack')"),
        username: z.string().min(1).describe("Username or login for the service"),
        password: z.string().min(1).describe("Password for the service"),
        email: z.string().email().describe("Email used for this service account"),
      },
    },
    async ({ passport_id, service, username, password, email }) => {
      const credential = credentialService.storeCredential({
        passport_id,
        service,
        username,
        password,
        email,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                service: credential.service,
                username: credential.username,
                email: credential.email,
                stored_at: credential.stored_at,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "get_credential",
    {
      title: "Get Credential",
      description:
        "Retrieve a stored credential for a specific service. Returns username, password, and email.",
      inputSchema: {
        passport_id: z
          .string()
          .regex(
            /^ap_[a-z0-9]{12}$/,
            "Invalid passport ID format (expected ap_xxxxxxxxxxxx)",
          )
          .describe("The passport ID that owns this credential"),
        service: z
          .string()
          .min(1)
          .max(128)
          .describe("Service name to look up"),
      },
    },
    async ({ passport_id, service }) => {
      const credential = credentialService.getCredential(passport_id, service);

      if (!credential) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Credential not found for service '${service}' under passport ${passport_id}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(credential, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_credentials",
    {
      title: "List Credentials",
      description:
        "List all stored credentials for an identity. Returns service names, usernames, and emails — never passwords.",
      inputSchema: {
        passport_id: z
          .string()
          .regex(
            /^ap_[a-z0-9]{12}$/,
            "Invalid passport ID format (expected ap_xxxxxxxxxxxx)",
          )
          .describe("The passport ID to list credentials for"),
      },
    },
    async ({ passport_id }) => {
      const credentials = credentialService.listCredentials(passport_id);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(credentials, null, 2),
          },
        ],
      };
    },
  );
}
