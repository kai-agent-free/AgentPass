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
import { TwilioSmsService } from "./services/twilio-sms-service.js";
import type { SmsServiceInterface } from "./services/sms-service-interface.js";
import { TelegramBotService } from "./services/telegram-bot.js";
import { WebhookService } from "./services/webhook-service.js";
import { ApprovalService } from "./services/approval-service.js";
import { SessionService } from "./services/session-service.js";
import { CaptchaService } from "./services/captcha-service.js";
import { BrowserSessionService } from "./services/browser-session-service.js";
import { registerAllTools } from "./tools/index.js";
import { ApiClient } from "./services/api-client.js";
import { CredentialVault } from "@agentpass/core";
import crypto from "node:crypto";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const SERVER_NAME = "agentpass";
const SERVER_VERSION = "0.1.0";

/**
 * Get or create the vault master key.
 *
 * The master key is stored in ~/.agentpass/master.key and is used to
 * derive encryption keys for the vault. If the key file doesn't exist,
 * a new 256-bit random key is generated for AES-256-GCM encryption.
 */
function getOrCreateMasterKey(): string {
  const agentpassDir = path.join(os.homedir(), ".agentpass");
  const keyPath = path.join(agentpassDir, "master.key");

  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, "utf-8").trim();
  }

  // Create directory if it doesn't exist
  fs.mkdirSync(agentpassDir, { recursive: true });

  // Generate a dedicated 256-bit encryption key (NOT a signing key)
  const masterKey = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(keyPath, masterKey, { mode: 0o600 });

  return masterKey;
}

/**
 * Get the vault database path.
 *
 * Returns ~/.agentpass/vault.db
 */
function getVaultPath(): string {
  const agentpassDir = path.join(os.homedir(), ".agentpass");
  fs.mkdirSync(agentpassDir, { recursive: true });
  return path.join(agentpassDir, "vault.db");
}

async function createServer(): Promise<McpServer> {
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

  // Initialize the encrypted vault
  const masterKey = getOrCreateMasterKey();
  const vaultPath = getVaultPath();
  const vault = new CredentialVault(vaultPath, masterKey);
  await vault.init();

  // Initialize API client if API key is configured
  const apiBaseUrl =
    process.env.AGENTPASS_API_URL || "http://localhost:3846";
  const apiKey = process.env.AGENTPASS_API_KEY;

  let apiClient: ApiClient | undefined;
  if (apiKey) {
    apiClient = new ApiClient({ apiUrl: apiBaseUrl, apiKey });
    console.log(
      `[AgentPass MCP] API client configured (${apiBaseUrl})`,
    );
  } else {
    console.log(
      "[AgentPass MCP] WARNING: AGENTPASS_API_KEY not set — API registration is disabled. Passports will be created locally only.",
    );
  }

  // Initialize services
  const identityService = new IdentityService();
  await identityService.init(vault, apiClient);

  const credentialService = new CredentialService();
  credentialService.setVault(vault);
  const webhookService = new WebhookService();
  const approvalService = new ApprovalService(webhookService);

  // Initialize Telegram bot with approval service
  const telegramBot = new TelegramBotService({ approvalService });

  const captchaService = new CaptchaService(webhookService, apiClient);

  // Initialize browser session service if API client is available
  let browserSessionService: BrowserSessionService | undefined;
  if (apiClient) {
    browserSessionService = new BrowserSessionService(apiClient);
    captchaService.setBrowserSessionService(browserSessionService);
  }

  const authService = new AuthService(identityService, credentialService);
  const emailService = new EmailServiceAdapter();
  const sessionService = new SessionService();

  // Initialize SMS service: use Twilio if credentials are available, otherwise mock
  const smsService = createSmsService();

  registerAllTools(server, {
    identityService,
    credentialService,
    authService,
    emailService,
    smsService,
    telegramBot,
    webhookService,
    approvalService,
    sessionService,
    captchaService,
    browserSessionService,
  });

  // Graceful shutdown handler for Telegram bot and SMS service
  const originalShutdown = async () => {
    if (browserSessionService) {
      await browserSessionService.stopAll();
    }
    await telegramBot.stop();
    if ("shutdown" in smsService && typeof smsService.shutdown === "function") {
      smsService.shutdown();
    }
    await server.close();
    process.exit(0);
  };

  // Update shutdown handlers
  process.removeAllListeners("SIGINT");
  process.removeAllListeners("SIGTERM");
  process.on("SIGINT", originalShutdown);
  process.on("SIGTERM", originalShutdown);

  return server;
}

/**
 * Create SMS service based on environment configuration.
 *
 * If TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are set, use TwilioSmsService.
 * Otherwise, use mock SmsService for development.
 */
function createSmsService(): SmsServiceInterface {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumbers = process.env.TWILIO_PHONE_NUMBERS;
  const apiBaseUrl =
    process.env.AGENTPASS_API_URL || "http://localhost:3846";

  if (accountSid && authToken && phoneNumbers) {
    console.log(
      "[AgentPass MCP] Using Twilio SMS service (production mode)",
    );
    return new TwilioSmsService(
      accountSid,
      authToken,
      phoneNumbers,
      apiBaseUrl,
    );
  }

  console.log(
    "[AgentPass MCP] Using mock SMS service (development mode - set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBERS for production)",
  );
  return new SmsService();
}

async function main(): Promise<void> {
  const server = await createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Fatal error starting AgentPass MCP server:", error);
  process.exit(1);
});

export { createServer };
