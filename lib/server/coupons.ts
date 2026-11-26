import type { Pool, PoolClient } from 'pg';
import { type Market, round2 } from '@/lib/market';

/**
 * Coupon rules, checked on the server every time a cart is priced and again
 * when the order is created.
 *
 * Amount fields come in two currencies because the shop sells in two:
 *   value / minimum_purchase / maximum_discount   → cedis (GH₵)
 *   metadata.value_usd / minimum_purchase_usd / maximum_discount_usd → dollars
 * A percentage `value` is the same in both markets.
 * metadata.markets = 'all' | 'GHS' | 'USD' says where the code works.
 */

type Db = Pool | PoolClient;

export type CouponResult = {
  ok: boolean;
  code: string;
  /** Shown to the shopper: why it did not apply, or what it gave. */
  message: string;
  couponId: string | null;
  type: 'percentage' | 'fixed_amount' | 'free_shipping' | null;
  discount: number;
};

const fail = (code: string, message: string): CouponResult => ({
  ok: false,
  code,
  message,
  couponId: null,
  type: null,
  discount: 0,
});

const symbol = (market: Market) => (market === 'GHS' ? 'GH₵' : '$');
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function normalizeCouponCode(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export async function evaluateCoupon(
  db: Db,
  input: {
    code: string;
    currency: Market;
    subtotal: number;
    shipping: number;
    email: string | null;
    phone: string | null;
  }
): Promise<CouponResult> {
  const code = normalizeCouponCode(input.code);
  if (!code || code.length > 40) return fail(code, 'Enter a discount code.');

  const res = await db.query(`SELECT * FROM coupons WHERE upper(code) = $1 LIMIT 1`, [code]);
  const coupon = res.rows[0];
  if (!coupon) return fail(code, 'That code is not valid. Check the spelling and try again.');

  const meta = coupon.metadata || {};
  const now = Date.now();

  if (coupon.is_active === false) return fail(code, 'That code is no longer active.');
  if (coupon.start_date && new Date(coupon.start_date).getTime() > now) {
    return fail(code, 'That code is not active yet.');
  }
  if (coupon.end_date && new Date(coupon.end_date).getTime() < now) {
    return fail(code, 'That code has expired.');
  }
  if (coupon.usage_limit != null && Number(coupon.usage_count || 0) >= Number(coupon.usage_limit)) {
    return fail(code, 'That code has been used up.');
  }

  const markets = String(meta.markets || 'all').toUpperCase();
  if (markets !== 'ALL' && markets !== input.currency) {
    return fail(
      code,
      markets === 'GHS'
        ? 'That code only works for orders in Ghana.'
        : 'That code only works for orders outside Ghana.'
    );
  }

  const inCedis = input.currency === 'GHS';
  const minimum = inCedis ? num(coupon.minimum_purchase) : num(meta.minimum_purchase_usd);
  if (minimum != null && minimum > 0 && input.subtotal < minimum) {
    return fail(code, `That code needs an order of at least ${symbol(input.currency)}${minimum.toFixed(2)}.`);
  }

  // How many times this shopper has already paid for an order with this code.
  if (coupon.per_user_limit != null && (input.email || input.phone)) {
    const used = await db.query(
      `SELECT count(*)::int AS n FROM orders
        WHERE metadata->>'coupon_code' = $1
          AND payment_status = 'paid'
          AND ( ($2::text IS NOT NULL AND lower(email) = lower($2))
             OR ($3::text IS NOT NULL AND phone = $3) )`,
      [code, input.email || null, input.phone || null]
    );
    if ((used.rows[0]?.n ?? 0) >= Number(coupon.per_user_limit)) {
      return fail(code, 'You have already used that code.');
    }
  }

  let discount = 0;
  let message = '';

  if (coupon.type === 'percentage') {
    const pct = num(coupon.value) ?? 0;
    if (!(pct > 0) || pct > 100) return fail(code, 'That code is not set up correctly. Please contact us.');
    discount = round2((input.subtotal * pct) / 100);
    const cap = inCedis ? num(coupon.maximum_discount) : num(meta.maximum_discount_usd);
    if (cap != null && cap > 0 && discount > cap) discount = round2(cap);
    message = `${code}: ${pct}% off`;
  } else if (coupon.type === 'fixed_amount') {
    const amount = inCedis ? num(coupon.value) : num(meta.value_usd);
    if (amount == null || !(amount > 0)) {
      return fail(
        code,
        inCedis ? 'That code only works for orders outside Ghana.' : 'That code only works for orders in Ghana.'
      );
    }
    discount = round2(amount);
    message = `${code}: ${symbol(input.currency)}${amount.toFixed(2)} off`;
  } else if (coupon.type === 'free_shipping') {
    discount = round2(input.shipping);
    message = `${code}: free delivery`;
  } else {
    return fail(code, 'That code is not set up correctly. Please contact us.');
  }

  // A discount never exceeds what it applies to.
  const ceiling = coupon.type === 'free_shipping' ? input.shipping : input.subtotal;
  discount = Math.max(0, Math.min(discount, round2(ceiling)));

  return { ok: true, code, message, couponId: coupon.id, type: coupon.type, discount };
}
