/**
 * Production Telegram bot service using grammY.
 *
 * Provides real-time notifications to agent owners via Telegram:
 * - Approval requests with inline buttons
 * - CAPTCHA detection alerts with screenshots
 * - Error notifications with retry/skip options
 * - Registration and login success notifications
 *
 * Bot commands:
 * - /start — Welcome and link account
 * - /link <email> — Link Telegram chat to owner email
 * - /status — Show linked account info
 * - /help — List available commands
 */

import { Bot, InlineKeyboard } from "grammy";
import type { ApprovalService } from "./approval-service.js";

export interface TelegramBotConfig {
  token?: string;
  approvalService?: ApprovalService;
  mode?: "polling" | "webhook";
}

export interface TelegramNotification {
  id: string;
  chat_id: string;
  type:
    | "approval_request"
    | "captcha_screenshot"
    | "error_notification"
    | "activity_digest"
    | "registration_success"
    | "login_success";
  message: string;
  inline_buttons?: { text: string; callback_data: string }[];
  image_url?: string;
  sent_at: string;
}

export interface CallbackResponse {
  notification_id: string;
  callback_data: string;
  responded_at: string;
}

export class TelegramBotService {
  private bot?: Bot;
  private readonly enabled: boolean;
  private readonly approvalService?: ApprovalService;

  /** owner email -> Telegram chat ID */
  private readonly ownerChatIds = new Map<string, string>();
  /** chat ID -> owner email */
  private readonly chatIdToOwner = new Map<string, string>();
  /** owner ID -> list of notifications (for backward compatibility with tests) */
  private readonly notifications = new Map<string, TelegramNotification[]>();
  /** notification ID -> notification */
  private readonly notificationById = new Map<string, TelegramNotification>();
  /** notification ID -> callback response */
  private readonly callbackResponses = new Map<string, CallbackResponse>();

  private notificationCounter = 0;

  constructor(config: TelegramBotConfig = {}) {
    const token = config.token || process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      console.warn(
        "[TelegramBot] TELEGRAM_BOT_TOKEN not set — Telegram notifications disabled",
      );
      this.enabled = false;
      return;
    }

    this.enabled = true;
    this.approvalService = config.approvalService;
    this.bot = new Bot(token);

    this.setupCommands();
    this.setupCallbackHandlers();

