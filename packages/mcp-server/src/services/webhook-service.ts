/**
 * Webhook notification service.
 *
 * Delivers events to configured webhook URLs.
 * Events: agent.registered, agent.logged_in, agent.login_failed,
 *         agent.captcha_needed, agent.approval_needed, agent.email_received,
 *         agent.error, agent.credential_stored
 */

export interface WebhookEvent {
  event: string;
  agent: {
    passport_id: string;
    name: string;
  };
  data: Record<string, unknown>;
  timestamp: string;
  actions?: WebhookAction[];
}

export interface WebhookAction {
  type: string;
  label: string;
  url?: string;
}

export interface WebhookConfig {
  url: string;
  secret?: string;
  events?: string[];
}

export class WebhookService {
  private configs: WebhookConfig[] = [];
  private eventLog: WebhookEvent[] = [];
  private deliveryLog: {
    event: string;
    url: string;
    status: "success" | "failed";
    timestamp: string;
  }[] = [];

  /**
   * Add a webhook configuration.
   */
  addWebhook(config: WebhookConfig): void {
    this.configs.push(config);
  }

  /**
   * Remove a webhook by URL.
   */
  removeWebhook(url: string): boolean {
    const index = this.configs.findIndex((c) => c.url === url);
    if (index === -1) return false;
    this.configs.splice(index, 1);
    return true;
  }

  /**
   * List all configured webhooks.
   */
  listWebhooks(): WebhookConfig[] {
    return [...this.configs];
  }

  /**
   * Emit an event and deliver to all matching webhooks.
   * Returns the number of webhooks notified.
   */
  async emit(event: WebhookEvent): Promise<number> {
    this.eventLog.push(event);

    const matchingConfigs = this.configs.filter(
      (config) =>
        !config.events || config.events.includes(event.event),
    );

    let delivered = 0;

    for (const config of matchingConfigs) {
      try {
        await this.deliver(config, event);
        this.deliveryLog.push({
          event: event.event,
          url: config.url,
          status: "success",
          timestamp: new Date().toISOString(),
        });
        delivered++;
      } catch {
        this.deliveryLog.push({
          event: event.event,
          url: config.url,
          status: "failed",
          timestamp: new Date().toISOString(),
        });
      }
    }

    return delivered;
  }

  /**
   * Create a standard webhook event.
   */
  createEvent(
    eventType: string,
    agent: { passport_id: string; name: string },
    data: Record<string, unknown> = {},
    actions?: WebhookAction[],
  ): WebhookEvent {
    return {
      event: eventType,
      agent,
      data,
      timestamp: new Date().toISOString(),
      actions,
    };
  }

  /**
   * Get recent events (for audit/debugging).
   */
  getEventLog(limit = 50): WebhookEvent[] {
    return this.eventLog.slice(-limit);
  }

  /**
   * Get delivery log.
   */
  getDeliveryLog(
    limit = 50,
  ): { event: string; url: string; status: string; timestamp: string }[] {
    return this.deliveryLog.slice(-limit);
  }

  /**
   * Deliver event to a webhook URL via HTTP POST.
   */
  private async deliver(
    config: WebhookConfig,
    event: WebhookEvent,
  ): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "AgentPass-Webhook/0.1.0",
    };

    if (config.secret) {
      headers["X-AgentPass-Secret"] = config.secret;
    }

    const response = await fetch(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Webhook delivery failed: ${response.status}`);
    }
  }
}
