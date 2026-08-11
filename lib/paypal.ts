/**
 * PayPal Orders API v2 helpers (server-only).
 * International customers pay in USD; Ghana uses Moolre instead.
 */

export type PayPalMode = 'sandbox' | 'live';

function paypalMode(): PayPalMode {
  const mode = (process.env.PAYPAL_MODE || 'sandbox').toLowerCase();
  return mode === 'live' ? 'live' : 'sandbox';
}

export function paypalApiBase(): string {
  return paypalMode() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

export function paypalConfigured(): boolean {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials are not configured');
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    console.error('[PayPal] Token error:', data);
    throw new Error(data.error_description || 'Failed to get PayPal access token');
  }

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return cachedToken.value;
}

async function paypalFetch(path: string, init: RequestInit = {}) {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${paypalApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export async function createPayPalOrder(opts: {
  orderNumber: string;
  amount: number;
  currency?: string;
  returnUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
}): Promise<{ id: string; approveUrl: string }> {
  const currency = (opts.currency || 'USD').toUpperCase();
  const value = Number(opts.amount).toFixed(2);

  const { res, data } = await paypalFetch('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: opts.orderNumber,
          custom_id: opts.orderNumber,
          invoice_id: opts.orderNumber,
          amount: {
            currency_code: currency,
            value,
          },
          description: `Order ${opts.orderNumber}`,
        },
      ],
      application_context: {
        brand_name: 'Baddie Curves',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: opts.returnUrl,
        cancel_url: opts.cancelUrl,
      },
      ...(opts.customerEmail
        ? {
            payer: {
              email_address: opts.customerEmail,
            },
          }
        : {}),
    }),
  });

  if (!res.ok || !data.id) {
    console.error('[PayPal] Create order failed:', data);
    throw new Error(data.message || data.error_description || 'Failed to create PayPal order');
  }

  const approveUrl = (data.links || []).find((l: any) => l.rel === 'approve')?.href;
  if (!approveUrl) {
    throw new Error('PayPal approve URL missing');
  }

  return { id: data.id, approveUrl };
}

export async function capturePayPalOrder(paypalOrderId: string): Promise<any> {
  const { res, data } = await paypalFetch(`/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    body: JSON.stringify({}),
  });

  // 422 ORDER_ALREADY_CAPTURED is OK — fetch details instead
  if (!res.ok) {
    const issue = data?.details?.[0]?.issue;
    if (issue === 'ORDER_ALREADY_CAPTURED') {
      return getPayPalOrder(paypalOrderId);
    }
    console.error('[PayPal] Capture failed:', data);
    throw new Error(data.message || 'Failed to capture PayPal payment');
  }

  return data;
}

export async function getPayPalOrder(paypalOrderId: string): Promise<any> {
  const { res, data } = await paypalFetch(`/v2/checkout/orders/${paypalOrderId}`, {
    method: 'GET',
  });
  if (!res.ok) {
    console.error('[PayPal] Get order failed:', data);
    throw new Error(data.message || 'Failed to fetch PayPal order');
  }
  return data;
}

export function extractCaptureInfo(paypalOrder: any): {
  status: string;
  captureId: string | null;
  amount: number | null;
  currency: string | null;
  customId: string | null;
} {
  const unit = paypalOrder?.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const amountRaw = capture?.amount?.value ?? unit?.amount?.value;
  return {
    status: String(paypalOrder?.status || capture?.status || ''),
    captureId: capture?.id || null,
    amount: amountRaw != null ? parseFloat(String(amountRaw)) : null,
    currency: capture?.amount?.currency_code || unit?.amount?.currency_code || null,
    customId: unit?.custom_id || unit?.invoice_id || unit?.reference_id || null,
  };
}

export function isPayPalPaymentCompleted(paypalOrder: any): boolean {
  const info = extractCaptureInfo(paypalOrder);
  const status = info.status.toUpperCase();
  return status === 'COMPLETED' || status === 'APPROVED';
}

/** Verify webhook signature via PayPal API. */
export async function verifyPayPalWebhookSignature(opts: {
  headers: Headers;
  body: string;
}): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error('[PayPal] PAYPAL_WEBHOOK_ID not set');
    return false;
  }

  const transmissionId = opts.headers.get('paypal-transmission-id');
  const transmissionTime = opts.headers.get('paypal-transmission-time');
  const certUrl = opts.headers.get('paypal-cert-url');
  const authAlgo = opts.headers.get('paypal-auth-algo');
  const transmissionSig = opts.headers.get('paypal-transmission-sig');

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return false;
  }

  let webhookEvent: unknown;
  try {
    webhookEvent = JSON.parse(opts.body);
  } catch {
    return false;
  }

  const { res, data } = await paypalFetch('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: webhookEvent,
    }),
  });

  if (!res.ok) {
    console.error('[PayPal] Webhook verify failed:', data);
    return false;
  }

  return data.verification_status === 'SUCCESS';
}