    // Start the bot in the configured mode
    const mode = config.mode || "polling";
    if (mode === "polling") {
      this.bot
        .start({
          onStart: () => {
            console.log("[TelegramBot] Started in polling mode");
          },
        })
        .catch((error: unknown) => {
          console.error("[TelegramBot] Failed to start:", error);
        });
    }
  }

  /**
   * Check if Telegram notifications are enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Setup bot commands.
   */
  private setupCommands(): void {
    if (!this.bot) return;

    // /start command — also handles deep links like /start link_user@example.com
    this.bot.command("start", async (ctx) => {
      const payload = ctx.match?.toString().trim();

      // Handle deep link: /start link_<email>
      if (payload && payload.startsWith("link_")) {
        const email = decodeURIComponent(payload.slice(5));
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (emailRegex.test(email)) {
          const chatId = ctx.chat.id.toString();
          this.setChatId(email, chatId);

          await ctx.reply(
            `✅ *Account Linked*\n\nEmail: \`${email}\`\nChat ID: \`${chatId}\`\n\nYou'll now receive notifications for your AI agents.`,
            { parse_mode: "Markdown" },
          );
          return;
        }
      }

      const welcomeMessage = `🤖 *Welcome to AgentPass Bot*

AgentPass is the identity layer for autonomous AI agents. This bot sends you real-time notifications when your agents need your attention.

*Get Started:*
1. Link this chat to your AgentPass account using \`/link <email>\`
2. Receive instant notifications when your agents encounter:
   • Approval requests
   • CAPTCHAs
   • Errors
   • Successful registrations

*Available Commands:*
/link <email> — Link this chat to your account
/status — View account info and agent activity
/help — Show this help message

Ready to give your AI agents a passport to the internet? 🚀`;

      await ctx.reply(welcomeMessage, { parse_mode: "Markdown" });
    });

    // /link command
    this.bot.command("link", async (ctx) => {
      const email = ctx.match?.toString().trim();

      if (!email) {
        await ctx.reply(
          "❌ Please provide your email address.\n\nUsage: `/link your@email.com`",
          { parse_mode: "Markdown" },
        );
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        await ctx.reply("❌ Invalid email format. Please try again.");
        return;
      }

      const chatId = ctx.chat.id.toString();

      // Check if this email is already linked to a different chat
      const existingChatId = this.ownerChatIds.get(email);
      if (existingChatId && existingChatId !== chatId) {
        await ctx.reply(
          `⚠️ This email is already linked to another chat.\n\nTo re-link, please use /link from the original chat first to unlink.`,
        );
        return;
      }

      // Link the email to this chat
      this.setChatId(email, chatId);

      await ctx.reply(
        `✅ *Account Linked*\n\nEmail: \`${email}\`\nChat ID: \`${chatId}\`\n\nYou'll now receive notifications for your AI agents.`,
        { parse_mode: "Markdown" },
      );
    });

    // /status command
    this.bot.command("status", async (ctx) => {
      const chatId = ctx.chat.id.toString();
      const ownerEmail = this.chatIdToOwner.get(chatId);

      if (!ownerEmail) {
        await ctx.reply(
          "❌ No account linked to this chat.\n\nUse `/link <email>` to link your account.",
          { parse_mode: "Markdown" },
        );
        return;
      }

      const notificationCount = this.notifications.get(ownerEmail)?.length || 0;

      const statusMessage = `📊 *Account Status*

*Linked Email:* \`${ownerEmail}\`
*Chat ID:* \`${chatId}\`
*Total Notifications:* ${notificationCount}

Your agents are connected and ready! 🚀`;

      await ctx.reply(statusMessage, { parse_mode: "Markdown" });
    });

    // /help command
    this.bot.command("help", async (ctx) => {
      const helpMessage = `🤖 *AgentPass Bot Commands*

*Account Management:*
/start — Welcome message and setup instructions
/link <email> — Link this chat to your AgentPass account
/status — View your linked account and agent activity

*What This Bot Does:*
• Sends approval requests when agents need permission
• Alerts you when CAPTCHAs are detected
• Notifies you of errors and provides retry options
• Confirms successful registrations and logins

*Need Help?*
Visit https://github.com/romirom11/AgentPass for documentation and support.`;

      await ctx.reply(helpMessage, { parse_mode: "Markdown" });
    });
  }

  /**
   * Setup callback query handlers for inline buttons.
   */
  private setupCallbackHandlers(): void {
    if (!this.bot) return;

    this.bot.on("callback_query:data", async (ctx) => {
      const callbackData = ctx.callbackQuery.data;

      // Parse callback data format: <action>_<requestId>
      const match = callbackData.match(/^(approve|deny|retry|skip|solve)_(.+)$/);
      if (!match) {
        await ctx.answerCallbackQuery({ text: "Invalid action" });
        return;
      }

      const [, action, requestId] = match;

      // Handle the callback
      const response = this.handleCallback(requestId, callbackData);

      if (!response) {
        await ctx.answerCallbackQuery({ text: "Request not found or expired" });
        return;
      }

      // If we have an approval service, submit the response
      if (this.approvalService && (action === "approve" || action === "deny")) {
        const approved = action === "approve";
        this.approvalService.submitResponse(requestId, approved);
      }

      // Update the message to show the action was taken
      let responseEmoji = "";
      let responseText = "";

      switch (action) {
        case "approve":
          responseEmoji = "✅";
          responseText = "Approved";
          break;
        case "deny":
          responseEmoji = "❌";
          responseText = "Denied";
          break;
        case "retry":
          responseEmoji = "🔄";
          responseText = "Retrying";
          break;
        case "skip":
          responseEmoji = "⏭";
          responseText = "Skipped";
          break;
        case "solve":
          responseEmoji = "🖥";
          responseText = "Opening solver";
          break;
      }

      await ctx.answerCallbackQuery({ text: `${responseEmoji} ${responseText}` });

      // Edit the message to show it's been handled
      const originalText = ctx.callbackQuery.message?.text || "";
      const updatedText = `${originalText}\n\n${responseEmoji} *Action: ${responseText}* at ${new Date().toLocaleTimeString()}`;

      try {
        await ctx.editMessageText(updatedText, {
          parse_mode: "Markdown",
          reply_markup: undefined, // Remove buttons
        });
      } catch {
        // Message editing might fail if the message is too old or already edited
        // Silently ignore this error
      }
    });
  }

  /**
   * Register the Telegram chat ID for an owner.
   * This is the backward-compatible method for tests.
   */
  setChatId(ownerIdOrEmail: string, chatId: string): void {
    this.ownerChatIds.set(ownerIdOrEmail, chatId);
    this.chatIdToOwner.set(chatId, ownerIdOrEmail);
  }

  /**
   * Get the registered Telegram chat ID for an owner.
   */
  getChatId(ownerIdOrEmail: string): string | undefined {
    return this.ownerChatIds.get(ownerIdOrEmail);
  }

  /**
   * Send an approval request notification to the owner.
   */
  async notifyApprovalNeeded(
    ownerEmail: string,
    agentName: string,
    agentPassportId: string,
    action: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    const chatId = this.ownerChatIds.get(ownerEmail);
    if (!chatId) {
      console.warn(
        `[TelegramBot] No chat ID registered for owner: ${ownerEmail}`,
      );
      return;
    }

    const id = this.nextId();
    const timestamp = new Date().toISOString();

    // Format details
    let detailsText = "";
    for (const [key, value] of Object.entries(details)) {
      detailsText += `${key}: ${String(value)}\n`;
    }

    const message = `🤖 *Approval Required*

Agent: ${agentName} (\`${agentPassportId}\`)
Action: ${action}
${detailsText}
Timestamp: ${new Date(timestamp).toLocaleString()}

Approve this action?`;

    const keyboard = new InlineKeyboard()
      .text("✅ Approve", `approve_${id}`)
      .text("❌ Deny", `deny_${id}`);

    if (this.bot && this.enabled) {
      try {
        await this.bot.api.sendMessage(chatId, message, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
      } catch (error) {
        console.error("[TelegramBot] Failed to send approval request:", error);
      }
    }

    // Store for backward compatibility with tests
    const notification: TelegramNotification = {
      id,
      chat_id: chatId,
      type: "approval_request",
      message,
      inline_buttons: [
        { text: "✅ Approve", callback_data: `approve_${id}` },
        { text: "❌ Deny", callback_data: `deny_${id}` },
      ],
      sent_at: timestamp,
    };

    this.storeNotification(ownerEmail, notification);
  }

  /**
   * Send a CAPTCHA detection alert to the owner.
   */
  async notifyCaptchaDetected(
    ownerEmail: string,
    agentName: string,
    agentPassportId: string,
    service: string,
    captchaType: string,
    screenshotBuffer?: Buffer,
  ): Promise<void> {
    const chatId = this.ownerChatIds.get(ownerEmail);
    if (!chatId) {
      console.warn(
        `[TelegramBot] No chat ID registered for owner: ${ownerEmail}`,
      );
      return;
    }

    const id = this.nextId();
    const timestamp = new Date().toISOString();

    const message = `🧩 *CAPTCHA Detected*

Agent: ${agentName} (\`${agentPassportId}\`)
Service: ${service}
Type: ${captchaType}
Timestamp: ${new Date(timestamp).toLocaleString()}

Agent needs your help to continue.`;

    const keyboard = new InlineKeyboard()
      .text("🖥 Open Dashboard", `solve_${id}`)
      .text("⏭ Skip", `skip_${id}`);

    if (this.bot && this.enabled) {
      try {
        if (screenshotBuffer) {
          // Send with photo
          // grammY expects InputFile - we can use Buffer directly
          // Create a temporary file URL or use InputFile
          // For now, just send text notification without image
          // TODO: Implement proper image upload with InputFile
          await this.bot.api.sendMessage(chatId, message, {
            parse_mode: "Markdown",
            reply_markup: keyboard,
          });
        } else {
          // Send text only
          await this.bot.api.sendMessage(chatId, message, {
            parse_mode: "Markdown",
            reply_markup: keyboard,
          });
        }
      } catch (error) {
        console.error("[TelegramBot] Failed to send CAPTCHA alert:", error);
      }
    }

    // Store for backward compatibility
    const notification: TelegramNotification = {
      id,
      chat_id: chatId,
      type: "captcha_screenshot",
      message,
      inline_buttons: [
        { text: "🖥 Open Dashboard", callback_data: `solve_${id}` },
        { text: "⏭ Skip", callback_data: `skip_${id}` },
      ],
      sent_at: timestamp,
    };

    this.storeNotification(ownerEmail, notification);
  }

  /**
   * Send an error notification to the owner.
   */
  async notifyError(
    ownerEmail: string,
    agentName: string,
    agentPassportId: string,
    service: string,
    error: string,
  ): Promise<void> {
    const chatId = this.ownerChatIds.get(ownerEmail);
    if (!chatId) {
      console.warn(
        `[TelegramBot] No chat ID registered for owner: ${ownerEmail}`,
      );
      return;
    }

    const id = this.nextId();
    const timestamp = new Date().toISOString();

    const message = `⚠️ *Authentication Failed*

Agent: ${agentName} (\`${agentPassportId}\`)
Service: ${service}
Error: ${error}
Timestamp: ${new Date(timestamp).toLocaleString()}

What would you like to do?`;

    const keyboard = new InlineKeyboard()
      .text("🔄 Retry", `retry_${id}`)
      .text("⏭ Skip", `skip_${id}`);

    if (this.bot && this.enabled) {
      try {
        await this.bot.api.sendMessage(chatId, message, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
      } catch (error) {
        console.error("[TelegramBot] Failed to send error notification:", error);
      }
    }

    // Store for backward compatibility
    const notification: TelegramNotification = {
      id,
      chat_id: chatId,
      type: "error_notification",
      message,
      inline_buttons: [
        { text: "🔄 Retry", callback_data: `retry_${id}` },
        { text: "⏭ Skip", callback_data: `skip_${id}` },
      ],
      sent_at: timestamp,
    };

    this.storeNotification(ownerEmail, notification);
  }

  /**
   * Send a registration success notification.
   */
  async notifyRegistration(
    ownerEmail: string,
    agentName: string,
    agentPassportId: string,
    service: string,
    method: "native" | "fallback",
    duration?: number,
  ): Promise<void> {
    const chatId = this.ownerChatIds.get(ownerEmail);
    if (!chatId) {
      console.warn(
        `[TelegramBot] No chat ID registered for owner: ${ownerEmail}`,
      );
      return;
    }

    const id = this.nextId();
    const timestamp = new Date().toISOString();

    const durationText = duration
      ? `Duration: ${duration.toFixed(1)}s`
      : "";

    const message = `✅ *New Registration*

Agent: ${agentName} (\`${agentPassportId}\`)
Service: ${service}
Method: ${method === "native" ? "Native (AgentPass SDK)" : "Fallback (browser automation)"}
${durationText}
Timestamp: ${new Date(timestamp).toLocaleString()}`;

    if (this.bot && this.enabled) {
      try {
        await this.bot.api.sendMessage(chatId, message, {
          parse_mode: "Markdown",
        });
      } catch (error) {
        console.error(
          "[TelegramBot] Failed to send registration notification:",
          error,
        );
      }
    }

    // Store for backward compatibility
    const notification: TelegramNotification = {
      id,
      chat_id: chatId,
      type: "registration_success",
      message,
      sent_at: timestamp,
    };

    this.storeNotification(ownerEmail, notification);
  }

  /**
   * Send a login success notification.
   */
  async notifyLogin(
    ownerEmail: string,
    agentName: string,
    agentPassportId: string,
    service: string,
  ): Promise<void> {
    const chatId = this.ownerChatIds.get(ownerEmail);
    if (!chatId) {
      console.warn(
        `[TelegramBot] No chat ID registered for owner: ${ownerEmail}`,
      );
      return;
    }

    const id = this.nextId();
    const timestamp = new Date().toISOString();

    const message = `🔐 *Login Success*

Agent: ${agentName} (\`${agentPassportId}\`)
Service: ${service}
Timestamp: ${new Date(timestamp).toLocaleString()}`;

    if (this.bot && this.enabled) {
      try {
        await this.bot.api.sendMessage(chatId, message, {
          parse_mode: "Markdown",
        });
      } catch (error) {
        console.error("[TelegramBot] Failed to send login notification:", error);
      }
    }

    // Store for backward compatibility
    const notification: TelegramNotification = {
      id,
      chat_id: chatId,
      type: "login_success",
      message,
      sent_at: timestamp,
    };

    this.storeNotification(ownerEmail, notification);
  }

  /**
   * Send an approval request (backward compatible with old interface).
   */
  sendApprovalRequest(
    ownerId: string,
    agentName: string,
    action: string,
    details: string,
  ): TelegramNotification {
    const chatId = this.ownerChatIds.get(ownerId);
    if (!chatId) {
      throw new Error(`No Telegram chat ID registered for owner: ${ownerId}`);
    }

    const id = this.nextId();
    const notification: TelegramNotification = {
      id,
      chat_id: chatId,
      type: "approval_request",
      message: `Approval needed for agent "${agentName}"\n\nAction: ${action}\nDetails: ${details}`,
      inline_buttons: [
        { text: "Approve", callback_data: `approve_${id}` },
        { text: "Deny", callback_data: `deny_${id}` },
      ],
      sent_at: new Date().toISOString(),
    };

    return this.storeNotification(ownerId, notification);
  }

  /**
   * Send a CAPTCHA screenshot (backward compatible with old interface).
   */
  sendCaptchaScreenshot(
    ownerId: string,
    agentName: string,
    captchaType: string,
    screenshotUrl: string,
  ): TelegramNotification {
    const chatId = this.ownerChatIds.get(ownerId);
    if (!chatId) {
      throw new Error(`No Telegram chat ID registered for owner: ${ownerId}`);
    }

    const id = this.nextId();
    const notification: TelegramNotification = {
      id,
      chat_id: chatId,
      type: "captcha_screenshot",
      message: `CAPTCHA encountered by agent "${agentName}"\n\nType: ${captchaType}\nPlease solve the CAPTCHA shown below.`,
      image_url: screenshotUrl,
      inline_buttons: [
        { text: "Open Solver", callback_data: `solve_${id}` },
        { text: "Skip", callback_data: `skip_${id}` },
      ],
      sent_at: new Date().toISOString(),
    };

    return this.storeNotification(ownerId, notification);
  }

  /**
   * Send an error notification (backward compatible with old interface).
   */
  sendErrorNotification(
    ownerId: string,
    agentName: string,
    error: string,
    actions: string[],
  ): TelegramNotification {
    const chatId = this.ownerChatIds.get(ownerId);
    if (!chatId) {
      throw new Error(`No Telegram chat ID registered for owner: ${ownerId}`);
    }

    const id = this.nextId();
    const notification: TelegramNotification = {
      id,
      chat_id: chatId,
      type: "error_notification",
      message: `Error from agent "${agentName}"\n\n${error}`,
      inline_buttons: actions.map((action) => ({
        text: action,
        callback_data: `${action.toLowerCase().replace(/\s+/g, "_")}_${id}`,
      })),
      sent_at: new Date().toISOString(),
    };

    return this.storeNotification(ownerId, notification);
  }

  /**
   * Send a daily activity digest (backward compatible with old interface).
   */
  sendActivityDigest(ownerId: string, summary: string): TelegramNotification {
    const chatId = this.ownerChatIds.get(ownerId);
    if (!chatId) {
      throw new Error(`No Telegram chat ID registered for owner: ${ownerId}`);
    }

    const id = this.nextId();
    const notification: TelegramNotification = {
      id,
      chat_id: chatId,
      type: "activity_digest",
      message: `Daily Activity Digest\n\n${summary}`,
      sent_at: new Date().toISOString(),
    };

    return this.storeNotification(ownerId, notification);
  }

  /**
   * Get all notifications sent to an owner.
   */
  getNotifications(ownerId: string): TelegramNotification[] {
    return this.notifications.get(ownerId) ?? [];
  }

  /**
   * Process an inline button callback response.
   */
  handleCallback(
    callbackId: string,
    response: string,
  ): CallbackResponse | undefined {
    const notification = this.notificationById.get(callbackId);
    if (!notification) return undefined;

    // Verify the callback_data is valid for this notification
    const validCallbacks = notification.inline_buttons?.map(
      (b) => b.callback_data,
    );
    if (validCallbacks && !validCallbacks.includes(response)) {
      return undefined;
    }

    const callbackResponse: CallbackResponse = {
      notification_id: callbackId,
      callback_data: response,
      responded_at: new Date().toISOString(),
    };

    this.callbackResponses.set(callbackId, callbackResponse);
    return callbackResponse;
  }

  /**
   * Get the callback response for a notification, if any.
   */
  getCallbackResponse(notificationId: string): CallbackResponse | undefined {
    return this.callbackResponses.get(notificationId);
  }

  /**
   * Stop the bot gracefully.
   */
  async stop(): Promise<void> {
    if (this.bot && this.enabled) {
      await this.bot.stop();
      console.log("[TelegramBot] Stopped");
    }
  }

  /**
   * Get the webhook URL for production mode.
   */
  getWebhookUrl(domain: string): string {
    return `https://${domain}/telegram/webhook`;
  }

  /**
   * Set webhook for production mode.
   */
  async setWebhook(url: string): Promise<void> {
    if (!this.bot || !this.enabled) {
      throw new Error("Telegram bot is not enabled");
    }

    await this.bot.api.setWebhook(url);
    console.log(`[TelegramBot] Webhook set to ${url}`);
  }

  /**
   * Get the grammY bot instance for webhook handling.
   */
  getBot(): Bot | undefined {
    return this.bot;
  }

  private nextId(): string {
    this.notificationCounter++;
    return `tg_${this.notificationCounter}`;
  }

  private storeNotification(
    ownerId: string,
    notification: TelegramNotification,
  ): TelegramNotification {
    this.notificationById.set(notification.id, notification);

    const list = this.notifications.get(ownerId) ?? [];
    list.push(notification);
    this.notifications.set(ownerId, list);

    return notification;
  }
}
