import { describe, it, expect, beforeEach } from "vitest";
import { SmsService } from "./sms-service.js";
import type { SmsMessage } from "./sms-service.js";

describe("SmsService", () => {
  let service: SmsService;

  beforeEach(() => {
    service = new SmsService();
  });

  describe("getPhoneNumber", () => {
    it("should return a phone number in +1555XXXXXXX format", () => {
      const number = service.getPhoneNumber("passport-001");
      expect(number).toMatch(/^\+1555\d{7}$/);
    });

    it("should return the same number for the same passport", () => {
      const first = service.getPhoneNumber("passport-001");
      const second = service.getPhoneNumber("passport-001");
      expect(first).toBe(second);
    });

    it("should return different numbers for different passports", () => {
      const a = service.getPhoneNumber("passport-001");
      const b = service.getPhoneNumber("passport-002");
      expect(a).not.toBe(b);
    });
  });

  describe("addSms + listSms", () => {
    it("should store and retrieve an SMS", () => {
      const phone = service.getPhoneNumber("passport-001");

      service.addSms({
        id: "sms-001",
        to: phone,
        from: "+12025551234",
        body: "Your code is 123456",
        received_at: "2025-02-10T10:00:00Z",
      });

      const messages = service.listSms(phone);
      expect(messages).toHaveLength(1);
      expect(messages[0]!.id).toBe("sms-001");
      expect(messages[0]!.body).toBe("Your code is 123456");
    });

    it("should store multiple SMS for the same number", () => {
      const phone = service.getPhoneNumber("passport-001");

      service.addSms({
        id: "sms-001",
        to: phone,
        from: "+12025551234",
        body: "First message",
        received_at: "2025-02-10T10:00:00Z",
      });

      service.addSms({
        id: "sms-002",
        to: phone,
        from: "+12025555678",
        body: "Second message",
        received_at: "2025-02-10T10:01:00Z",
      });

      const messages = service.listSms(phone);
      expect(messages).toHaveLength(2);
    });

    it("should return empty array for unknown number", () => {
      const messages = service.listSms("+15550000000");
      expect(messages).toEqual([]);
    });

    it("should accept SMS to numbers not yet provisioned", () => {
      service.addSms({
        id: "sms-orphan",
        to: "+15559999999",
        from: "+12025551234",
        body: "Hello",
        received_at: "2025-02-10T10:00:00Z",
      });

      const messages = service.listSms("+15559999999");
      expect(messages).toHaveLength(1);
    });
  });

  describe("waitForSms", () => {
    it("should resolve immediately if SMS already exists", async () => {
      const phone = service.getPhoneNumber("passport-001");

      service.addSms({
        id: "existing-sms",
        to: phone,
        from: "+12025551234",
        body: "Already here",
        received_at: "2025-02-10T10:00:00Z",
      });

      const sms = await service.waitForSms(phone);
      expect(sms.id).toBe("existing-sms");
    });

    it("should resolve when SMS arrives within timeout", async () => {
      const phone = service.getPhoneNumber("passport-002");

      setTimeout(() => {
        service.addSms({
          id: "delayed-sms",
          to: phone,
          from: "+12025551234",
          body: "Delayed delivery",
          received_at: new Date().toISOString(),
        });
      }, 50);

      const sms = await service.waitForSms(phone, 5000);
      expect(sms.id).toBe("delayed-sms");
    });

    it("should reject on timeout if no SMS arrives", async () => {
      const phone = service.getPhoneNumber("passport-003");

      await expect(service.waitForSms(phone, 200)).rejects.toThrow(
        "Timed out",
      );
    });

    it("should resolve multiple waiters in order", async () => {
      const phone = service.getPhoneNumber("passport-004");

      const promise1 = service.waitForSms(phone, 5000);

      // First SMS arrives
      setTimeout(() => {
        service.addSms({
          id: "sms-w1",
          to: phone,
          from: "+12025551234",
          body: "First",
          received_at: new Date().toISOString(),
        });
      }, 30);

      const sms1 = await promise1;
      expect(sms1.id).toBe("sms-w1");
    });
  });

  describe("extractOtpFromSms", () => {
    const addSmsWithBody = (id: string, body: string): SmsMessage => {
      const msg: SmsMessage = {
        id,
        to: "+15551000000",
        from: "+12025551234",
        body,
        received_at: "2025-02-10T10:00:00Z",
      };
      service.addSms(msg);
      return msg;
    };

    it("should extract OTP from 'Your code is 123456' pattern", () => {
      addSmsWithBody("otp-1", "Your verification code is 123456");
      expect(service.extractOtpFromSms("otp-1")).toBe("123456");
    });

    it("should extract OTP from 'OTP: 7890' pattern", () => {
      addSmsWithBody("otp-2", "Your OTP: 7890");
      expect(service.extractOtpFromSms("otp-2")).toBe("7890");
    });

    it("should extract OTP from 'pin is 5678' pattern", () => {
      addSmsWithBody("otp-3", "Your pin is 5678");
      expect(service.extractOtpFromSms("otp-3")).toBe("5678");
    });

    it("should extract 4-digit code", () => {
      addSmsWithBody("otp-4", "Use code: 4321 to log in");
      expect(service.extractOtpFromSms("otp-4")).toBe("4321");
    });

    it("should extract 8-digit code", () => {
      addSmsWithBody("otp-5", "Your token is 12345678");
      expect(service.extractOtpFromSms("otp-5")).toBe("12345678");
    });

    it("should extract standalone numeric code from body", () => {
      addSmsWithBody("otp-6", "935821 is your verification code");
      expect(service.extractOtpFromSms("otp-6")).toBe("935821");
    });

    it("should return undefined for messages with no OTP", () => {
      addSmsWithBody("no-otp", "Welcome to our service! Enjoy.");
      expect(service.extractOtpFromSms("no-otp")).toBeUndefined();
    });

    it("should return undefined for unknown SMS ID", () => {
      expect(service.extractOtpFromSms("nonexistent")).toBeUndefined();
    });
  });
});
