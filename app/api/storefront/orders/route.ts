import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { getPool } from '@/lib/db/pool';
import { verifyAccessToken } from '@/lib/db/auth';
import { marketOf } from '@/lib/market';
import { buildQuote } from '@/lib/server/order-pricing';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import {
  emptyShippingAddress,
  normalizeShippingAddress,
  validateShippingAddress,
  type ShippingAddress,
} from '@/lib/shipping-address';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Creates an order. This is the only way the storefront makes one.
 *
 * The browser sends what is in the cart, the delivery choice, the address and
 * an optional discount code. Prices, delivery, discount and total are worked
 * out here from the database (see lib/server/order-pricing.ts) and saved in
 * one transaction with the order's items.
 *
 * POST { items, currency, deliveryMethod, address, couponCode? }
 *   → 201 { success, orderNumber, total, currency }
 *   → 409 { success: false, message, problems, quote } when the cart cannot be bought as it stands
 */

const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = (length: number) =>
  Array.from({ length }, () => SAFE_CHARS[randomInt(SAFE_CHARS.length)]).join('');

function cleanAddress(raw: any): ShippingAddress {
  const base = emptyShippingAddress();
  const out: any = { ...base };
  for (const key of Object.keys(base)) {
    const value = raw?.[key];
    out[key] = typeof value === 'string' ? value.trim().slice(0, 300) : '';
  }
  out.email = out.email.toLowerCase();
  return out as ShippingAddress;
}

async function signedInUserId(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const verified = await verifyAccessToken(header.slice(7).trim()).catch(() => null);
  return verified?.userId || null;
}

export async function POST(request: Request) {
  const limit = checkRateLimit(`order:${getClientIdentifier(request)}`, { maxRequests: 10, windowSeconds: 60 });
  if (!limit.success) {
    return NextResponse.json(
      { success: false, message: 'Too many attempts. Wait a minute and try again.' },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request' }, { status: 400 });
  }

  const currency = marketOf(body?.currency);
  const isGhana = currency === 'GHS';
  const rawAddress = cleanAddress(body?.address);
  const addressErrors = validateShippingAddress(rawAddress, isGhana);
  if (Object.keys(addressErrors).length > 0) {
    return NextResponse.json(
      { success: false, message: 'Check your delivery details.', fieldErrors: addressErrors },
      { status: 400 }
    );
  }
  const address = normalizeShippingAddress(rawAddress, isGhana);
  const paymentMethod = isGhana ? 'moolre' : 'paypal';
  const couponCode = typeof body?.couponCode === 'string' ? body.couponCode : '';

  const userId = await signedInUserId(request);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const quote = await buildQuote(client, {
      items: body?.items,
      currency,
      deliveryMethod: body?.deliveryMethod,
      countryCode: address.countryCode,
      couponCode,
      email: address.email,
      phone: address.phone,
    });

    // A code the shopper typed must really apply, so nobody is charged full price by surprise.
    const problems = [...quote.problems];
    if (quote.coupon && !quote.coupon.ok) problems.push(quote.coupon.message);
    if (problems.length > 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, message: problems[0], problems, quote }, { status: 409 });
    }
    if (!(quote.total > 0)) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, message: 'This order has nothing to pay. Please contact us to place it.', quote },
        { status: 409 }
      );
    }

    // Same shape as always (ORD-<time>-<digits>), with a longer random part so numbers cannot be guessed.
    const orderNumber = `ORD-${Date.now()}-${randomInt(100000, 1000000)}`;
    const requestedDelivery = String(body?.deliveryMethod || 'pickup');
    const deliveryMethod = !isGhana
      ? 'international'
      : ['pickup', 'accra', 'outside_accra', 'doorstep'].includes(requestedDelivery)
        ? requestedDelivery
        : 'pickup';
    const metadata: Record<string, unknown> = {
      guest_checkout: !userId,
      first_name: address.firstName,
      last_name: address.lastName,
      tracking_number: `BC-${randomCode(6)}`,
      payment_method: paymentMethod,
      shipping_quote_label: quote.shipping.label,
      detected_market: isGhana ? 'GH' : 'INTL',
      ship_to_country: address.countryCode,
      priced_by: 'server',
    };
    if (quote.coupon?.ok) {
      metadata.coupon_code = quote.coupon.code;
      metadata.coupon_id = quote.coupon.couponId;
      metadata.coupon_type = quote.coupon.type;
    }

    const inserted = await client.query(
      `INSERT INTO orders (
         order_number, user_id, email, phone, status, payment_status, currency,
         subtotal, tax_total, shipping_total, discount_total, total,
         shipping_method, payment_method, shipping_address, billing_address, metadata
       ) VALUES ($1, $2, $3, $4, 'pending', 'pending', $5, $6, 0, $7, $8, $9, $10, $11, $12::jsonb, $12::jsonb, $13::jsonb)
       RETURNING id`,
      [
        orderNumber,
        userId,
        address.email,
        address.phone,
        currency,
        quote.subtotal,
        quote.shipping.amount,
        quote.discount,
        quote.total,
        deliveryMethod,
        paymentMethod,
        JSON.stringify(address),
        JSON.stringify(metadata),
      ]
    );
    const orderId: string = inserted.rows[0].id;

    for (const line of quote.lines) {
      await client.query(
        `INSERT INTO order_items (
           order_id, product_id, variant_id, product_name, variant_name, sku,
           quantity, unit_price, total_price, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
        [
          orderId,
          line.productId,
          line.variantId,
          line.name,
          line.variantLabel,
          line.sku,
          line.quantity,
          line.unitPrice,
          line.lineTotal,
          JSON.stringify({ image: line.image, slug: line.slug, preorder_shipping: line.preorderShipping }),
        ]
      );
    }

    await client.query('COMMIT');

    // Customer record: useful, but never a reason to fail an order that is already saved.
    client
      .query(`SELECT public.upsert_customer_from_order($1, $2, $3, $4, $5, $6::uuid, $7::jsonb)`, [
        address.email,
        address.phone,
        `${address.firstName} ${address.lastName}`.trim(),
        address.firstName,
        address.lastName,
        userId,
        JSON.stringify(address),
      ])
      .catch((err) => console.warn('[storefront/orders] customer upsert failed:', err?.message || err))
      .finally(() => client.release());

    return NextResponse.json(
      { success: true, orderNumber, orderId, total: quote.total, currency, paymentMethod },
      { status: 201 }
    );
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    console.error('[storefront/orders]', err?.message || err);
    return NextResponse.json(
      { success: false, message: 'We could not place your order. Nothing was charged. Please try again.' },
      { status: 500 }
    );
  }
}
