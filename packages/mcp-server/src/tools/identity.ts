/**
 * Identity management MCP tools.
 *
 * Tools: create_identity, list_identities, get_identity
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IdentityService } from "../services/identity-service.js";

/**
 * Register all identity management tools on the given MCP server.
 */
export function registerIdentityTools(
  server: McpServer,
  identityService: IdentityService,
): void {
  server.registerTool(
    "create_identity",
    {
      title: "Create Identity",
      description:
        "Create a new agent identity (passport). Generates an Ed25519 key pair and returns the passport with public info. The private key is stored locally and never exposed.",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .max(64)
          .regex(
            /^[a-zA-Z0-9_-]+$/,
            "Name must contain only alphanumeric characters, hyphens, and underscores",
          )
          .describe("Unique name for the agent identity"),
        description: z
          .string()
          .max(256)
          .optional()
          .describe("Human-readable description of the agent"),
        owner_email: z
          .string()
          .email()
          .describe("Email address of the agent owner"),
      },
    },
    async ({ name, description, owner_email }) => {
      const { passport } = identityService.createIdentity({
        name,
        description,
        owner_email,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                passport_id: passport.passport_id,
                name: passport.identity.name,
                description: passport.identity.description,
                public_key: passport.identity.public_key,
                owner_email: passport.owner.email,
                created_at: passport.identity.created_at,
                status: "active",
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
    "list_identities",
    {
      title: "List Identities",
      description:
        "List all agent identities stored locally. Returns passport_id, name, status, and created_at for each identity.",
    },
    async () => {
      const identities = identityService.listIdentities();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(identities, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "get_identity",
    {
      title: "Get Identity",
      description:
        "Get full passport details for a specific agent identity. Returns all public info but never exposes the private key.",
      inputSchema: {
        passport_id: z
          .string()
          .regex(
            /^ap_[a-z0-9]{12}$/,
            "Invalid passport ID format (expected ap_xxxxxxxxxxxx)",
          )
          .describe("The passport ID to look up"),
      },
    },
    async ({ passport_id }) => {
      const passport = identityService.getIdentity(passport_id);

      if (!passport) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Identity not found: ${passport_id}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(passport, null, 2),
          },
        ],
      };
    },
  );
}
