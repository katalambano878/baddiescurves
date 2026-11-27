import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getPool } from '@/lib/db/pool';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Admin Sales management endpoint.
 *
 * GET  → { salesActive, products: [...] } for the Sales page.
 *
 * POST body (one of):
 *   { action: 'apply',  mode: 'percentage', value: <1-99>,  productIds: string[] }
 *   { action: 'apply',  mode: 'fixed',      value: <price>, productIds: string[], currency?: 'GHS' | 'USD' }
 *   { action: 'remove',                                     productIds: string[] }
 *   { action: 'variant_prices', items: [{ variantId, price }], currency?: 'GHS' | 'USD' }
 *   { action: 'set_active', active: boolean }                       // every sale on or off
 *   { action: 'set_markets', markets: 'all' | 'USD' | 'GHS' }       // who sees sale prices
 *   { action: 'set_product_active', active: boolean, productIds }   // chosen products on or off
 *
 * This shop sells in cedis and dollars. A percentage moves both prices. A
 * fixed price is typed in one currency (cedis unless the product has no cedi
 * price) and the other currency drops by the same proportion.
 *
 * Each product's sale has its own on/off state. A switched-off sale keeps its
 * sale prices in metadata.paused_sale_price(_ghs). Changing a sale keeps that
 * state: a switched-off sale stays off, and a new sale starts off while the
 * all-sales switch is off.
 *
 * All price maths runs in SQL functions (see the sales_manager migration), in
 * one transaction per request, from the regular prices held in the database.
 */

const MAX_IDS = 2000;
const SALES_ACTIVE_KEY = 'sales_active';
/** Who sees sale prices: "all", "USD" (outside Ghana only) or "GHS" (Ghana only). */
const SALES_MARKETS_KEY = 'sales_markets';

function marketsOf(v: unknown): 'all' | 'USD' | 'GHS' {
    const s = String(v ?? '').toUpperCase();
    return s === 'USD' ? 'USD' : s === 'GHS' ? 'GHS' : 'all';
}

const PRODUCT_ROWS_SQL = `
  SELECT p.id, p.name, p.slug, p.status, p.on_sale, p.metadata,
         p.price, p.compare_at_price, p.price_ghs, p.compare_at_price_ghs,
         c.name AS category,
         (SELECT i.url FROM product_images i
           WHERE i.product_id = p.id
           ORDER BY i.position NULLS LAST, i.created_at
           LIMIT 1) AS image,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'id', v.id, 'name', v.name, 'option1', v.option1, 'option2', v.option2,
                    'price', v.price, 'compare_at_price', v.compare_at_price,
                    'price_ghs', v.price_ghs, 'compare_at_price_ghs', v.compare_at_price_ghs,
                    'paused_sale_price', v.metadata->'paused_sale_price',
                    'paused_sale_price_ghs', v.metadata->'paused_sale_price_ghs')
                  ORDER BY v.option2 NULLS FIRST, v.created_at, v.name)
           FROM product_variants v WHERE v.product_id = p.id
         ), '[]'::jsonb) AS variants
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
`;

