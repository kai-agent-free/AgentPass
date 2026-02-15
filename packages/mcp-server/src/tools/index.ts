/**
 * Tool registration module.
 *
 * Aggregates all tool registration functions and applies them to the MCP server.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IdentityService } from "../services/identity-service.js";
import type { CredentialService } from "../services/credential-service.js";
import type { AuthService } from "../services/auth-service.js";
import type { EmailServiceAdapter } from "../services/email-service-adapter.js";
import type { SmsServiceInterface } from "../services/sms-service-interface.js";
import type { TelegramBotService } from "../services/telegram-bot.js";
import type { WebhookService } from "../services/webhook-service.js";
import type { ApprovalService } from "../services/approval-service.js";
import type { SessionService } from "../services/session-service.js";
import type { CaptchaService } from "../services/captcha-service.js";
import type { BrowserSessionService } from "../services/browser-session-service.js";
import { registerIdentityTools } from "./identity.js";
import { registerCredentialTools } from "./credentials.js";
import { registerAuthTools } from "./authenticate.js";
import { registerEmailTools } from "./email.js";
import { registerSmsTools } from "./sms.js";
import { registerApprovalTools } from "./approval.js";
import { registerSessionTools } from "./session.js";
import { registerCaptchaTools } from "./captcha.js";

/**
 * Register all AgentPass MCP tools on the server.
 *
 * Each tool module gets its own service instance. Services are singletons
 * scoped to the server lifetime.
 */
export function registerAllTools(
  server: McpServer,
  services: {
    identityService: IdentityService;
    credentialService: CredentialService;
    authService: AuthService;
    emailService: EmailServiceAdapter;
    smsService: SmsServiceInterface;
    telegramBot?: TelegramBotService;
    webhookService?: WebhookService;
    approvalService?: ApprovalService;
    sessionService: SessionService;
    captchaService?: CaptchaService;
    browserSessionService?: BrowserSessionService;
  },
): void {
  registerIdentityTools(server, services.identityService);
  registerCredentialTools(server, services.credentialService);
  registerAuthTools(server, services.authService);
  registerEmailTools(server, services.emailService);
  registerSmsTools(server, services.smsService);
  if (services.approvalService) {
    registerApprovalTools(server, services.approvalService);
  }
  registerSessionTools(server, services.sessionService);
  if (services.captchaService) {
    registerCaptchaTools(server, services.captchaService, services.browserSessionService);
  }
}
