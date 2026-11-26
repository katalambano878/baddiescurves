import type { Pool, PoolClient } from 'pg';
import { getPool } from '@/lib/db/pool';
import { type Market, round2, unitPriceFor } from '@/lib/market';
import { mergeShippingRates, quoteShipping } from '@/lib/shipping';
import { evaluateCoupon, type CouponResult } from '@/lib/server/coupons';

/**
 * Server-side pricing for the cart and checkout.
 *
 * The browser only says WHAT is in the cart (product, variant, quantity) and
 * which market the shopper is in. Every amount (unit prices, shipping,
 * discount, total) is worked out here from the database, so a stale or edited
 * cart can never change what is charged.
 */

type Db = Pool | PoolClient;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CartLineInput = {
  productId: string;
  variantId?: string | null;
  /** The label shown in the cart, e.g. "Black / M". Only used to find the variant for old carts. */
  variantLabel?: string | null;
  quantity: number;
};

export type PricedLine = {
  productId: string;
  variantId: string | null;
  name: string;
  variantLabel: string | null;
  sku: string | null;
  slug: string;
  image: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** Both currencies, so the cart can show the right one if the market changes. */
  unitPriceUsd: number;
  unitPriceGhs: number;
  stock: number;
  moq: number;
  preorderShipping: string | null;
  /** Set when this line cannot be bought as it stands. */
  problem: string | null;
};

export type Quote = {
  currency: Market;
  lines: PricedLine[];
  subtotal: number;
  shipping: { amount: number; label: string };
  discount: number;
  total: number;
  coupon: CouponResult | null;
  /** Everything that stops the order, in plain words. Empty when the order can go ahead. */
  problems: string[];
};

export function cleanLines(raw: unknown): CartLineInput[] {
  if (!Array.isArray(raw)) return [];
  const out: CartLineInput[] = [];
  for (const item of raw.slice(0, 100)) {
    const productId = String(item?.productId ?? item?.id ?? '');
    if (!UUID_RE.test(productId)) continue;
    const variantId = item?.variantId && UUID_RE.test(String(item.variantId)) ? String(item.variantId) : null;
    const label = item?.variantLabel ?? item?.variant;
    const quantity = Math.floor(Number(item?.quantity));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 1000) continue;
    out.push({
      productId,
      variantId,
      variantLabel: typeof label === 'string' && label.trim() ? label.trim().slice(0, 200) : null,
      quantity,
    });
  }
  return out;
}

function variantLabelOf(v: any): string {
  const colour = String(v.option2 || '').trim();
  const name = String(v.name || '').trim();
  if (colour && name && colour !== name) return `${colour} / ${name}`;
  return colour || name || 'Variant';
}

/** Finds the variant a cart line means: by id, else by the label the storefront builds. */
function resolveVariant(line: CartLineInput, variants: any[]): any | null {
  if (line.variantId) {
    const byId = variants.find((v) => v.id === line.variantId);
    if (byId) return byId;
  }
  const label = (line.variantLabel || '').toLowerCase();
  if (!label) return null;
  const matches = variants.filter((v) => {
    const colour = String(v.option2 || '').trim().toLowerCase();
    const name = String(v.name || '').trim().toLowerCase();
    return `${colour} / ${name}` === label || (!colour && name === label) || (!name && colour === label) || variantLabelOf(v).toLowerCase() === label;
  });
  return matches.length === 1 ? matches[0] : null;
}

