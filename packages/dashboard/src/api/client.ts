/**
 * API client for AgentPass backend.
 *
 * Provides type-safe methods to interact with the API server.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3846";

export interface Passport {
  id: string;
  public_key: string;
  owner_email: string;
  name: string;
  description: string;
  trust_score: number;
  status: "active" | "revoked" | "pending";
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: string;
  passport_id: string;
  action: string;
  service: string;
  method: string;
  result: "success" | "failure" | "pending_approval" | "resolved_by_owner";
  duration_ms: number;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogResponse {
  entries: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface RegisterPassportRequest {
  public_key: string;
  owner_email: string;
  name: string;
  description?: string;
}

export interface RegisterPassportResponse {
  passport_id: string;
  created_at: string;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private onUnauthorized?: () => void;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Set the authentication token for API requests.
   */
  setToken(token: string | null) {
    this.token = token;
  }

  /**
   * Set callback to be called on 401 Unauthorized response.
   */
  setOnUnauthorized(callback: () => void) {
    this.onUnauthorized = callback;
  }

  private async fetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add Authorization header if token is set
      if (this.token) {
        headers["Authorization"] = `Bearer ${this.token}`;
      }

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...headers,
          ...options.headers,
        },
      });

      if (response.status === 401) {
        // Unauthorized - trigger callback
        if (this.onUnauthorized) {
          this.onUnauthorized();
        }
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get all passports for the owner.
   */
  async listPassports(): Promise<Passport[]> {
    const response = await this.fetch<{ passports: Passport[]; total: number; limit: number; offset: number }>("/passports");
    return response.passports;
  }

  /**
   * Get a single passport by ID.
   */
  async getPassport(id: string): Promise<Passport> {
    return this.fetch<Passport>(`/passports/${id}`);
  }

  /**
   * Register a new passport.
   */
  async registerPassport(data: RegisterPassportRequest): Promise<RegisterPassportResponse> {
    return this.fetch<RegisterPassportResponse>("/passports", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Revoke a passport.
   */
  async revokePassport(id: string): Promise<{ revoked: boolean }> {
    return this.fetch<{ revoked: boolean }>(`/passports/${id}`, {
      method: "DELETE",
    });
  }

  /**
   * Get audit log for a passport.
   */
  async getAuditLog(
    passportId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<AuditLogResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.offset) params.set("offset", String(options.offset));

    const query = params.toString();
    const path = `/passports/${passportId}/audit${query ? `?${query}` : ""}`;

    return this.fetch<AuditLogResponse>(path);
  }

  /**
   * Get all audit logs across all passports.
   */
  async getAllAuditLogs(options?: { limit?: number; offset?: number }): Promise<AuditLogResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.offset) params.set("offset", String(options.offset));

    const query = params.toString();
    const path = `/audit${query ? `?${query}` : ""}`;

    return this.fetch<AuditLogResponse>(path);
  }

  /**
   * Register a new owner account.
   */
  async register(email: string, password: string, name: string): Promise<{ owner_id: string; email: string; token: string }> {
    return this.fetch<{ owner_id: string; email: string; token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    });
  }

  /**
   * Login as an owner.
   */
  async login(email: string, password: string): Promise<{ owner_id: string; email: string; name: string; token: string }> {
    return this.fetch<{ owner_id: string; email: string; name: string; token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  /**
   * Get current owner info.
   */
  async getMe(): Promise<{ owner_id: string; email: string; name: string }> {
    return this.fetch<{ owner_id: string; email: string; name: string }>("/auth/me");
  }
}

export const apiClient = new ApiClient();
