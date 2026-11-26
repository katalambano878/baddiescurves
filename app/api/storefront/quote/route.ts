import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';
import { marketOf } from '@/lib/market';
import { buildQuote } from '@/lib/server/order-pricing';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Prices a cart on the server: current unit prices and stock, delivery,
 * discount code and total. Nothing is saved. The cart, the checkout summary
 * and the code box all read from here, so they always agree with what the
 * order will charge.
 *
 * POST { items: [{ productId, variantId?, variantLabel?, quantity }],
 *        currency: 'GHS' | 'USD', deliveryMethod?, countryCode?, couponCode?, email?, phone? }
 */
export async function POST(request: Request) {
  const limit = checkRateLimit(`quote:${getClientIdentifier(request)}`, { maxRequests: 90, windowSeconds: 60 });
  if (!limit.success) {
    return NextResponse.json(
      { success: false, message: 'Too many requests. Wait a moment and try again.' },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request' }, { status: 400 });
  }

  try {
    const quote = await buildQuote(getPool(), {
      items: body?.items,
      currency: marketOf(body?.currency),
      deliveryMethod: body?.deliveryMethod,
      countryCode: body?.countryCode,
      couponCode: body?.couponCode,
      email: typeof body?.email === 'string' ? body.email : null,
      phone: typeof body?.phone === 'string' ? body.phone : null,
    });
    return NextResponse.json({ success: true, quote }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    console.error('[storefront/quote]', err?.message || err);
    return NextResponse.json(
      { success: false, message: 'We could not price your cart. Please try again.' },
      { status: 500 }
    );
  }
}