export async function priceLines(db: Db, inputs: CartLineInput[], market: Market): Promise<PricedLine[]> {
  if (inputs.length === 0) return [];
  const productIds = Array.from(new Set(inputs.map((l) => l.productId)));

  const [products, variants, images] = await Promise.all([
    db.query(
      `SELECT id, name, slug, sku, status, price, price_ghs, quantity, moq,
              track_quantity, continue_selling, metadata
         FROM products WHERE id = ANY($1::uuid[])`,
      [productIds]
    ),
    db.query(
      `SELECT id, product_id, name, option1, option2, sku, price, price_ghs, quantity, image_url
         FROM product_variants WHERE product_id = ANY($1::uuid[])`,
      [productIds]
    ),
    db.query(
      `SELECT DISTINCT ON (product_id) product_id, url
         FROM product_images WHERE product_id = ANY($1::uuid[])
        ORDER BY product_id, position NULLS LAST, created_at`,
      [productIds]
    ),
  ]);

  const productById = new Map(products.rows.map((p: any) => [p.id, p]));
  const imageByProduct = new Map(images.rows.map((i: any) => [i.product_id, i.url]));
  const variantsByProduct = new Map<string, any[]>();
  for (const v of variants.rows) {
    const list = variantsByProduct.get(v.product_id) || [];
    list.push(v);
    variantsByProduct.set(v.product_id, list);
  }

  return inputs.map((line) => {
    const product: any = productById.get(line.productId);
    const base = {
      productId: line.productId,
      variantId: null as string | null,
      name: product?.name || 'Item',
      variantLabel: line.variantLabel || null,
      sku: (product?.sku as string) || null,
      slug: product?.slug || '',
      image: (imageByProduct.get(line.productId) as string) || null,
      quantity: line.quantity,
      unitPrice: 0,
      lineTotal: 0,
      unitPriceUsd: 0,
      unitPriceGhs: 0,
      stock: 0,
      moq: Math.max(1, Number(product?.moq) || 1),
      preorderShipping: (product?.metadata?.preorder_shipping as string) || null,
      problem: null as string | null,
    };

    if (!product || product.status !== 'active') {
      return { ...base, problem: `${base.name} is no longer available. Remove it from your cart.` };
    }

    const productVariants = variantsByProduct.get(product.id) || [];
    let usd = Number(product.price) || 0;
    let ghs: unknown = product.price_ghs;
    let stock = Number(product.quantity) || 0;

    if (productVariants.length > 0) {
      const variant = resolveVariant(line, productVariants);
      if (!variant) {
        return {
          ...base,
          problem: `Choose the size or colour for ${product.name} again: open the product, pick it and add it to your cart.`,
        };
      }
      base.variantId = variant.id;
      base.variantLabel = variantLabelOf(variant);
      base.sku = variant.sku || base.sku;
      base.image = variant.image_url || base.image;
      usd = Number(variant.price) || 0;
      ghs = variant.price_ghs ?? product.price_ghs;
      stock = Number(variant.quantity) || 0;
    } else {
      base.variantLabel = null;
    }

    const unitPriceUsd = unitPriceFor('USD', usd, ghs);
    const unitPriceGhs = unitPriceFor('GHS', usd, ghs);
    const unitPrice = market === 'GHS' ? unitPriceGhs : unitPriceUsd;
    const priced = {
      ...base,
      unitPrice,
      unitPriceUsd,
      unitPriceGhs,
      lineTotal: round2(unitPrice * line.quantity),
      stock,
    };

    if (!(unitPrice > 0)) {
      return {
        ...priced,
        problem:
          market === 'USD'
            ? `${product.name} is not available outside Ghana yet. Remove it from your cart to continue.`
            : `${product.name} has no price yet. Remove it from your cart to continue.`,
      };
    }

    const stockLimited = product.track_quantity !== false && product.continue_selling !== true;
    if (stockLimited && stock <= 0) {
      return { ...priced, problem: `${product.name}${priced.variantLabel ? ` (${priced.variantLabel})` : ''} is sold out.` };
    }
    if (stockLimited && line.quantity > stock) {
      return {
        ...priced,
        problem: `Only ${stock} of ${product.name}${priced.variantLabel ? ` (${priced.variantLabel})` : ''} left. Lower the quantity.`,
      };
    }
    if (line.quantity < priced.moq) {
      return { ...priced, problem: `${product.name} has a minimum order of ${priced.moq}.` };
    }
    return priced;
  });
}

export async function buildQuote(
  db: Db,
  input: {
    items: unknown;
    currency: Market;
    deliveryMethod?: string | null;
    countryCode?: string | null;
    couponCode?: string | null;
    email?: string | null;
    phone?: string | null;
  }
): Promise<Quote> {
  const market = input.currency;
  const lines = await priceLines(db, cleanLines(input.items), market);
  const problems = lines.map((l) => l.problem).filter((p): p is string => !!p);
  if (lines.length === 0) problems.push('Your cart is empty.');

  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));

  const settings = await db.query(`SELECT value FROM site_settings WHERE key = 'shipping_rates' LIMIT 1`);
  const rates = mergeShippingRates(settings.rows[0]?.value);
  const isGhana = market === 'GHS';
  const deliveryMethod = isGhana
    ? ['pickup', 'accra', 'outside_accra', 'doorstep'].includes(String(input.deliveryMethod))
      ? String(input.deliveryMethod)
      : 'pickup'
    : 'international';
  const shippingQuote = quoteShipping({
    isGhana,
    deliveryMethod,
    countryCode: input.countryCode || undefined,
    rates,
  });
  const shippingAmount = round2(shippingQuote.amount);

  let coupon: CouponResult | null = null;
  let discount = 0;
  const code = (input.couponCode || '').trim();
  if (code) {
    coupon = await evaluateCoupon(db, {
      code,
      currency: market,
      subtotal,
      shipping: shippingAmount,
      email: input.email || null,
      phone: input.phone || null,
    });
    if (coupon.ok) discount = coupon.discount;
  }

  const total = round2(Math.max(0, subtotal + shippingAmount - discount));

  return {
    currency: market,
    lines,
    subtotal,
    shipping: { amount: shippingAmount, label: shippingQuote.label },
    discount,
    total,
    coupon,
    problems,
  };
}

export function quoteDb(): Pool {
  return getPool();
}