function isUuid(v: unknown): v is string {
    return typeof v === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function currencyOf(v: unknown): 'GHS' | 'USD' {
    return String(v || '').toUpperCase() === 'USD' ? 'USD' : 'GHS';
}

async function productRows(productIds: string[]) {
    if (productIds.length === 0) return [];
    const res = await getPool().query(`${PRODUCT_ROWS_SQL} WHERE p.id = ANY($1::uuid[])`, [productIds]);
    return res.rows;
}

/** One atomic database call that changes the sale and keeps each product's on/off state. */
async function changeKeepingState(args: {
    action: 'percentage' | 'fixed' | 'remove' | 'variant_prices';
    ids?: string[];
    value?: number;
    items?: unknown;
    currency?: 'GHS' | 'USD';
}): Promise<{ result: any; productIds: string[]; paused: number }> {
    const res = await getPool().query(
        `SELECT public.sale_change_keep_state($1, $2::uuid[], $3::numeric, $4::jsonb, $5) AS result`,
        [
            args.action,
            args.ids ?? null,
            args.value ?? null,
            args.items != null ? JSON.stringify(args.items) : null,
            args.currency ?? 'GHS',
        ],
    );
    const result = res.rows[0]?.result || {};
    return {
        result,
        productIds: Array.isArray(result.product_ids) ? result.product_ids : args.ids || [],
        paused: Number(result.paused) || 0,
    };
}

async function requireAdmin(request: Request) {
    const auth = await verifyAuth(request, { requireAdmin: true });
    if (auth.authenticated) return null;
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
}

export async function GET(request: Request) {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    try {
        const pool = getPool();
        const [products, settings] = await Promise.all([
            pool.query(`${PRODUCT_ROWS_SQL} ORDER BY p.created_at DESC LIMIT 5000`),
            pool.query(`SELECT key, value FROM site_settings WHERE key = ANY($1::text[])`, [
                [SALES_ACTIVE_KEY, SALES_MARKETS_KEY],
            ]),
        ]);
        const byKey = new Map(settings.rows.map((r: any) => [r.key, r.value]));
        const active = byKey.get(SALES_ACTIVE_KEY);
        // No row yet means ON.
        const salesActive = !byKey.has(SALES_ACTIVE_KEY) ? true : active === true || active === 'true';
        return NextResponse.json({
            success: true,
            salesActive,
            salesMarkets: marketsOf(byKey.get(SALES_MARKETS_KEY)),
            products: products.rows,
        });
    } catch (err: any) {
        console.error('[admin/sales] load error:', err?.message || err);
        return NextResponse.json({ error: err?.message || 'Failed to load products' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const denied = await requireAdmin(request);
    if (denied) return denied;

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const action = String(body?.action || '');
    const currency = currencyOf(body?.currency);

    const errorResponse = (err: any, fallback: string) => {
        console.error(`[admin/sales] ${action} error:`, err?.message || err);
        return NextResponse.json({ error: err?.message || fallback }, { status: 500 });
    };

    // Every sale on or off at once. Prices and the setting change together.
    if (action === 'set_active') {
        const active = body?.active === true;
        const client = await getPool().connect();
        try {
            await client.query('BEGIN');
            const res = await client.query(
                active
                    ? `SELECT public.resume_product_sales() AS result`
                    : `SELECT public.pause_product_sales() AS result`,
            );
            await client.query(
                `INSERT INTO site_settings (key, value, category, updated_at)
                 VALUES ($1, $2::jsonb, 'sales', now())
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
                [SALES_ACTIVE_KEY, JSON.stringify(active)],
            );
            await client.query('COMMIT');
            return NextResponse.json({ success: true, action, active, result: res.rows[0]?.result });
        } catch (err: any) {
            await client.query('ROLLBACK').catch(() => {});
            return errorResponse(err, 'Failed to switch sales');
        } finally {
            client.release();
        }
    }

    // Who sees sale prices: everyone, outside Ghana only, or Ghana only. The
    // setting and every sale price change together.
    if (action === 'set_markets') {
        const raw = String(body?.markets ?? '').toUpperCase();
        if (!['ALL', 'USD', 'GHS'].includes(raw)) {
            return NextResponse.json({ error: 'Choose everyone, outside Ghana or Ghana' }, { status: 400 });
        }
        const markets = marketsOf(raw);
        const client = await getPool().connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `INSERT INTO site_settings (key, value, category, updated_at)
                 VALUES ($1, $2::jsonb, 'sales', now())
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
                [SALES_MARKETS_KEY, JSON.stringify(markets)],
            );
            const res = await client.query(`SELECT public.sale_enforce_markets() AS result`);
            await client.query('COMMIT');
            return NextResponse.json({ success: true, action, markets, result: res.rows[0]?.result });
        } catch (err: any) {
            await client.query('ROLLBACK').catch(() => {});
            return errorResponse(err, 'Could not change who sees sale prices');
        } finally {
            client.release();
        }
    }

    // Each variant gets its own sale price.
    if (action === 'variant_prices') {
        const rawItems: unknown = body?.items;
        if (!Array.isArray(rawItems) || rawItems.length === 0) {
            return NextResponse.json({ error: 'No variant prices provided' }, { status: 400 });
        }
        if (rawItems.length > MAX_IDS) {
            return NextResponse.json({ error: `Too many variants in one request (max ${MAX_IDS}).` }, { status: 400 });
        }
        const items = rawItems
            .map((it: any) => ({
                variant_id: it?.variantId,
                price: Math.round(Number(it?.price) * 100) / 100,
            }))
            .filter((it) => isUuid(it.variant_id) && Number.isFinite(it.price) && it.price > 0);
        if (items.length === 0) {
            return NextResponse.json({ error: 'No valid variant prices' }, { status: 400 });
        }

        try {
            const change = await changeKeepingState({ action: 'variant_prices', items, currency });
            const updated = change.result?.variants_updated ?? 0;
            return NextResponse.json({
                success: true,
                action,
                result: change.result,
                products: await productRows(change.productIds),
                paused: change.paused,
                skipped: items.length - updated,
            });
        } catch (err: any) {
            return errorResponse(err, 'Failed to set variant sale prices');
        }
    }

    const rawIds: unknown = body?.productIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
        return NextResponse.json({ error: 'No products selected' }, { status: 400 });
    }
    if (rawIds.length > MAX_IDS) {
        return NextResponse.json(
            { error: `Too many products in one request (max ${MAX_IDS}). Apply in smaller batches.` },
            { status: 400 },
        );
    }
    const productIds = Array.from(new Set(rawIds.filter(isUuid)));
    if (productIds.length === 0) {
        return NextResponse.json({ error: 'No valid product IDs' }, { status: 400 });
    }

    // Chosen products on or off, whatever the all-sales switch says.
    if (action === 'set_product_active') {
        const active = body?.active === true;
        try {
            const res = await getPool().query(
                active
                    ? `SELECT public.resume_product_sales($1::uuid[]) AS result`
                    : `SELECT public.pause_product_sales($1::uuid[]) AS result`,
                [productIds],
            );
            return NextResponse.json({
                success: true,
                action,
                active,
                result: res.rows[0]?.result,
                products: await productRows(productIds),
            });
        } catch (err: any) {
            return errorResponse(err, 'Failed to switch the sale');
        }
    }

    if (action === 'remove') {
        try {
            const { result } = await changeKeepingState({ action: 'remove', ids: productIds });
            return NextResponse.json({ success: true, action, result, products: await productRows(productIds) });
        } catch (err: any) {
            return errorResponse(err, 'Failed to update sales');
        }
    }

    if (action !== 'apply') {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const mode = String(body?.mode || '');
    const value = Number(body?.value);
    if (!Number.isFinite(value)) {
        return NextResponse.json({ error: 'Invalid value' }, { status: 400 });
    }
    if (mode !== 'percentage' && mode !== 'fixed') {
        return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    }
    if (mode === 'percentage' && (value <= 0 || value >= 100)) {
        return NextResponse.json({ error: 'Discount percent must be between 1 and 99' }, { status: 400 });
    }
    if (mode === 'fixed' && value <= 0) {
        return NextResponse.json({ error: 'Sale price must be greater than 0' }, { status: 400 });
    }

    try {
        const change = await changeKeepingState({
            action: mode,
            ids: productIds,
            value: mode === 'percentage' ? value : Math.round(value * 100) / 100,
            currency,
        });
        const updated = change.result?.products_updated ?? 0;
        return NextResponse.json({
            success: true,
            action,
            mode,
            result: change.result,
            products: await productRows(productIds),
            paused: change.paused,
            skipped: mode === 'fixed' ? productIds.length - updated : 0,
        });
    } catch (err: any) {
        return errorResponse(err, 'Failed to update sales');
    }
}
