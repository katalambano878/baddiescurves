import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { createPayPalOrder, paypalConfigured } from '@/lib/paypal';

/**
 * Create a PayPal order (USD) for an unpaid store order and return the approve URL.
 * Amount is always taken from the database — never from the client.
 */
export async function POST(req: Request) {
  try {
    const clientId = getClientIdentifier(req);
    const rateLimitResult = checkRateLimit(`payment-paypal:${clientId}`, RATE_LIMITS.payment);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, message: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetIn.toString(),
          },
        }
      );
    }

    if (!paypalConfigured()) {
      console.error('[PayPal] Missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET');
      return NextResponse.json(
        { success: false, message: 'Payment gateway configuration error' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { orderId } = body;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Missing or invalid orderId' },
        { status: 400 }
      );
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, total, email, payment_status, currency, metadata, payment_method')
      .or(`id.eq.${orderId},order_number.eq.${orderId}`)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    if (order.payment_status === 'paid') {
      return NextResponse.json(
        { success: false, message: 'Order is already paid' },
        { status: 400 }
      );
    }

    const amount = Number(order.total);
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid order amount' },
        { status: 400 }
      );
    }

    const currency = String(order.currency || 'USD').toUpperCase();
    if (currency !== 'USD') {
      return NextResponse.json(
        {
          success: false,
          message: 'PayPal is only available for USD (international) orders',
        },
        { status: 400 }
      );
    }

    const orderRef = order.order_number || orderId;
    const requestUrl = new URL(req.url);
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin).replace(/\/+$/, '');

    const { id: paypalOrderId, approveUrl } = await createPayPalOrder({
      orderNumber: orderRef,
      amount,
      currency: 'USD',
      customerEmail: order.email,
      returnUrl: `${baseUrl}/order-success?order=${encodeURIComponent(orderRef)}&payment_success=true&gateway=paypal`,
      cancelUrl: `${baseUrl}/pay/${encodeURIComponent(order.id)}`,
    });

    await supabaseAdmin
      .from('orders')
      .update({
        payment_method: 'paypal',
        payment_provider: 'paypal',
        metadata: {
          ...(order.metadata || {}),
          payment_method: 'paypal',
          paypal_order_id: paypalOrderId,
        },
      })
      .eq('id', order.id);

    console.log('[PayPal] Created order', paypalOrderId, 'for', orderRef, '| amount', amount);

    return NextResponse.json({
      success: true,
      url: approveUrl,
      paypalOrderId,
    });
  } catch (error: any) {
    console.error('[PayPal] Initiate error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
