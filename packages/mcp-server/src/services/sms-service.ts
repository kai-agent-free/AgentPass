/**
 * SMS verification service (in-memory mock implementation).
 *
 * Handles phone number provisioning and SMS reception for agent verification.
 * Real Twilio integration will replace the mock implementation later.
 */

export interface SmsMessage {
  id: string;
  to: string;
  from: string;
  body: string;
  received_at: string;
}

/**
 * OTP extraction patterns, ordered from most specific to least specific.
 * Matches common formats: "code is 123456", "OTP: 7890", standalone 4-8 digits.
 */
const OTP_PATTERNS: RegExp[] = [
  /(?:code|otp|pin|token|password)\s*(?:is|:)\s*(\d{4,8})/i,
  /(\d{4,8})\s*(?:is your|is the)/i,
  /\b(\d{4,8})\b/,
];

export class SmsService {
  /** phone number -> passport ID */
  private readonly phoneToPassport = new Map<string, string>();
  /** passport ID -> phone number */
  private readonly passportToPhone = new Map<string, string>();
  /** phone number -> list of messages */
  private readonly inbox = new Map<string, SmsMessage[]>();
  /** message ID -> SmsMessage */
  private readonly messageById = new Map<string, SmsMessage>();
  /** Listeners waiting for an SMS on a specific number */
  private readonly waiters = new Map<
    string,
    Array<(message: SmsMessage) => void>
  >();

  /**
   * Counter used to generate deterministic mock phone numbers.
   * Starts at 1000000 so numbers look realistic.
   */
  private phoneCounter = 1000000;

  /**
   * Get (or provision) a mock phone number for the given passport ID.
   *
   * Returns the same number on repeated calls with the same passport.
   * Format: +1555XXXXXXX
   */
  getPhoneNumber(passportId: string): string {
    const existing = this.passportToPhone.get(passportId);
    if (existing) return existing;

    const number = `+1555${String(this.phoneCounter).padStart(7, "0")}`;
    this.phoneCounter++;

    this.passportToPhone.set(passportId, number);
    this.phoneToPassport.set(number, passportId);
    this.inbox.set(number, []);

    return number;
  }

  /**
   * Store an incoming SMS message and notify any waiting consumers.
   */
  addSms(message: SmsMessage): void {
    this.messageById.set(message.id, message);

    const messages = this.inbox.get(message.to) ?? [];
    messages.push(message);
    this.inbox.set(message.to, messages);

    // Resolve the first waiter for this phone number
    const waiters = this.waiters.get(message.to);
    if (waiters && waiters.length > 0) {
      const resolve = waiters.shift()!;
      resolve(message);
      if (waiters.length === 0) {
        this.waiters.delete(message.to);
      }
    }
  }

  /**
   * Wait for an SMS to arrive at the given phone number.
   *
   * If there are already unread messages, resolves with the most recent one.
   * Otherwise waits up to `timeout` ms for a new message.
   *
   * @param phoneNumber - The phone number to listen on
   * @param timeout - Timeout in milliseconds (default: 30000)
   */
  async waitForSms(
    phoneNumber: string,
    timeout = 30000,
  ): Promise<SmsMessage> {
    // Check for existing messages first
    const existing = this.inbox.get(phoneNumber);
    if (existing && existing.length > 0) {
      return existing[existing.length - 1]!;
    }

    return new Promise<SmsMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove this waiter on timeout
        const waiters = this.waiters.get(phoneNumber);
        if (waiters) {
          const idx = waiters.indexOf(resolveWrapper);
          if (idx !== -1) waiters.splice(idx, 1);
          if (waiters.length === 0) this.waiters.delete(phoneNumber);
        }
        reject(new Error(`Timed out waiting for SMS to ${phoneNumber}`));
      }, timeout);

      const resolveWrapper = (msg: SmsMessage) => {
        clearTimeout(timer);
        resolve(msg);
      };

      const waiters = this.waiters.get(phoneNumber) ?? [];
      waiters.push(resolveWrapper);
      this.waiters.set(phoneNumber, waiters);
    });
  }

  /**
   * Extract a 4-8 digit OTP code from an SMS body.
   *
   * Tries several common OTP patterns (e.g. "Your code is 123456", "OTP: 7890").
   * Returns undefined if no code is found.
   */
  extractOtpFromSms(smsId: string): string | undefined {
    const message = this.messageById.get(smsId);
    if (!message) return undefined;

    for (const pattern of OTP_PATTERNS) {
      const match = message.body.match(pattern);
      if (match?.[1]) return match[1];
    }

    return undefined;
  }

  /**
   * List all SMS messages received at the given phone number.
   */
  listSms(phoneNumber: string): SmsMessage[] {
    return this.inbox.get(phoneNumber) ?? [];
  }
}
