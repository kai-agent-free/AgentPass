#!/usr/bin/env node

/**
 * AgentPass MCP Server entry point.
 *
 * Starts a Model Context Protocol server over stdio transport. AI agents
 * connect to this server to manage identities, credentials, and authentication.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { IdentityService } from "./services/identity-service.js";
import { CredentialService } from "./services/credential-service.js";
import { AuthService } from "./services/auth-service.js";
import { EmailServiceAdapter } from "./services/email-service-adapter.js";
import { SmsService } from "./services/sms-service.js";
import { registerAllTools } from "./tools/index.js";

const SERVER_NAME = "agentpass";
const SERVER_VERSION = "0.1.0";

function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        "AgentPass MCP Server provides identity management and credential storage for AI agents. " +
        "Use create_identity to generate a new agent passport, list_identities to see all identities, " +
        "and store_credential / get_credential to manage service credentials.",
    },
  );

  const identityService = new IdentityService();
  const credentialService = new CredentialService();
  const authService = new AuthService(identityService, credentialService);
  const emailService = new EmailServiceAdapter();
  const smsService = new SmsService();

  registerAllTools(server, {
    identityService,
    credentialService,
    authService,
    emailService,
    smsService,
  });

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  // Graceful shutdown on SIGINT / SIGTERM
  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Fatal error starting AgentPass MCP server:", error);
  process.exit(1);
});

export { createServer };
