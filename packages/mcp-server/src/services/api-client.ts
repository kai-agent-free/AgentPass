/**
 * HTTP client for communicating with the AgentPass API server.
 *
 * Used by the MCP server to register passports and verify API availability.
 * Implements retry logic with max 2 retries (per PRD), skipping retries
 * on 4xx client errors.
 */

export interface ApiClientConfig {
  apiUrl: string;
  apiKey: string;
  fetchFn?: typeof fetch;
}

export interface RegisterPassportParams {
  passport_id: string;
  public_key: string;
  name: string;
  description: string;
}

export interface RegisterPassportResult {
  passport_id: string;
  email: string;
  created_at: string;
}

export interface HealthCheckResult {
  status: string;
}

export interface CreateEscalationParams {
  passport_id: string;
  captcha_type: string;
  service: string;
  screenshot?: string;
}

export interface CreateEscalationResult {
  escalation_id: string;
  status: string;
  created_at: string;
}

export interface EscalationStatus {
  id: string;
  status: "pending" | "resolved" | "timed_out";
  resolved_at: string | null;
}

export interface CreateBrowserSessionParams {
  escalation_id: string;
  page_url?: string;
  viewport_w?: number;
  viewport_h?: number;
}

export interface CreateBrowserSessionResult {
  session_id: string;
  escalation_id: string;
  created_at: string;
}

export interface BrowserCommand {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
}

/** Error thrown when the API returns an unexpected response. */
export class ApiClientError extends Error {
  readonly statusCode: number;
  readonly responseBody: string;

  constructor(message: string, statusCode: number, responseBody: string) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

/** Error thrown when all retry attempts are exhausted. */
export class ApiRetryExhaustedError extends Error {
  readonly cause: Error;

  constructor(message: string, cause: Error) {
    super(message);
    this.name = "ApiRetryExhaustedError";
    this.cause = cause;
  }
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

export class ApiClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: ApiClientConfig) {
    this.apiUrl = config.apiUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
  }

  /**
   * Register a passport on the API server.
   *
   * POST /passports with passport data. Retries up to 2 times on
   * transient failures; does not retry on 4xx client errors.
   */
  async registerPassport(
    params: RegisterPassportParams,
  ): Promise<RegisterPassportResult> {
    const url = `${this.apiUrl}/passports`;
    const body = JSON.stringify({
      passport_id: params.passport_id,
      public_key: params.public_key,
      name: params.name,
      description: params.description,
    });

    const response = await this.requestWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body,
    });

    const data = (await response.json()) as RegisterPassportResult;
    return data;
  }

  /**
   * Check API server health.
   *
   * GET /health — does not require authentication.
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const url = `${this.apiUrl}/health`;

    const response = await this.requestWithRetry(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    const data = (await response.json()) as HealthCheckResult;
    return data;
  }

  /**
   * Create a CAPTCHA escalation on the API server.
   *
   * POST /escalations with escalation data. Retries up to 2 times on
   * transient failures; does not retry on 4xx client errors.
   */
  async createEscalation(
    params: CreateEscalationParams,
  ): Promise<CreateEscalationResult> {
    const url = `${this.apiUrl}/escalations`;
    const body = JSON.stringify({
      passport_id: params.passport_id,
      captcha_type: params.captcha_type,
      service: params.service,
      screenshot: params.screenshot,
    });

    const response = await this.requestWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body,
    });

    const data = (await response.json()) as CreateEscalationResult;
    return data;
  }

  /**
   * Get the status of a CAPTCHA escalation.
   *
   * GET /escalations/:id — checks whether the owner has resolved the CAPTCHA.
   */
  async getEscalationStatus(id: string): Promise<EscalationStatus> {
    const url = `${this.apiUrl}/escalations/${encodeURIComponent(id)}`;

    const response = await this.requestWithRetry(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    const data = (await response.json()) as EscalationStatus;
    return data;
  }

  /**
   * Create a browser session for live CAPTCHA viewing.
   */
  async createBrowserSession(
    params: CreateBrowserSessionParams,
  ): Promise<CreateBrowserSessionResult> {
    const url = `${this.apiUrl}/browser-sessions`;
    const body = JSON.stringify(params);

    const response = await this.requestWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body,
    });

    return (await response.json()) as CreateBrowserSessionResult;
  }

  /**
   * Push a screenshot to the browser session.
   */
  async updateBrowserScreenshot(
    sessionId: string,
    screenshot: string,
    pageUrl?: string,
  ): Promise<void> {
    const url = `${this.apiUrl}/browser-sessions/${encodeURIComponent(sessionId)}/screenshot`;
    const body = JSON.stringify({ screenshot, page_url: pageUrl });

    await this.requestWithRetry(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body,
    });
  }

  /**
   * Get pending commands for a browser session.
   */
  async getBrowserCommands(
    sessionId: string,
    status: string = "pending",
  ): Promise<BrowserCommand[]> {
    const url = `${this.apiUrl}/browser-sessions/${encodeURIComponent(sessionId)}/commands?status=${encodeURIComponent(status)}`;

    const response = await this.requestWithRetry(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    const data = (await response.json()) as { commands: BrowserCommand[] };
    return data.commands;
  }

  /**
   * Mark a browser command as executed or failed.
   */
  async updateBrowserCommandStatus(
    sessionId: string,
    commandId: string,
    status: "executed" | "failed",
  ): Promise<void> {
    const url = `${this.apiUrl}/browser-sessions/${encodeURIComponent(sessionId)}/commands/${encodeURIComponent(commandId)}`;

    await this.requestWithRetry(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ status }),
    });
  }

  /**
   * Close a browser session.
   */
  async closeBrowserSession(sessionId: string): Promise<void> {
    const url = `${this.apiUrl}/browser-sessions/${encodeURIComponent(sessionId)}/close`;

    await this.requestWithRetry(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
  }

  /**
   * Execute a fetch request with retry logic.
   *
   * - Max 2 retries (3 total attempts)
   * - No retry on 4xx client errors (these are deterministic failures)
   * - Retries on network errors and 5xx server errors
   * - Exponential-ish delay between retries
   */
  private async requestWithRetry(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.fetchFn(url, init);

        if (response.ok) {
          return response;
        }

        const responseText = await response.text();

        // Do not retry 4xx client errors — they are deterministic
        if (response.status >= 400 && response.status < 500) {
          throw new ApiClientError(
            `API request failed with ${response.status}: ${responseText}`,
            response.status,
            responseText,
          );
        }

        // 5xx server errors are retryable
        lastError = new ApiClientError(
          `API request failed with ${response.status}: ${responseText}`,
          response.status,
          responseText,
        );
      } catch (error) {
        if (error instanceof ApiClientError && error.statusCode < 500) {
          // 4xx errors should not be retried — rethrow immediately
          throw error;
        }
        lastError =
          error instanceof Error ? error : new Error(String(error));
      }

      // Wait before retrying (skip delay on last attempt since we'll throw)
      if (attempt < MAX_RETRIES) {
        await this.delay(RETRY_DELAY_MS * (attempt + 1));
      }
    }

    throw new ApiRetryExhaustedError(
      `API request to ${url} failed after ${MAX_RETRIES + 1} attempts`,
      lastError!,
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
