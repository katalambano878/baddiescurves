import { NextResponse } from 'next/server';
import {
  capturePayPalOrder,
  getPayPalOrder,
  paypalConfigured,
  verifyPayPalWebhookSignature,
} from '@/lib/paypal';
import { fulfillPayPalOrder } from '@/lib/paypal-fulfill';

/**
 * PayPal webhook: PAYMENT.CAPTURE.COMPLETED / CHECKOUT.ORDER.APPROVED
 */
export async function POST(req: Request) {
  try {
    if (!paypalConfigured()) {
      return NextResponse.json({ success: false }, { status: 503 });
    }

    const rawBody = await req.text();

    const verified = await verifyPayPalWebhookSignature({
      headers: req.headers,
      body: rawBody,
    });

    if (!verified) {
      console.error('[PayPal Webhook] Signature verification failed');
      return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBody);
    const eventType = String(event.event_type || '');
    console.log('[PayPal Webhook] Event:', eventType, event.id);

    // Prefer capture-completed; also handle order approved by fetching full order
    let paypalOrderId: string | null = null;
    let orderNumber: string | null = null;

    if (eventType === 'CHECKOUT.ORDER.APPROVED' || eventType === 'CHECKOUT.ORDER.COMPLETED') {
      paypalOrderId = event.resource?.id || null;
      orderNumber =
        event.resource?.purchase_units?.[0]?.custom_id ||
        event.resource?.purchase_units?.[0]?.invoice_id ||
        null;
    } else if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const capture = event.resource;
      orderNumber =
        capture?.custom_id ||
        capture?.invoice_id ||
        capture?.supplementary_data?.related_ids?.order_id ||
        null;
      paypalOrderId =
        capture?.supplementary_data?.related_ids?.order_id ||
        capture?.links?.find((l: any) => String(l.rel).includes('up'))?.href?.split('/').pop() ||
        null;
    } else {
      // Acknowledge unused events
      return NextResponse.json({ success: true, ignored: true });
    }

    if (!paypalOrderId && !orderNumber) {
      console.warn('[PayPal Webhook] Missing order identifiers');
      return NextResponse.json({ success: true, ignored: true });
    }

    let paypalOrder: any = null;
    if (paypalOrderId) {
      try {
        // Capture if needed (APPROVED), otherwise fetch current state
        if (eventType === 'CHECKOUT.ORDER.APPROVED') {
          paypalOrder = await capturePayPalOrder(paypalOrderId);
        } else {
          paypalOrder = await getPayPalOrder(paypalOrderId);
        }
        orderNumber =
          orderNumber ||
          paypalOrder?.purchase_units?.[0]?.custom_id ||
          paypalOrder?.purchase_units?.[0]?.invoice_id ||
          null;
      } catch (e: any) {
        console.error('[PayPal Webhook] Could not fetch/capture order:', e.message);
        try {
          paypalOrder = await getPayPalOrder(paypalOrderId);
        } catch {
          /* ignore */
        }
      }
    }

    if (!orderNumber || !paypalOrder) {
      console.warn('[PayPal Webhook] Unable to resolve store order');
      return NextResponse.json({ success: true, pending: true });
    }

    const result = await fulfillPayPalOrder({
      orderNumber,
      paypalOrder,
    });

    console.log('[PayPal Webhook] Fulfill result:', result.message);
    return NextResponse.json({ success: result.success, message: result.message });
  } catch (error: any) {
    console.error('[PayPal Webhook] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
  }
}
