/**
 * Approval MCP tools.
 *
 * Tools: request_approval, check_approval, set_permission_level
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApprovalService } from "../services/approval-service.js";

/**
 * Register all approval management tools on the given MCP server.
 */
export function registerApprovalTools(
  server: McpServer,
  approvalService: ApprovalService,
): void {
  server.registerTool(
    "request_approval",
    {
      title: "Request Approval",
      description:
        "Request owner approval for an agent action. Depending on the domain's permission level, " +
        "the request may be auto-approved, blocked, or sent to the owner for manual approval. " +
        "Returns the approval request ID and current status.",
      inputSchema: {
        passport_id: z
          .string()
          .regex(
            /^ap_[a-z0-9]{12}$/,
            "Invalid passport ID format (expected ap_xxxxxxxxxxxx)",
          )
          .describe("The agent's passport ID"),
        action: z
          .string()
          .min(1)
          .describe("Description of what the agent wants to do"),
        service: z
          .string()
          .optional()
          .describe("The service/domain this action relates to"),
        details: z
          .string()
          .optional()
          .describe("Additional details about the action"),
      },
    },
    async ({ passport_id, action, service, details }) => {
      try {
        const result = await approvalService.requestApproval({
          passportId: passport_id,
          agentName: passport_id,
          action,
          domain: service,
          details: details ? { description: details } : {},
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  approval_id: result.approvalId,
                  approved: result.approved,
                  method: result.method,
                  reason: result.reason,
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
              text: `Failed to request approval: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "check_approval",
    {
      title: "Check Approval",
      description:
        "Check the current status of an approval request. Returns whether the request is pending, approved, or denied.",
      inputSchema: {
        approval_id: z
          .string()
          .min(1)
          .describe("The approval request ID to check"),
      },
    },
    async ({ approval_id }) => {
      const approval = approvalService.getApproval(approval_id);

      if (!approval) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Approval request not found: ${approval_id}`,
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
                id: approval.id,
                status: approval.status,
                action: approval.request.action,
                domain: approval.request.domain,
                reason: approval.reason,
                created_at: approval.created_at,
                resolved_at: approval.resolved_at,
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
    "set_permission_level",
    {
      title: "Set Permission Level",
      description:
        "Configure the permission level for a domain. Controls whether agent actions on this domain " +
        "are auto-approved, require owner approval, or are blocked entirely.",
      inputSchema: {
        domain: z
          .string()
          .min(1)
          .describe("The domain to configure (e.g., github.com)"),
        level: z
          .enum(["ask_always", "ask_first_time", "auto_approve"])
          .describe(
            "Permission level: ask_always (requires_approval), ask_first_time (requires_approval), or auto_approve (auto_approved)",
          ),
      },
    },
    async ({ domain, level }) => {
      const levelMap: Record<string, "auto_approved" | "requires_approval" | "blocked"> = {
        ask_always: "requires_approval",
        ask_first_time: "requires_approval",
        auto_approve: "auto_approved",
      };

      const internalLevel = levelMap[level];
      approvalService.setPermissionLevel(domain, internalLevel);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                domain,
                level,
                internal_level: internalLevel,
                updated: true,
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
