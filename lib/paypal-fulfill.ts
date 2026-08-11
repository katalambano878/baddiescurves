import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { extractCaptureInfo, isPayPalPaymentCompleted } from '@/lib/paypal';

/**
 * Mark an order paid from a captured/completed PayPal order object.
 * Idempotent when payment_status is already paid.
 */
export async function fulfillPayPalOrder(opts: {
  orderNumber: string;
  paypalOrder: any;
}): Promise<{ success: boolean; alreadyPaid?: boolean; message: string; order?: any }> {
  const info = extractCaptureInfo(opts.paypalOrder);
  const captureStatus = String(
    opts.paypalOrder?.purchase_units?.[0]?.payments?.captures?.[0]?.status || ''
  ).toUpperCase();
  const orderStatus = info.status.toUpperCase();

  // Require a completed capture (not merely APPROVED)
  if (captureStatus !== 'COMPLETED' && orderStatus !== 'COMPLETED') {
    return {
      success: false,
      message: `PayPal payment not completed (status=${info.status || 'unknown'})`,
    };
  }

  if (!info.captureId && !isPayPalPaymentCompleted(opts.paypalOrder)) {
    return { success: false, message: 'PayPal capture id missing' };
  }

  const { data: order, error: fetchError } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, payment_status, status, total, email, currency, metadata')
    .eq('order_number', opts.orderNumber)
    .single();

  if (fetchError || !order) {
    return { success: false, message: 'Order not found' };
  }

  if (order.payment_status === 'paid') {
    return {
      success: true,
      alreadyPaid: true,
      message: 'Order already paid',
      order,
    };
  }

  if (info.amount != null && Math.abs(info.amount - Number(order.total)) > 0.01) {
    console.error(
      '[PayPal] Amount mismatch — expected',
      order.total,
      'got',
      info.amount,
      'order',
      opts.orderNumber
    );
    return { success: false, message: 'Payment amount does not match order total' };
  }

  const expectedCurrency = String(order.currency || 'USD').toUpperCase();
  if (info.currency && info.currency.toUpperCase() !== expectedCurrency) {
    console.error(
      '[PayPal] Currency mismatch — expected',
      expectedCurrency,
      'got',
      info.currency,
      'order',
      opts.orderNumber
    );
    return { success: false, message: 'Payment currency does not match order' };
  }

  const captureRef = info.captureId || opts.paypalOrder.id || 'paypal-capture';

  const { data: orderJson, error: updateError } = await supabaseAdmin.rpc('mark_order_paid', {
    order_ref: opts.orderNumber,
    moolre_ref: String(captureRef),
  });

  if (updateError) {
    console.error('[PayPal] mark_order_paid error:', updateError.message);
    return { success: false, message: 'Failed to update order' };
  }

  // Store PayPal-specific metadata alongside RPC fields
  try {
    await supabaseAdmin
      .from('orders')
      .update({
        metadata: {
          ...(order.metadata || {}),
          ...(orderJson?.metadata || {}),
          payment_method: 'paypal',
          paypal_order_id: opts.paypalOrder.id,
          paypal_capture_id: info.captureId,
          payment_verified_at:
            orderJson?.metadata?.payment_verified_at || new Date().toISOString(),
        },
        payment_method: 'paypal',
        payment_provider: 'paypal',
        payment_transaction_id: info.captureId || opts.paypalOrder.id,
      })
      .eq('id', order.id);
  } catch (metaErr: any) {
    console.warn('[PayPal] Metadata merge failed:', metaErr?.message);
  }

  if (orderJson?.email) {
    try {
      await supabaseAdmin.rpc('update_customer_stats', {
        p_customer_email: orderJson.email,
        p_order_total: orderJson.total,
      });
    } catch (statsError: any) {
      console.error('[PayPal] Customer stats failed:', statsError.message);
    }
  }

  if (orderJson) {
    try {
      await sendOrderConfirmation(orderJson);
    } catch (notifyError: any) {
      console.error('[PayPal] Notification failed:', notifyError.message);
    }
  }

  return {
    success: true,
    message: 'Payment captured and order updated',
    order: orderJson || order,
  };
}
