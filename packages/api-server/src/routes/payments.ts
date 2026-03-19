/**
 * CoinPay payment routes for AgentPass.
 *
 * Integrates CoinPay non-custodial crypto payments for premium features.
 */

import { Hono } from "hono";
import type { Sql } from "../db/schema.js";

const COINPAY_API_KEY = process.env.COINPAY_API_KEY || "cp_live_4ba0b240dc0a0841fcafc1c09c603f6d";
const COINPAY_BUSINESS_ID = process.env.COINPAY_BUSINESS_ID || "8a41bbee-b4d5-4cfa-9b03-3529aa79e93c";
const COINPAY_BASE_URL = process.env.COINPAY_BASE_URL || "https://coinpayportal.com/api";
const SOLANA_WALLET = "22qDVjzaR6QJ28pC6bqEKpHAwXPXA5cj4iDuRXkvC24n";

interface PaymentRequest {
  amount: number;
  currency?: string;
  blockchain?: string;
  description?: string;
  metadata?: Record<string, string>;
}

async function coinpayFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${COINPAY_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${COINPAY_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  return res.json();
}

export function createPaymentsRouter(_sql: Sql) {
  const app = new Hono();

  // Create a new payment
  app.post("/create", async (c) => {
    const body = await c.req.json<PaymentRequest>();

    const result = await coinpayFetch("/payments/create", {
      method: "POST",
      body: JSON.stringify({
        business_id: COINPAY_BUSINESS_ID,
        amount: body.amount || 10,
        currency: body.currency || "USD",
        blockchain: body.blockchain || "SOL",
        description: body.description || "AgentPass Premium",
        metadata: body.metadata || {},
      }),
    });

    return c.json(result);
  });

  // Get payment status
  app.get("/:paymentId", async (c) => {
    const paymentId = c.req.param("paymentId");
    const result = await coinpayFetch(`/payments/${paymentId}`);
    return c.json(result);
  });

  // List payments
  app.get("/", async (c) => {
    const result = await coinpayFetch(`/businesses/${COINPAY_BUSINESS_ID}/payments`);
    return c.json(result);
  });

  // Payment info / supported methods
  app.get("/methods/supported", async (c) => {
    return c.json({
      success: true,
      business: "AgentPass",
      wallet: SOLANA_WALLET,
      supported_blockchains: ["BTC", "ETH", "SOL", "USDC_SOL", "USDC_ETH", "POL", "BCH"],
      coinpay_business_id: COINPAY_BUSINESS_ID,
      pricing: {
        premium_monthly: { amount: 10, currency: "USD" },
        premium_yearly: { amount: 100, currency: "USD" },
        enterprise: { amount: 500, currency: "USD" },
      },
    });
  });

  // Webhook handler for payment confirmations
  app.post("/webhook", async (c) => {
    const body = await c.req.json();
    console.log("[CoinPay Webhook]", JSON.stringify(body));

    if (body.event === "payment.confirmed" || body.event === "payment.forwarded") {
      console.log(`Payment confirmed: ${body.payment?.id}, amount: ${body.payment?.crypto_amount}`);
    }

    return c.json({ received: true });
  });

  return app;
}
