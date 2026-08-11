import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { capturePayPalOrder, getPayPalOrder, paypalConfigured } from '@/lib/paypal';
import { fulfillPayPalOrder } from '@/lib/paypal-fulfill';

/**
 * Capture (or confirm) a PayPal order after the buyer returns from PayPal.
 * Body: { orderNumber: string, paypalOrderId?: string }
 */
export async function POST(req: Request) {
  try {
    const clientId = getClientIdentifier(req);
    const rateLimitResult = checkRateLimit(`paypal-capture:${clientId}`, RATE_LIMITS.payment);

    if (!rateLimitResult.success) {
      return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
    }

    if (!paypalConfigured()) {
      return NextResponse.json(
        { success: false, message: 'Payment verification unavailable' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { orderNumber, paypalOrderId: bodyPaypalId } = body;

    if (!orderNumber || typeof orderNumber !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Missing or invalid orderNumber' },
        { status: 400 }
      );
    }

    if (!/^ORD-\d+-\d+$/.test(orderNumber)) {
      return NextResponse.json(
        { success: false, message: 'Invalid order number format' },
        { status: 400 }
      );
    }

    const { data: order, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, payment_status, status, total, email, currency, metadata')
      .eq('order_number', orderNumber)
      .single();

    if (fetchError || !order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    if (order.payment_status === 'paid') {
      return NextResponse.json({
        success: true,
        status: order.status,
        payment_status: 'paid',
        message: 'Order already paid',
      });
    }

    const paypalOrderId =
      (typeof bodyPaypalId === 'string' && bodyPaypalId) ||
      order.metadata?.paypal_order_id;

    if (!paypalOrderId) {
      return NextResponse.json(
        { success: false, message: 'No PayPal order linked to this order' },
        { status: 400 }
      );
    }

    let paypalOrder: any;
    try {
      paypalOrder = await capturePayPalOrder(paypalOrderId);
    } catch (captureErr: any) {
      // Fallback: read current status (may already be captured via webhook)
      console.warn('[PayPal] Capture attempt failed, fetching order:', captureErr.message);
      paypalOrder = await getPayPalOrder(paypalOrderId);
    }

    const result = await fulfillPayPalOrder({
      orderNumber,
      paypalOrder,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          status: order.status,
          payment_status: order.payment_status,
          message: result.message,
        },
        { status: result.message.includes('amount') || result.message.includes('currency') ? 400 : 200 }
      );
    }

    return NextResponse.json({
      success: true,
      status: 'processing',
      payment_status: 'paid',
      message: result.message,
    });
  } catch (error: any) {
    console.error('[PayPal] Capture route error:', error);
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
  }
}
