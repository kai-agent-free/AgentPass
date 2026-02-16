/**
 * Identity management MCP tools.
 *
 * Tools: create_identity, list_identities, get_identity, delete_identity, revoke_identity
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
      },
    },
    async ({ name, description }) => {
      const result = await identityService.createIdentity({
        name,
        description,
      });

      const { passport, email } = result;

      const responsePayload: Record<string, unknown> = {
        passport_id: passport.passport_id,
        name: passport.identity.name,
        description: passport.identity.description,
        public_key: passport.identity.public_key,
        created_at: passport.identity.created_at,
        status: "active",
      };

      if (email) {
        responsePayload.email = email;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(responsePayload, null, 2),
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
      const identities = await identityService.listIdentities();

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
      const passport = await identityService.getIdentity(passport_id);

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

  server.registerTool(
    "delete_identity",
    {
      title: "Delete Identity",
      description:
        "Permanently delete an agent identity from the local vault. This action is irreversible — the passport and its associated key pair will be removed.",
      inputSchema: {
        passport_id: z
          .string()
          .regex(
            /^ap_[a-z0-9]{12}$/,
            "Invalid passport ID format (expected ap_xxxxxxxxxxxx)",
          )
          .describe("The passport ID to delete"),
      },
    },
    async ({ passport_id }) => {
      const deleted = await identityService.deleteIdentity(passport_id);

      if (!deleted) {
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
            text: JSON.stringify(
              {
                passport_id,
                deleted: true,
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
    "revoke_identity",
    {
      title: "Revoke Identity",
      description:
        "Revoke an agent identity. The passport is marked as revoked and can no longer be used for authentication, but is kept in the vault for audit purposes.",
      inputSchema: {
        passport_id: z
          .string()
          .regex(
            /^ap_[a-z0-9]{12}$/,
            "Invalid passport ID format (expected ap_xxxxxxxxxxxx)",
          )
          .describe("The passport ID to revoke"),
      },
    },
    async ({ passport_id }) => {
      const revoked = await identityService.revokeIdentity(passport_id);

      if (!revoked) {
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
            text: JSON.stringify(
              {
                passport_id,
                revoked: true,
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
