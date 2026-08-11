import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export function hashPayload(payload: unknown): string {
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
  return createHash("sha256").update(raw).digest("hex").slice(0, 64);
}

/**
 * Claim exclusive processing for a gateway event.
 * Returns false when the event was already processed (or is in-flight).
 */
export async function claimPaymentEvent(opts: {
  gateway: "moolre" | "paypal" | "hubtel" | "paystack" | "manual" | "other";
  eventKey: string;
  orderNumber?: string | null;
  gatewayReference?: string | null;
  eventType?: string;
  payload?: unknown;
  amount?: number | null;
  currency?: string | null;
}): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("claim_payment_event", {
    p_gateway: opts.gateway,
    p_event_key: opts.eventKey,
    p_order_number: opts.orderNumber || null,
    p_gateway_reference: opts.gatewayReference || null,
    p_event_type: opts.eventType || "callback",
    p_payload_hash: opts.payload != null ? hashPayload(opts.payload) : null,
    p_amount: opts.amount ?? null,
    p_currency: opts.currency || null,
  });

  if (error) {
    console.error("[payment-events] claim failed:", error.message);
    // Fail open only if RPC missing (older DB); otherwise deny duplicate risk
    if (/function .*claim_payment_event.* does not exist/i.test(error.message)) {
      return true;
    }
    return false;
  }

  return data === true;
}

export async function completePaymentEvent(opts: {
  gateway: string;
  eventKey: string;
  status?: "processed" | "failed" | "ignored";
  error?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.rpc("complete_payment_event", {
    p_gateway: opts.gateway,
    p_event_key: opts.eventKey,
    p_status: opts.status || "processed",
    p_error: opts.error || null,
  });
  if (error) {
    console.error("[payment-events] complete failed:", error.message);
  }
}
