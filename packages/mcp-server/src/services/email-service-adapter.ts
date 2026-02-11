/**
 * Email service adapter for MCP tools.
 *
 * Wraps the @agentpass/email-service EmailStore and address utilities,
 * providing a high-level API that the MCP tool handlers delegate to.
 */

import {
  EmailStore,
  generateEmailAddress,
  type IncomingEmail,
  type EmailFilter,
} from "@agentpass/email-service";

export class EmailServiceAdapter {
  private readonly store: EmailStore;

  constructor() {
    this.store = new EmailStore();
  }

  /**
   * Generate (or retrieve) the email address for a given agent name.
   */
  getEmailAddress(agentName: string): string {
    return generateEmailAddress(agentName);
  }

  /**
   * Wait for an email matching the filter to arrive at `address`.
   * Resolves with the matching email or rejects on timeout.
   */
  async waitForEmail(
    address: string,
    filter?: EmailFilter,
    timeout?: number,
  ): Promise<IncomingEmail> {
    return this.store.waitForEmail(address, filter, timeout);
  }

  /**
   * Read a single email by its ID.
   */
  readEmail(id: string): IncomingEmail | undefined {
    return this.store.getEmail(id);
  }

  /**
   * Extract a verification / confirmation URL from the email with the given ID.
   */
  extractVerificationLink(emailId: string): string | undefined {
    return this.store.extractVerificationLink(emailId);
  }

  /**
   * Extract an OTP code (4-8 digits) from the email with the given ID.
   */
  extractOtpCode(emailId: string): string | undefined {
    return this.store.extractOtpCode(emailId);
  }

  /**
   * List all emails for a given address.
   */
  listEmails(address: string): IncomingEmail[] {
    return this.store.getEmails(address);
  }

  /**
   * Add a test email to the store. Useful for testing and development.
   */
  addTestEmail(email: IncomingEmail): IncomingEmail {
    return this.store.addEmail(email);
  }
}
