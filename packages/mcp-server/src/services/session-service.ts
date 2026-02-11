/**
 * Session management service.
 *
 * Tracks active sessions per agent per service.
 * Handles session expiry detection and re-login orchestration.
 */

export interface Session {
  passport_id: string;
  service: string;
  token?: string;
  cookies?: string;
  created_at: string;
  expires_at?: string;
  status: "active" | "expired" | "invalid";
}

export class SessionService {
  /** Map<passport_id:service, Session> */
  private sessions = new Map<string, Session>();
  private readonly maxRetries = 2;

  private key(passportId: string, service: string): string {
    return `${passportId}:${service}`;
  }

  /**
   * Store a new session for an agent on a service.
   */
  createSession(input: {
    passport_id: string;
    service: string;
    token?: string;
    cookies?: string;
    ttl_ms?: number;
  }): Session {
    const now = new Date();
    const session: Session = {
      passport_id: input.passport_id,
      service: input.service,
      token: input.token,
      cookies: input.cookies,
      created_at: now.toISOString(),
      expires_at: input.ttl_ms
        ? new Date(now.getTime() + input.ttl_ms).toISOString()
        : undefined,
      status: "active",
    };

    this.sessions.set(this.key(input.passport_id, input.service), session);
    return session;
  }

  /**
   * Get an existing session. Returns null if no session exists.
   * Automatically marks expired sessions.
   */
  getSession(passportId: string, service: string): Session | null {
    const session = this.sessions.get(this.key(passportId, service));
    if (!session) return null;

    if (this.isExpired(session)) {
      session.status = "expired";
    }

    return session;
  }

  /**
   * Check if a session is still valid (exists and not expired).
   */
  hasValidSession(passportId: string, service: string): boolean {
    const session = this.getSession(passportId, service);
    return session !== null && session.status === "active";
  }

  /**
   * Invalidate a session (e.g., after a 401/403 response).
   */
  invalidateSession(passportId: string, service: string): boolean {
    const session = this.sessions.get(this.key(passportId, service));
    if (!session) return false;

    session.status = "invalid";
    return true;
  }

  /**
   * Remove a session entirely.
   */
  removeSession(passportId: string, service: string): boolean {
    return this.sessions.delete(this.key(passportId, service));
  }

  /**
   * List all sessions for an agent.
   */
  listSessions(passportId: string): Session[] {
    const result: Session[] = [];
    for (const [key, session] of this.sessions) {
      if (key.startsWith(`${passportId}:`)) {
        if (this.isExpired(session)) {
          session.status = "expired";
        }
        result.push(session);
      }
    }
    return result;
  }

  /**
   * Get the max retry count for re-login attempts.
   */
  getMaxRetries(): number {
    return this.maxRetries;
  }

  private isExpired(session: Session): boolean {
    if (!session.expires_at) return false;
    return new Date(session.expires_at) < new Date();
  }
}
