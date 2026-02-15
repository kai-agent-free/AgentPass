/**
 * Session management MCP tools.
 *
 * Tools: get_session, list_sessions, invalidate_session
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionService } from "../services/session-service.js";

/**
 * Register all session management tools on the given MCP server.
 */
export function registerSessionTools(
  server: McpServer,
  sessionService: SessionService,
): void {
  server.registerTool(
    "get_session",
    {
      title: "Get Session",
      description:
        "Get the active session for an agent on a specific service. Returns session details " +
        "including status (active, expired, invalid) or indicates if no session exists.",
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
          .describe("The service to check for an active session"),
      },
    },
    async ({ passport_id, service }) => {
      const session = sessionService.getSession(passport_id, service);

      if (!session) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  passport_id,
                  service,
                  status: "no active session",
                },
                null,
                2,
              ),
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
                passport_id: session.passport_id,
                service: session.service,
                status: session.status,
                created_at: session.created_at,
                expires_at: session.expires_at,
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
    "list_sessions",
    {
      title: "List Sessions",
      description:
        "List all sessions for an agent across all services. Returns each session's service, status, and timestamps.",
      inputSchema: {
        passport_id: z
          .string()
          .regex(
            /^ap_[a-z0-9]{12}$/,
            "Invalid passport ID format (expected ap_xxxxxxxxxxxx)",
          )
          .describe("The agent's passport ID"),
      },
    },
    async ({ passport_id }) => {
      const sessions = sessionService.listSessions(passport_id);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              sessions.map((s) => ({
                passport_id: s.passport_id,
                service: s.service,
                status: s.status,
                created_at: s.created_at,
                expires_at: s.expires_at,
              })),
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "invalidate_session",
    {
      title: "Invalidate Session",
      description:
        "Invalidate an active session for an agent on a specific service. Marks the session as invalid, " +
        "which will trigger re-authentication on next access.",
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
          .describe("The service whose session should be invalidated"),
      },
    },
    async ({ passport_id, service }) => {
      const invalidated = sessionService.invalidateSession(
        passport_id,
        service,
      );

      if (!invalidated) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `No session found for ${passport_id} on ${service}`,
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
                invalidated: true,
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
