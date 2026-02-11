/**
 * Telegram bot notification service (in-memory mock implementation).
 *
 * Sends notifications to agent owners via Telegram: approval requests,
 * CAPTCHA screenshots, error alerts, and daily activity digests.
 * Real grammY integration will replace the mock implementation later.
 */

export interface TelegramNotification {
  id: string;
  chat_id: string;
  type:
    | "approval_request"
    | "captcha_screenshot"
    | "error_notification"
    | "activity_digest";
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

export class TelegramService {
  /** owner ID -> Telegram chat ID */
  private readonly ownerChatIds = new Map<string, string>();
  /** owner ID -> list of notifications */
  private readonly notifications = new Map<string, TelegramNotification[]>();
  /** notification ID -> notification */
  private readonly notificationById = new Map<string, TelegramNotification>();
  /** notification ID -> callback response */
  private readonly callbackResponses = new Map<string, CallbackResponse>();

  private notificationCounter = 0;

  /**
   * Register the Telegram chat ID for an owner.
   */
  setChatId(ownerId: string, chatId: string): void {
    this.ownerChatIds.set(ownerId, chatId);
  }

  /**
   * Get the registered Telegram chat ID for an owner.
   */
  getChatId(ownerId: string): string | undefined {
    return this.ownerChatIds.get(ownerId);
  }

  /**
   * Send an approval request notification to the owner.
   *
   * Creates a notification with Approve / Deny inline buttons.
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
        { text: "Approve", callback_data: `approve:${id}` },
        { text: "Deny", callback_data: `deny:${id}` },
      ],
      sent_at: new Date().toISOString(),
    };

    return this.storeNotification(ownerId, notification);
  }

  /**
   * Send a CAPTCHA screenshot to the owner for manual solving.
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
        { text: "Open Solver", callback_data: `solve:${id}` },
        { text: "Skip", callback_data: `skip:${id}` },
      ],
      sent_at: new Date().toISOString(),
    };

    return this.storeNotification(ownerId, notification);
  }

  /**
   * Send an error notification to the owner.
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
        callback_data: `${action.toLowerCase().replace(/\s+/g, "_")}:${id}`,
      })),
      sent_at: new Date().toISOString(),
    };

    return this.storeNotification(ownerId, notification);
  }

  /**
   * Send a daily activity digest to the owner.
   */
  sendActivityDigest(
    ownerId: string,
    summary: string,
  ): TelegramNotification {
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
   *
   * @param callbackId - The notification ID that the callback is for
   * @param response - The callback_data value from the pressed button
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
